/** Tag each catalogued skill with the domain it belongs to, so the index can find it.
 *
 *      ARP_TARGET=testnet bun run scripts/seed-skill-tags.ts --json /tmp/tags.json
 *      scripts/send-plan-in-waves.sh 13579 /tmp/tags.json 2000 900
 *
 *  Plans and prints. **Signs nothing and sends nothing** (ADR `0038`).
 *
 *  ## The hole this fills
 *
 *  662 skill atoms went on chain on 2026-10-29, each with a `source` edge to its repository, and
 *  **nothing could find one**: `arp_find_tools` narrows by walking the `has tag` hierarchy from a
 *  domain, and `source` is not that walk. Written and unreadable is the opposite of this project's
 *  own argument — take what exists, put it in one place, weight it by TRUST.
 *
 *  ## Two new domain terms, and the one that was rejected
 *
 *  The table in `skill-domains-table.ts` placed 569 of 662 in the 17 domains already under `tool`.
 *  Two clusters had no home, and keywords could not invent one:
 *
 *    - **`method`** — ~32 skills about *how a piece of work is conducted*: handing a session over,
 *      triaging an inbox, running a retrospective, planning before editing, proving work is done
 *      before claiming it. Not a tool and not a technical subject. `agent` was the obvious word and
 *      was rejected: here an agent is an ERC-8004 identity, and one word for two things is how a
 *      vocabulary stops being one.
 *    - **`writing`** — ~14 skills producing prose: the `writing-*` family, a cold email, a PR body,
 *      a commit message. Distinct from `marketing`, which is about reaching somebody.
 *
 *  Both are plain strings, so each id is a pure function of the word and the same on 1155 and
 *  13579 — the discipline `seed-domain-tree.ts` records, and the reason `card-payment` is the one
 *  term on this chain that breaks the one-word rule.
 *
 *  ## One tag, at the deepest domain
 *
 *  ADR `0074`. A skill carries exactly one `has tag`, and the ancestors come from the hierarchy
 *  walk rather than from more edges. 7 of 662 match nothing and are **left untagged** — the same
 *  discipline `reachability.ts` applies with `no-verdict`, and a wrong tag is permanent.
 *
 *  ## `has tag`, and which atom
 *
 *  `0x7ec36d20…` on both chains, not `hasTagForWriting(chainId)`. Measured 2026-10-28 on testnet
 *  13579: that atom carries 52,781 edges there against 311 for the one the partner guide
 *  recommends for testnet writes. Writing where nothing reads is not writing.
 */
import {writeFileSync} from "node:fs";

import {formatEther, stringToHex, type Hex} from "viem";

import measured from "../measurements/skill-domains-2026-10-29.json";
import {
    atomDataForUri,
    encodeCreateAtoms,
    encodeCreateTriples,
    multiVaultReads,
} from "../packages/protocol/src/declare/index.js";
import {HAS_TAG, IS_A_SUB_DOMAIN_OF} from "../packages/protocol/src/sources/intuition/terms.js";
import {normaliseToolUrl, toolAtomUri} from "../packages/protocol/src/declare/tool-thing.js";
import {classifySkill, SKILL_DOMAINS} from "./skill-domains-table.js";

const TARGETS = {mainnet: 1155, testnet: 13579} as const;

/** How many per call. The RPC meters bytes, not gas — see `seed-skills.ts`. */
const BATCH = 8;

function arg(name: string): string | undefined {
    const index = process.argv.indexOf(`--${name}`);
    return index === -1 ? undefined : process.argv[index + 1];
}

/** Resolve a few at a time: `Promise.all` over 662 rows trips the RPC's byte quota. */
async function paced<T, R>(items: readonly T[], work: (item: T) => Promise<R>): Promise<R[]> {
    const out: R[] = [];
    for (let at = 0; at < items.length; at += 6) {
        out.push(...(await Promise.all(items.slice(at, at + 6).map(work))));
        if (at + 6 < items.length) await new Promise((done) => setTimeout(done, 120));
    }
    return out;
}

const targetName = (process.env["ARP_TARGET"] ?? "testnet") as keyof typeof TARGETS;
const chainId = TARGETS[targetName];
if (chainId === undefined) {
    console.error(`ARP_TARGET must be one of ${Object.keys(TARGETS).join(", ")}`);
    process.exit(1);
}
if (chainId === 1155) {
    console.error("refusing mainnet: no ADR authorises ARP seeding a skill catalogue on 1155.");
    process.exit(1);
}

const record = (await import(`../deployments/${chainId}.json`)) as {
    default: {intuition: {multiVault: string}; chain: {rpcUrl: string}};
};
const multiVault = record.default.intuition.multiVault as Hex;
const rpcUrl =
    process.env["INTUITION_RPC_URL"] ??
    process.env["INTUITION_TESTNET_RPC_URL"] ??
    record.default.chain.rpcUrl;

const {createPublicClient, http} = await import("viem");
const client = createPublicClient({transport: http(rpcUrl)});
const reads = multiVaultReads({address: multiVault, chainId, client});

const [stake, atomCost, tripleCost] = await Promise.all([
    reads.minDeposit(),
    reads.atomCost(),
    reads.tripleCost(),
]);
const atomAssets = atomCost + stake;
const tripleAssets = tripleCost + stake;

console.log(`chain        ${chainId} (${targetName})`);
console.log(`atom         ${formatEther(atomAssets)}    triple ${formatEther(tripleAssets)}\n`);

type Row = {repo: string; skill: string; description: string};
const rows = (measured as {rows: Row[]}).rows;

