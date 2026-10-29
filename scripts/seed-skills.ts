/** Put each catalogued skill on chain, and say which repository it came from.
 *
 *      ARP_TARGET=testnet bun run scripts/seed-skills.ts --json /tmp/skills.json
 *      bun run scripts/agent-send-plan.ts --chain 13579 --plan /tmp/skills.json --execute
 *
 *  Plans and prints. **Signs nothing and sends nothing** (ADR `0038`).
 *
 *  ## Why the skill and not the repository
 *
 *  The catalogue has 31 skill repositories. Measured 2026-10-29 by
 *  `scripts/measure/skills-installs.ts`, those 31 hold **662 skills** between them — 71 in one, 1
 *  in another — and skills.sh counts installations per skill, because `npx skills add <repo>
 *  --skill <name>` is what a person actually runs. The repository was never the unit; it was what
 *  the scrape happened to return.
 *
 *  ## What identifies a skill, and the shape that was rejected
 *
 *  `https://github.com/<owner>/<repo>?skill=<name>` — the install command's two arguments and
 *  nothing else. A pure function, needing no request, and **it cannot move**: the real file sits at
 *  `skills/<name>/SKILL.md` in some repositories and `<name>/SKILL.md` in others, and a path that
 *  moves forks the atom for ever, since Intuition has no deletion.
 *
 *  `…/<repo>#<name>` was the obvious alternative and is a trap. {@link normaliseToolUrl} **drops
 *  the fragment** — a fragment is a scroll position — so all 55 of one repository's skills would
 *  have hashed to the repository's own atom. One atom for 55 things, permanently. The query string
 *  survives normalisation (keys sorted), which is why it is the one used.
 *
 *  ## The edge, and why it is the one worth paying for
 *
 *  `(skill, source, repository)`.
 *
 *  Measured 2026-10-29: of 662 skill pages, **177 are copies** — six repositories named
 *  `superpowers` hold 26 identical skills each, `ai-video-generation` appears 8 times,
 *  `remotion-render` 7 times with `remotion-dev` itself among them. An install count cannot tell a
 *  copy from its original, and two of the copies out-install `obra/superpowers`.
 *
 *  Scheme A keeps them apart on its own — a copy and its original differ in the `<repo>` half of
 *  the URL, so they are different atoms whatever they are called. The `source` edge is what makes
 *  that **readable**: it says which repository each one came out of.
 *
 *  `source` was **already on chain** and is reused rather than minted: a plain-string atom
 *  (`TextObject`), so its id is a pure function of the word and identical on 1155 and 13579, with
 *  exactly one atom carrying the label on each. Checked against both indexers before writing.
 *
 *  ## Batching
 *
 *  662 atoms and 662 triples is 1,324 calls one at a time. `createAtoms` and `createTriples` have
 *  always been plural on chain, so this sends {@link BATCH} per call instead. A batch is **atomic**
 *  — one member that already exists reverts all of it — so every id is checked for existence first
 *  and the existing ones are dropped before anything is encoded.
 *
 *  ## Labels
 *
 *  An atom's id is computable without pinning; pinning the document is what makes the indexer
 *  render a name instead of a hash. That is `scripts/pin-tool.ts`, it needs a pin API key, and it
 *  can run before or after this — the CID does not depend on it.
 */
import {writeFileSync} from "node:fs";

import {formatEther, type Hex} from "viem";

import installs from "../measurements/skills-installs-2026-10-29.json";
import {
    atomDataForUri,
    encodeCreateAtoms,
    encodeCreateTriples,
    multiVaultReads,
} from "../packages/protocol/src/declare/index.js";
import {normaliseToolUrl, toolAtomUri} from "../packages/protocol/src/declare/tool-thing.js";

const TARGETS = {mainnet: 1155, testnet: 13579} as const;

/**
 * `source` — already on chain, reused rather than minted.
 *
 * A plain string, so the id follows from the word: identical on 1155 and 13579, and verified
 * against `calculateAtomId(stringToHex("source"))` before this constant was written down. Measured
 * 2026-10-29 on both indexers: exactly one atom carries the label on each, against `provided by`
 * which resolves to three on mainnet. The alternatives all failed one test or another — `part of`
 * and `repository` have zero edges and two spellings, `from` is a word a reader cannot pin down.
 */
const SOURCE = "0xe6b33153a6f58b47bcfe074cd154447608d5788e96446246536ddb9cd84105a4" as Hex;

/**
 * How many per call, and the limit is the RPC's **bandwidth**, not gas.
 *
 * Measured 2026-10-29: twenty atoms encode to 3,973 bytes of calldata and cost 5,154,033 gas — far
 * under a block, and `eth_estimateGas` passed. Four such batches landed, and the fifth came back
 * `Bandwidth limit exceeded` (-31002) from `eth_sendRawTransaction`. So the public testnet RPC
 * meters bytes over time. Eight keeps a call near 1.6 KB; `--pause` on the sender does the rest.
 */
const BATCH = 8;

function arg(name: string): string | undefined {
    const index = process.argv.indexOf(`--${name}`);
    return index === -1 ? undefined : process.argv[index + 1];
}

/**
 * Run `work` over `items` a few at a time, pausing between waves.
 *
 * `Promise.all` over 662 rows is 662 requests leaving at once, and Intuition's public testnet RPC
 * answers that with `Bandwidth limit exceeded` (-31002) — the same limiter that caps writes caps
 * reads. A plain `await` in a loop would be correct and take an hour; this takes minutes.
 */
