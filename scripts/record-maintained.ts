/** Read whether each catalogued tool is still maintained, and plan what ARP asserts about it.
 *
 *      ARP_TARGET=testnet bun run scripts/record-maintained.ts --json /tmp/maintained.json
 *      bun run scripts/agent-send-plan.ts --chain 13579 --plan /tmp/maintained.json --execute
 *
 *  Plans and prints. **Signs nothing and sends nothing** — `agent-send-plan.ts` is the only place
 *  in this repo that holds a key (ADR `0038`).
 *
 *  ## It fetches rather than probes, and that is the point
 *
 *  The user's formulation, 2026-10-29: _« on ne fait que récupérer des infos existantes, les rendre
 *  accessibles au même endroit, avec une pondération en TRUST »_. GitHub already publishes whether
 *  a repository is archived and when it was last pushed. Those are third-party facts in `docs/14`'s
 *  sense — read from somebody else, reproducible by anyone with one request — and that is the only
 *  test a source has to pass to be recorded here. A proprietary score would fail it.
 *
 *  Every tool in `catalogue/tools.json` is a github.com URL, so `reachable` — a protocol handshake
 *  — applies to none of them and `maintained` applies to all 53.
 *
 *  ## What the threshold is, and that it is a judgement
 *
 *  Measured 2026-10-29 across all 53 (`scripts/measure/repo-liveness.ts`): 40 pushed within 30
 *  days, 2 archived or gone, and the stale tail runs 366, 167, 100, 87, 78, 58 days. **There is no
 *  clean gap**, so {@link STALE_AFTER_DAYS} is a choice rather than a reading, and it is named so
 *  that moving it is a visible act.
 *
 *  180 days: at 30 it would flip on every repository that ships monthly, and at 365 it would call a
 *  repository dead for a year maintained.
 */
import {writeFileSync} from "node:fs";

import {formatEther, stringToHex, type Hex} from "viem";

import catalogue from "../catalogue/tools.json";
import {
    atomDataForUri,
    multiVaultReads,
    planReachability,
    readReachabilityState,
} from "../packages/protocol/src/declare/index.js";
import {HAS_TAG} from "../packages/protocol/src/sources/intuition/terms.js";
import {normaliseToolUrl, toolAtomUri} from "../packages/protocol/src/declare/tool-thing.js";
import type {Verdict} from "../packages/protocol/src/reachability.js";

const TARGETS = {mainnet: 1155, testnet: 13579} as const;

/** See the header: a judgement, not a reading. */
const STALE_AFTER_DAYS = 180;

/** `maintained` — a plain string, so its id follows from the word and is the same on both chains. */
const MAINTAINED = stringToHex("maintained");

function arg(name: string): string | undefined {
    const index = process.argv.indexOf(`--${name}`);
    return index === -1 ? undefined : process.argv[index + 1];
}

const targetName = (process.env["ARP_TARGET"] ?? "testnet") as keyof typeof TARGETS;
const chainId = TARGETS[targetName];
if (chainId === undefined) {
    console.error(`ARP_TARGET must be one of ${Object.keys(TARGETS).join(", ")}`);
    process.exit(1);
}
if (chainId === 1155) {
    console.error("refusing mainnet: no ADR authorises ARP writing liveness verdicts on 1155.");
    process.exit(1);
}