// Every domain the table can reach, plus `tool` which they all hang from.
const domainLabels = ["tool", ...new Set(SKILL_DOMAINS.map((rule) => rule.domain))];
const domainIds = new Map<string, Hex>();
for (const label of domainLabels) {
    domainIds.set(label, await reads.atomId(stringToHex(label)));
}
const domainOnChain = new Map<string, boolean>();
for (const [label, id] of domainIds) domainOnChain.set(label, await reads.termExists(id));

const missingDomains = domainLabels.filter((label) => domainOnChain.get(label) === false);
console.log(`domains      ${domainLabels.length - 1} under \`tool\``);
console.log(
    missingDomains.length === 0
        ? "             all already on chain"
        : `             to mint: ${missingDomains.join(", ")}`,
);

const calls: unknown[] = [];

for (const group of [missingDomains]) {
    if (group.length === 0) continue;
    calls.push({
        kind: "create-atom",
        chainId,
        to: multiVault,
        value: (atomAssets * BigInt(group.length)).toString(),
        data: encodeCreateAtoms(
            group.map((label) => ({atomData: stringToHex(label), assets: atomAssets})),
        ),
        why: `mint the domain terms ${group.join(", ")} — plain strings, same id on both chains`,
    });
}

// The hierarchy edge each new domain needs before a tag on it means anything. Checked for every
// domain, not only the new ones: a term can exist with nobody having hung it under `tool`.
const toolId = domainIds.get("tool");
if (toolId === undefined) throw new Error("no atom id for `tool`");
const hierarchyNeeded: {label: string; id: Hex}[] = [];
for (const rule of SKILL_DOMAINS) {
    const id = domainIds.get(rule.domain);
    const parentId = domainIds.get(rule.parent);
    if (id === undefined || parentId === undefined) continue;
    const edge = await reads.tripleId(id, IS_A_SUB_DOMAIN_OF as Hex, parentId);
    if (!(await reads.termExists(edge))) hierarchyNeeded.push({label: rule.domain, id});
}
if (hierarchyNeeded.length > 0) {
    console.log(`hierarchy    to write: ${hierarchyNeeded.map((row) => row.label).join(", ")}`);
    calls.push({
        kind: "create-triple",
        chainId,
        to: multiVault,
        value: (tripleAssets * BigInt(hierarchyNeeded.length)).toString(),
        data: encodeCreateTriples(
            hierarchyNeeded.map((row) => ({
                subjectId: row.id,
                predicateId: IS_A_SUB_DOMAIN_OF as Hex,
                objectId: toolId,
                assets: tripleAssets,
            })),
        ),
        why: `${hierarchyNeeded.map((row) => row.label).join(", ")} is a sub domain of tool`,
    });
}

type Tag = {skill: string; domain: string; atomId: Hex; tripleId: Hex};
const classified = rows
    .map((row) => ({...row, domain: classifySkill(row.skill, row.description)}))
    .filter((row): row is Row & {domain: string} => row.domain !== null);

const tags = (
    await paced(classified, async (row) => {
        const domainId = domainIds.get(row.domain);
        if (domainId === undefined) return undefined;
        const url = normaliseToolUrl(
            `https://github.com/${row.repo}?skill=${encodeURIComponent(row.skill)}`,
        );
        const atomId = await reads.atomId(atomDataForUri(toolAtomUri(url)));
        return {
            skill: row.skill,
            domain: row.domain,
            atomId,
            tripleId: await reads.tripleId(atomId, HAS_TAG as Hex, domainId),
        };
    })
).filter((row): row is Tag => row !== undefined);

const tagOnChain = await paced(tags, (row) => reads.termExists(row.tripleId));
const newTags = tags.filter((_, index) => tagOnChain[index] === false);

console.log(`\ntags         ${newTags.length} to write · ${tags.length - newTags.length} already on chain`);
console.log(`untagged     ${rows.length - classified.length} skills match no domain and are left alone`);

const chunk = <T>(list: readonly T[], size: number): T[][] =>
    Array.from({length: Math.ceil(list.length / size)}, (_, i) => list.slice(i * size, i * size + size));

for (const group of chunk(newTags, BATCH)) {
    const domainId = (label: string): Hex => {
        const id = domainIds.get(label);
        if (id === undefined) throw new Error(`no atom id for domain ${label}`);
        return id;
    };
    calls.push({
        kind: "create-triple",
        chainId,
        to: multiVault,
        value: (tripleAssets * BigInt(group.length)).toString(),
        data: encodeCreateTriples(
            group.map((row) => ({
                subjectId: row.atomId,
                predicateId: HAS_TAG as Hex,
                objectId: domainId(row.domain),
                assets: tripleAssets,
            })),
        ),
        why: `${group.length} tags: ${group.map((row) => `${row.skill}→${row.domain}`).slice(0, 2).join(", ")}…`,
    });
}

const total = calls.reduce((sum, call) => sum + BigInt((call as {value: string}).value), 0n);
const balance = await client.getBalance({address: (process.env["AGENT_ADDRESS"] ?? "0x0") as Hex});
console.log(`\n${calls.length} calls in batches of ${BATCH} · ${formatEther(total)} tTRUST`);
console.log(`balance      ${formatEther(balance)} tTRUST`);

if (calls.length === 0) {
    console.log("nothing to plan — every tag is already on chain.");
    process.exit(0);
}

const jsonPath = arg("json");
if (jsonPath === undefined) {
    console.log("\npass --json <path> to write the plan, then send it with send-plan-in-waves.sh");
} else {
    writeFileSync(jsonPath, JSON.stringify(calls, null, 2));
    console.log(`\nplan written to ${jsonPath}`);
}

// A module, not a global script — see the note in scripts/measure/predicate-objects.ts.
export {};
