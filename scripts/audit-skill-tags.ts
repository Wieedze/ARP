/** What ARP actually asserts about each skill, read from the chain, against what it should.
 *
 *      ARP_TARGET=testnet bun run scripts/audit-skill-tags.ts
 *      ARP_TARGET=testnet bun run scripts/audit-skill-tags.ts --json /tmp/retire.json
 *
 *  Read-only against the **indexer**, not the RPC — a different host, so it costs nothing from the
 *  byte quota ADR `0079` records. Plans redeems; signs nothing and sends nothing (ADR `0038`).
 *
 *  ## Why this reads the chain instead of replaying the table
 *
 *  296 tags were written on 2026-10-29 by a keyword table whose ordering was wrong, and 101 of them
 *  are tags the corrected table would not write. Reconstructing which ones from the old table would
 *  work and would be the wrong instinct: **what ARP asserts is what it holds a position on**, and
 *  the only authority on that is the chain. A script that audits its own memory of what it wrote
 *  cannot find a write it forgot.
 *
 *  ## What a retraction is here
 *
 *  Intuition has no deletion, so a wrong triple is permanent. But ARP's index is not the set of
 *  triples — it is the set of triples **this attestor holds shares in**, which is how the whole
 *  domain tree is scoped (`packages/protocol/src/domains.ts`, `shares: {_gt: "0"}`). Redeeming the
 *  position removes the claim from the index and returns the stake less the exit fee. The triple
 *  stays, unowned and unasserted, which is the honest record: ARP said it, then stopped.
 *
 *  That is the user's own mechanism, 2026-10-28: _« on crée ou on se positionne … et ça nous permet
 *  de faire le scope des domaines existants dans ARP »_. A position is the revision mechanism, and
 *  it is why a tag was allowed on chain in the first place.
 */
import {writeFileSync} from "node:fs";

import {formatEther, getAddress, type Hex} from "viem";

import measured from "../measurements/skill-domains-2026-10-29.json";
import {encodeRedeem, multiVaultReads} from "../packages/protocol/src/declare/index.js";
import {HAS_TAG} from "../packages/protocol/src/sources/intuition/terms.js";
import {classifySkill} from "./skill-domains-table.js";

const TARGETS = {
    mainnet: {chainId: 1155, graphql: "https://mainnet.intuition.sh/v1/graphql"},
    testnet: {chainId: 13579, graphql: "https://testnet.intuition.sh/v1/graphql"},
} as const;

/** Positions this attestor holds on a `has tag` triple whose object is one of our domains. */
const HELD_TAGS = `query($who: String!, $pid: String!, $limit: Int!, $offset: Int!) {
  positions(
    where: {
      account_id: {_eq: $who}
      shares: {_gt: "0"}
      term: {triple: {predicate_id: {_eq: $pid}}}
    }
    limit: $limit
    offset: $offset
    order_by: {term_id: asc}
  ) {
    shares
    term_id
    term { triple { subject { term_id label } object { term_id label } } }
  }
  positions_aggregate(
    where: {
      account_id: {_eq: $who}
      shares: {_gt: "0"}
      term: {triple: {predicate_id: {_eq: $pid}}}
    }
  ) { aggregate { count } }
}`;

function arg(name: string): string | undefined {
    const index = process.argv.indexOf(`--${name}`);
    return index === -1 ? undefined : process.argv[index + 1];
}

const targetName = (process.env["ARP_TARGET"] ?? "testnet") as keyof typeof TARGETS;
const target = TARGETS[targetName];
if (target === undefined) {
    console.error(`ARP_TARGET must be one of ${Object.keys(TARGETS).join(", ")}`);
    process.exit(1);
}

const rawAttestor = process.env["ARP_DOMAIN_ATTESTOR"] ?? process.env["AGENT_ADDRESS"];
if (rawAttestor === undefined || !/^0x[0-9a-fA-F]{40}$/.test(rawAttestor)) {
    console.error("AGENT_ADDRESS (or ARP_DOMAIN_ATTESTOR) must be the 0x address holding the positions.");
    process.exit(1);
}
// Lowercase matched nothing once — the indexer stores the checksummed form.
const attestor = getAddress(rawAttestor);

type Held = {
    shares: string;
    term_id: string;
    term: {triple: {subject: {term_id: string; label: string}; object: {term_id: string; label: string}} | null} | null;
};

/**
 * The indexer **caps a page at 100** whatever `limit` asks for.
 *
 * Asking for 200 and stopping when a page is shorter than 200 therefore stops after the first
 * page, silently, with a sixth of the rows: it reported 100 positions where
 * `positions_aggregate` counts 678. The aggregate is what caught it, and asking for a count
 * alongside a list is now the habit — a paginated read that cannot be wrong about its own total.
 */