async function paced<T, R>(
    items: readonly T[],
    work: (item: T) => Promise<R>,
    width = 6,
    gapMs = 120,
): Promise<R[]> {
    const out: R[] = [];
    for (let at = 0; at < items.length; at += width) {
        out.push(...(await Promise.all(items.slice(at, at + width).map(work))));
        if (at + width < items.length) await new Promise((done) => setTimeout(done, gapMs));
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
console.log(`atom         ${formatEther(atomAssets)}  (cost + minDeposit, one position each)`);
console.log(`triple       ${formatEther(tripleAssets)}\n`);

type Skill = {repo: string; skill: string; installs: number | null};
const skills = (installs as {rows: Skill[]}).rows;

// One repository atom per repository, resolved once. These are the catalogue's own atoms and they
// already exist — the `source` edge points at them rather than minting a second copy.
const repoAtomId = new Map<string, Hex>();
const repoNames = [...new Set(skills.map((row) => row.repo))];
const repoIds = await paced(repoNames, (repo) =>
    reads.atomId(atomDataForUri(toolAtomUri(`https://github.com/${repo}`))),
);
repoNames.forEach((repo, index) => {
    const id = repoIds[index];
    if (id !== undefined) repoAtomId.set(repo, id);
});

type Planned = {repo: string; skill: string; url: string; data: Hex; atomId: Hex; tripleId: Hex};
const planned = (
    await paced(skills, async (row) => {
        const repoId = repoAtomId.get(row.repo);
        if (repoId === undefined) return undefined;
        const url = normaliseToolUrl(
            `https://github.com/${row.repo}?skill=${encodeURIComponent(row.skill)}`,
        );
        const data = atomDataForUri(toolAtomUri(url));
        const atomId = await reads.atomId(data);
        return {
            repo: row.repo,
            skill: row.skill,
            url,
            data,
            atomId,
            tripleId: await reads.tripleId(atomId, SOURCE, repoId),
        };
    })
).filter((row): row is Planned => row !== undefined);

// A batch is atomic, so an existing member would revert the whole call. Filter before encoding.
// `.filter(async …)` would keep every row — a Promise is truthy — so the check is resolved first.
const repoEntries = [...repoAtomId.entries()];
const repoOnChain = await paced(repoEntries, ([, id]) => reads.termExists(id));
const missingRepos = repoEntries.filter((_, index) => repoOnChain[index] === false);
const atomExists = await paced(planned, (row) => reads.termExists(row.atomId));
const tripleExists = await paced(planned, (row) => reads.termExists(row.tripleId));

const newAtoms = planned.filter((_, index) => atomExists[index] === false);
const newTriples = planned.filter((_, index) => tripleExists[index] === false);

console.log(`skills       ${planned.length} catalogued across ${repoAtomId.size} repositories`);
console.log(`atoms        ${newAtoms.length} to create, ${planned.length - newAtoms.length} already on chain`);
console.log(`source edges ${newTriples.length} to write, ${planned.length - newTriples.length} already on chain`);
if (missingRepos.length > 0) console.log(`note         ${missingRepos.length} repository atoms unresolved`);

/**
 * A prepared call as it travels to `agent-send-plan.ts`: `value` is a decimal string, since JSON
 * has no bigint. The same shape as `send-plan.ts`'s `SerialisedCall`, declared here rather than
 * imported so a planning script carries no dependency on the one module that holds a key.
 */
type PlannedCall = {kind: string; chainId: number; to: Hex; value: string; data: Hex; why: string};

const calls: PlannedCall[] = [];
const chunk = <T>(list: readonly T[], size: number): T[][] =>
    Array.from({length: Math.ceil(list.length / size)}, (_, i) => list.slice(i * size, i * size + size));

for (const group of chunk(newAtoms, BATCH)) {
    const value = atomAssets * BigInt(group.length);
    calls.push({
        kind: "create-atom",
        chainId,
        to: multiVault,
        value: value.toString(),
        data: encodeCreateAtoms(group.map((row) => ({atomData: row.data, assets: atomAssets}))),
        why: `${group.length} skills: ${group[0]?.skill} … ${group[group.length - 1]?.skill}`,
    });
}

// Every atom in a triple must exist first, and the batches above are sent before these.
for (const group of chunk(newTriples, BATCH)) {
    const value = tripleAssets * BigInt(group.length);
    calls.push({
        kind: "create-triple",
        chainId,
        to: multiVault,
        value: value.toString(),
        data: encodeCreateTriples(
            group.map((row) => {
                const repoId = repoAtomId.get(row.repo);
                if (repoId === undefined) throw new Error(`no repository atom for ${row.repo}`);
                return {subjectId: row.atomId, predicateId: SOURCE, objectId: repoId, assets: tripleAssets};
            }),
        ),
        why: `${group.length} source edges: ${group[0]?.repo} …`,
    });
}

const total = calls.reduce((sum, call) => sum + BigInt(call.value), 0n);
console.log(`\n${calls.length} calls in batches of ${BATCH} · ${formatEther(total)} tTRUST`);

if (calls.length === 0) {
    console.log("nothing to plan — every skill and every source edge is already on chain.");
    process.exit(0);
}

const jsonPath = arg("json");
if (jsonPath === undefined) {
    console.log("\npass --json <path> to write the plan, then send it with agent-send-plan.ts");
} else {
    writeFileSync(jsonPath, JSON.stringify(calls, null, 2));
    console.log(`\nplan written to ${jsonPath}`);
}

// A module, not a global script — see the note in scripts/measure/predicate-objects.ts.
export {};