const attestor = process.env["ARP_DOMAIN_ATTESTOR"] ?? process.env["AGENT_ADDRESS"];
if (attestor === undefined || !/^0x[0-9a-fA-F]{40}$/.test(attestor)) {
    console.error("AGENT_ADDRESS (or ARP_DOMAIN_ATTESTOR) must be the 0x address holding the positions.");
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

const [curveId, stake, atomCost] = await Promise.all([
    reads.defaultCurveId(),
    reads.minDeposit(),
    reads.atomCost(),
]);

console.log(`chain       ${chainId} (${targetName})`);
console.log(`attestor    ${attestor}`);
console.log(`stake       ${formatEther(stake)} per assertion (minDeposit, read from chain)\n`);

const calls: unknown[] = [];

// The object atom has to exist before any triple can name it. It is on mainnet already and absent
// from testnet, with the same id either way — a plain string's id is a pure function of the word.
const maintainedId = await reads.atomId(MAINTAINED);
if (!(await reads.termExists(maintainedId))) {
    const {encodeCreateAtom} = await import("../packages/protocol/src/declare/multivault.js");
    const assets = atomCost + stake;
    console.log(`CREATE  the \`maintained\` atom  ${maintainedId}  ${formatEther(assets)}`);
    calls.push({
        kind: "create-atom",
        chainId,
        to: multiVault,
        value: assets.toString(),
        data: encodeCreateAtom(MAINTAINED, assets),
        why: "the `maintained` atom — a plain string, so its id is the same on both chains",
    });
}

const sleep = (ms: number): Promise<void> => new Promise((done) => setTimeout(done, ms));
const now = Date.now();
let unchanged = 0;
let skipped = 0;

for (const tool of (catalogue as {tools: {url: string}[]}).tools) {
    const slug = tool.url.replace("https://github.com/", "");
    const response = await fetch(`https://api.github.com/repos/${slug}`, {
        headers: {accept: "application/vnd.github+json", "user-agent": "arp"},
        signal: AbortSignal.timeout(20000),
    });
    if (response.status === 403 || response.status === 429) {
        console.error(`\nrate limited at ${slug}. Re-run later; nothing planned for the rest.`);
        break;
    }
    const repo = (await response.json()) as {pushed_at?: string; archived?: boolean};

    // A 404 and an archive are both the answer "no". Anything else without a push date is not an
    // answer at all — GitHub replied something we did not understand, so nothing is claimed.
    let verdict: Verdict;
    if (response.status === 404 || repo.archived === true) verdict = "down";
    else if (repo.pushed_at === undefined) verdict = "no-verdict";
    else {
        const days = (now - Date.parse(repo.pushed_at)) / 86_400_000;
        verdict = days <= STALE_AFTER_DAYS ? "up" : "down";
    }

    if (verdict === "no-verdict") {
        skipped += 1;
        console.log(`  ?       ${slug}  — GitHub answered without a push date, nothing claimed`);
        await sleep(120);
        continue;
    }

    const toolAtomId = await reads.atomId(atomDataForUri(toolAtomUri(normaliseToolUrl(tool.url))));
    const state = await readReachabilityState(
        reads,
        attestor as Hex,
        toolAtomId,
        HAS_TAG,
        maintainedId,
        curveId,
    );
    const plan = planReachability(state, [verdict], {
        multiVault,
        chainId,
        receiver: attestor as Hex,
        curveId,
        stake,
        toolLabel: slug,
        // One reading of an authoritative source, not three observations of a flaky one. GitHub
        // saying `archived: true` is the owner's own declaration; there is nothing to confirm.
        condemnAfter: 1,
    });

    if (plan.calls.length === 0) {
        unchanged += 1;
    } else {
        console.log(`  ${plan.to === "up" ? "ALIVE " : "STALE "}  ${slug}  — ${plan.why}`);
        for (const call of plan.calls) {
            calls.push({
                kind: call.kind,
                chainId: call.chainId,
                to: call.to,
                value: call.value.toString(),
                data: call.data,
                why: call.why,
            });
        }
    }
    await sleep(120);
}

const total = calls.reduce((sum, call) => sum + BigInt((call as {value: string}).value), 0n);
console.log(
    `\n${calls.length} calls · ${unchanged} already correct · ${skipped} not claimed · ${formatEther(total)} ${chainId === 1155 ? "TRUST" : "tTRUST"}`,
);

if (calls.length === 0) {
    console.log("nothing to plan — every verdict already matches what is recorded.");
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