const PAGE = 100;
const held: Held[] = [];
for (let offset = 0; ; offset += PAGE) {
    const response = await fetch(target.graphql, {
        method: "POST",
        headers: {"content-type": "application/json"},
        body: JSON.stringify({
            query: HELD_TAGS,
            variables: {who: attestor, pid: HAS_TAG, limit: PAGE, offset},
        }),
        signal: AbortSignal.timeout(30000),
    });
    const body = (await response.json()) as {
        data?: {positions: Held[]; positions_aggregate?: {aggregate: {count: number}}};
        errors?: {message: string}[];
    };
    if (body.errors !== undefined) {
        console.error(`indexer: ${body.errors[0]?.message}`);
        process.exit(1);
    }
    const page = body.data?.positions ?? [];
    held.push(...page);
    const total = body.data?.positions_aggregate?.aggregate.count;
    if (page.length === 0 || (total !== undefined && held.length >= total)) break;
    if (page.length < PAGE) break;
}

console.log(`chain        ${target.chainId} (${targetName})`);
console.log(`attestor     ${attestor}`);
console.log(`has tag      ${held.length} positions held\n`);

// What the corrected table says each skill's domain is, keyed by the skill atom's label — which is
// the normalised URL without its scheme, because that is what `toolThing` puts in `name`.
type Row = {repo: string; skill: string; description: string};
const wanted = new Map<string, string | null>();
for (const row of (measured as {rows: Row[]}).rows) {
    const label = `github.com/${row.repo}?skill=${encodeURIComponent(row.skill)}`;
    wanted.set(label, classifySkill(row.skill, row.description));
}

const keep: Held[] = [];
const retire: {held: Held; subject: string; was: string; should: string}[] = [];
let foreign = 0;

for (const position of held) {
    const triple = position.term?.triple;
    if (triple === undefined || triple === null) continue;
    const subject = triple.subject.label;
    const should = wanted.get(subject);
    if (should === undefined) {
        // A tag on something that is not a catalogued skill — the 53 repositories' own domain tags
        // and the `maintained` edges. Not this script's business.
        foreign += 1;
        continue;
    }
    if (should === triple.object.label) keep.push(position);
    else retire.push({held: position, subject, was: triple.object.label, should: should ?? "— nothing"});
}

console.log(`${keep.length} positions agree with the corrected table`);
console.log(`${retire.length} do not and would be retired`);
console.log(`${foreign} are on something other than a catalogued skill and are left alone\n`);

const moves = new Map<string, number>();
for (const row of retire) moves.set(`${row.was} → ${row.should}`, (moves.get(`${row.was} → ${row.should}`) ?? 0) + 1);
for (const [move, count] of [...moves].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(count).padStart(3)}  ${move}`);
}

if (retire.length === 0) {
    console.log("\nnothing to retire — every position ARP holds matches the table.");
    process.exit(0);
}

const record = (await import(`../deployments/${target.chainId}.json`)) as {
    default: {intuition: {multiVault: string}; chain: {rpcUrl: string}};
};
const multiVault = record.default.intuition.multiVault as Hex;
const {createPublicClient, http} = await import("viem");
const client = createPublicClient({
    transport: http(
        process.env["INTUITION_RPC_URL"] ??
            process.env["INTUITION_TESTNET_RPC_URL"] ??
            record.default.chain.rpcUrl,
    ),
});
const curveId = await multiVaultReads({address: multiVault, chainId: target.chainId, client}).defaultCurveId();

const calls = retire.map((row) => ({
    kind: "redeem",
    chainId: target.chainId,
    to: multiVault,
    // Redeem is NOT payable. A value here would be sending TRUST to collect TRUST.
    value: "0",
    data: encodeRedeem(attestor, row.held.term_id as Hex, curveId, BigInt(row.held.shares), 0n),
    why: `stop asserting ${row.subject} is ${row.was}`,
}));

const recovered = retire.reduce((sum, row) => sum + BigInt(row.held.shares), 0n);
console.log(`\n${calls.length} redeems · about ${formatEther(recovered)} tTRUST of shares, less the exit fee`);

const jsonPath = arg("json");
if (jsonPath === undefined) {
    console.log("\npass --json <path> to write the plan, then send it with send-plan-in-waves.sh");
} else {
    writeFileSync(jsonPath, JSON.stringify(calls, null, 2));
    console.log(`\nplan written to ${jsonPath}`);
}

// A module, not a global script — see the note in scripts/measure/predicate-objects.ts.
export {};
