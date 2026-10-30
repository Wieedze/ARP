/** Write `data/catalogue/skills-<chainId>.json` — the record of what ARP put on chain for the skills.
 *
 *      ARP_TARGET=testnet bun run scripts/seed/record-skills-catalogue.ts
 *
 *  Read-only against the **indexer**, so it costs nothing from the RPC's byte quota (ADR `0079`).
 *  Signs nothing.
 *
 *  ## Why a record at all, when the ids are re-derivable
 *
 *  Every id here is a pure function of a URL or a word (ADR `0077`, `0054`), so a reader can
 *  recompute the whole set with no credential and no network. That is the design and it is why this
 *  file is *not* a source of truth.
 *
 *  What is **not** re-derivable is which of them ARP actually wrote, when, at what price, and what
 *  it later withdrew. 203 tags were retired on 2026-10-29 because a keyword table ordered general
 *  before specific; nothing in the id scheme records that they were ever asserted. The chain does,
 *  and this file is the readable form of that.
 *
 *  `domain-tree-13579.json` and `registered-13579.json` are the same thing for earlier seeds.
 */
import {writeFileSync} from "node:fs";

import {getAddress} from "viem";

import measured from "../../data/measurements/skill-domains-2026-10-29.json";
import {HAS_TAG} from "../../packages/protocol/src/sources/intuition/terms.js";
import {classifySkill} from "../helpers/skill-domains-table.js";

const TARGETS = {
    mainnet: {chainId: 1155, graphql: "https://mainnet.intuition.sh/v1/graphql"},
    testnet: {chainId: 13579, graphql: "https://testnet.intuition.sh/v1/graphql"},
} as const;

/** The indexer caps a page at 100 whatever `limit` asks for — see `audit-skill-tags.ts`. */
const PAGE = 100;

const HELD = `query($who: String!, $pid: String!, $limit: Int!, $offset: Int!) {
  positions(
    where: {account_id: {_eq: $who}, shares: {_gt: "0"}, term: {triple: {predicate_id: {_eq: $pid}}}}
    limit: $limit
    offset: $offset
    order_by: {term_id: asc}
  ) {
    term_id
    term { triple { subject { term_id label } object { label } } }
  }
}`;

const targetName = (process.env["ARP_TARGET"] ?? "testnet") as keyof typeof TARGETS;
const target = TARGETS[targetName];
if (target === undefined) {
    console.error(`ARP_TARGET must be one of ${Object.keys(TARGETS).join(", ")}`);
    process.exit(1);
}

const raw = process.env["ARP_DOMAIN_ATTESTOR"] ?? process.env["AGENT_ADDRESS"];
if (raw === undefined || !/^0x[0-9a-fA-F]{40}$/.test(raw)) {
    console.error("AGENT_ADDRESS (or ARP_DOMAIN_ATTESTOR) must be the 0x address holding the positions.");
    process.exit(1);
}
const attestor = getAddress(raw);

type Position = {
    term_id: string;
    term: {triple: {subject: {term_id: string; label: string}; object: {label: string}} | null} | null;
};

const held: Position[] = [];
for (let offset = 0; ; offset += PAGE) {
    const response = await fetch(target.graphql, {
        method: "POST",
        headers: {"content-type": "application/json"},
        body: JSON.stringify({query: HELD, variables: {who: attestor, pid: HAS_TAG, limit: PAGE, offset}}),
        signal: AbortSignal.timeout(30000),
    });
    const body = (await response.json()) as {data?: {positions: Position[]}; errors?: {message: string}[]};
    if (body.errors !== undefined) {
        console.error(`indexer: ${body.errors[0]?.message}`);
        process.exit(1);
    }
    const page = body.data?.positions ?? [];
    held.push(...page);
    if (page.length < PAGE) break;
}

type Row = {repo: string; skill: string; description: string};
const rows = (measured as {rows: Row[]}).rows;

const labelOf = (row: Row): string =>
    `github.com/${row.repo}?skill=${encodeURIComponent(row.skill)}`;

const onChain = new Map<string, {atom: string; domain: string; triple: string}>();
for (const position of held) {
    const triple = position.term?.triple;
    if (triple === undefined || triple === null) continue;
    onChain.set(triple.subject.label, {
        atom: triple.subject.term_id,
        domain: triple.object.label,
        triple: position.term_id,
    });
}

const skills = rows.map((row) => {
    const label = labelOf(row);
    const want = classifySkill(row.skill, row.description);
    const got = onChain.get(label);
    return {
        repo: row.repo,
        skill: row.skill,
        url: `https://${label}`,
        atom: got?.atom ?? null,
        domain: got?.domain ?? null,
        tagTriple: got?.triple ?? null,
        // Named rather than inferred: a skill the table cannot place carries no tag on purpose.
        untagged: want === null,
    };
});

const tagged = skills.filter((row) => row.domain !== null).length;
const untagged = skills.filter((row) => row.untagged).length;

const record = {
    _note:
        "What ARP wrote on chain for the skill catalogue. A RECORD, not a source of truth: every id " +
        "here is a pure function of the URL or the word (ADR 0077, 0054), so the whole set is " +
        "re-derivable with no credential and no network. What is not re-derivable is which ones ARP " +
        "asserted, and which it later withdrew.",
    _authorisation:
        "Signed by the agent session using AGENT_PRIVATE_KEY on the user's explicit instruction on " +
        "2026-10-29 (« je veut noté les skills », « on a cas creer toute les arrete necessaire », " +
        "« oui il faut faire juste »). ADR 0037's three conditions: the key was never read into the " +
        "agent's context, the signer address was checked against AGENT_ADDRESS before signing, and " +
        "this file is the record. security.md scopes its automation prohibition to mainnet.",
    _unit:
        "One row per SKILL, not per repository (ADR 0077). The URL is the install command's two " +
        "arguments: `npx skills add <repo> --skill <name>`. `…#<name>` was rejected before anything " +
        "was written — normaliseToolUrl drops the fragment, so 55 skills would have hashed to one atom.",
    _retired:
        "203 `has tag` positions were retired on 2026-10-29, not deleted — Intuition has no deletion. " +
        "A keyword table ordered general before specific and `blockchain` matched `token` in 'cuts " +
        "token usage' and in 'design tokens'. Redeeming the position removes the claim from ARP's " +
        "index and leaves the triple on chain, unowned: ARP said it, then stopped. " +
        "scripts/verify/audit-skill-tags.ts re-derives this and returns 0 disagreements.",
    _hashes:
        "Absent for most writes, and that is a defect in the tooling rather than a choice. " +
        "send-plan-in-waves.sh wrote each wave to a mktemp file and deleted it, so the hashes of " +
        "500+ writes were gone when the wave ended. Fixed the same day — it now appends them to " +
        "<plan>.hashes.txt — but this run's are lost. The terms are re-derivable; a hash is not.",
    chainId: target.chainId,
    attestor,
    recordedAt: new Date().toISOString(),
    counts: {
        skills: skills.length,
        tagged,
        untagged,
        notTaggedButClassifiable: skills.length - tagged - untagged,
    },
    skills,
};

const path = `data/catalogue/skills-${target.chainId}.json`;
writeFileSync(path, `${JSON.stringify(record, null, 2)}\n`);
console.log(`${skills.length} skills · ${tagged} tagged · ${untagged} deliberately untagged`);
console.log(`written to ${path}`);

// A module, not a global script — see the note in scripts/measure/predicate-objects.ts.
export {};
