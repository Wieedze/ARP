/** What exists today, computed at run time: lines, who wrote them, skills, agents, the sponsor's spend, the repository.
 *  Reads only, on testnet 13579. Holds no key, sends nothing.
 *
 *      bun run scripts/measure/proof-of-work.ts            print the table, write one file in data/measurements/
 *      bun run scripts/measure/proof-of-work.ts --tests    also run the test suites, a few minutes
 *      bun run scripts/measure/proof-of-work.ts --no-file  print only, as `scripts/demo/terminal-demo.ts` does
 *
 *  Every figure comes from a read below, and a read that fails prints as "not read". A file is a dated measurement
 *  (ADR `0064`): one per run, never regenerated.
 */
import {execFileSync, spawnSync} from "node:child_process";
import {existsSync, readdirSync, statSync, writeFileSync} from "node:fs";
import {join} from "node:path";

import {createPublicClient, formatEther, getAddress, http, parseAbi, type Hex} from "viem";

import deployment from "../../data/deployments/13579.json";
import {findAgentsWithEndpoints} from "../../packages/protocol/src/agent-pulse.ts";
import {parseCaip19} from "../../packages/protocol/src/caip.ts";
import {getAgentEndpoints} from "../../packages/protocol/src/directory.ts";
import {aboutASkill, graphql, hasOutcomeAtom, holdersOf, OURS, readResultLines, USES, writers} from "../helpers/line-writers.ts";

const ROOT = join(import.meta.dir, "..", "..");
const graphqlUrl = deployment.chain.graphqlUrl;
const explorer = deployment.chain.explorerUrl;
const client = createPublicClient({transport: http(deployment.chain.rpcUrl)});

const attempt = async <T>(read: () => Promise<T>): Promise<T | {notRead: string}> => {
    try {
        return await read();
    } catch (error) {
        return {notRead: error instanceof Error ? error.message.split("\n")[0] ?? "failed" : String(error)};
    }
};
const failed = <T>(value: T | {notRead: string}): value is {notRead: string} => typeof value === "object" && value !== null && "notRead" in value;

async function lines() {
    const hasOutcome = await hasOutcomeAtom();
    const all = await readResultLines(hasOutcome);
    const holders = await holdersOf(all);
    const skills = all.filter(aboutASkill);
    const view = (line: (typeof all)[number] | undefined) =>
        line === undefined ? null : {term: line.termId, transaction: line.transaction, explorer: `${explorer}/tx/${line.transaction}`, at: line.at, tool: line.tool, domain: line.domain, outcome: line.outcome, reason: line.reason};
    return {
        results: await writers(hasOutcome),
        aboutASkill: skills.length,
        aboutSomethingElse: all.length - skills.length,
        withADomain: all.filter((line) => line.domain !== null).length,
        withAReason: all.filter((line) => line.reason !== null).length,
        holders,
        first: view(all[0]),
        latest: view(all.at(-1)),
        uses: await writers(USES),
    };
}

async function skillsListed() {
    const data = await graphql<{all: {aggregate: {count: number}}; ours: {aggregate: {count: number}}}>(
        `query($o: [String!]!) {
            all: atoms_aggregate(where: {label: {_like: "%?skill=%"}}) { aggregate { count } }
            ours: atoms_aggregate(where: {label: {_like: "%?skill=%"}, creator_id: {_in: $o}}) { aggregate { count } }
        }`,
        {o: [...OURS].map((wallet) => getAddress(wallet))},
    );
    return {total: data.all.aggregate.count, listedByUs: data.ours.aggregate.count};
}

const REGISTRY_ABI = parseAbi(["function ownerOf(uint256) view returns (address)"]);

/** An address counts when its proof checks out here, against the registry's owner: the same call `arp_agent_endpoints` makes. */
async function signedAgents() {
    const hasEndpoint = deployment.arp.endpointBinding.hasEndpoint;
    const found = await findAgentsWithEndpoints({graphqlUrl, hasEndpoint, chainId: 13579, knownRegistries: [deployment.arp.identityRegistry]});
    const rows = await Promise.all(
        found.agents.map(async (agent) => {
            const ref = agent.caip19 === null ? null : parseCaip19(agent.caip19);
            if (ref === null) return null;
            const endpoints = await getAgentEndpoints(
                {agentRegistry: `eip155:${ref.chainId}:${ref.registry}`, agentId: ref.tokenId, agentAtom: agent.atomId},
                {
                    graphqlUrl,
                    predicates: {hasEndpoint, inContextOf: deployment.arp.endpointBinding.inContextOf},
                    chain: {
                        ownerOf: ({registry, agentId}) => client.readContract({address: registry, abi: REGISTRY_ABI, functionName: "ownerOf", args: [agentId]}),
                        verifyMessage: ({address, message, signature}) => client.verifyMessage({address, message, signature}),
                    },
                },
            );
            if (!endpoints.some((entry) => entry.status === "bound")) return null;
            const owner = await client.readContract({address: ref.registry, abi: REGISTRY_ABI, functionName: "ownerOf", args: [BigInt(ref.tokenId)]});
            return {agent: agent.label, owner, ownerIsOurs: OURS.has(owner.toLowerCase())};
        }),
    );
    const agents = rows.filter((row) => row !== null);
    return {total: agents.length, ownedByUs: agents.filter((row) => row.ownerIsOurs).length, agents};
}

async function sponsor() {
    const address = deployment.arp.sponsor as Hex; // an address in this repo's record
    const [balance, counters, deposits] = await Promise.all([
        client.getBalance({address}),
        fetch(`${explorer}/api/v2/addresses/${address}/counters`, {signal: AbortSignal.timeout(15_000)}).then((response) => response.json() as Promise<{transactions_count?: string}>), // only this field is read
        graphql<{deposits_aggregate: {aggregate: {count: number; sum: {assets_after_fees: string | null}}}}>(
            `query($s: String!) { deposits_aggregate(where: {sender_id: {_eq: $s}}) { aggregate { count sum { assets_after_fees } } } }`,
            {s: address},
        ),
    ]);
    return {
        address,
        balanceNow: formatEther(balance),
        transactions: counters.transactions_count ?? null,
        deposits: deposits.deposits_aggregate.aggregate.count,
        depositedAfterFees: formatEther(BigInt(deposits.deposits_aggregate.aggregate.sum.assets_after_fees ?? "0")),
        note: "This address is also ARP's deployer, so the figures cover its whole life, not the service alone. The service's own ledger stays on the machine that runs it.",
    };
}

function git(...args: string[]): string {
    return execFileSync("git", args, {cwd: ROOT, encoding: "utf8"}).trim();
}

function repository() {
    const tracked = git("ls-files").split("\n");
    return {
        branch: git("rev-parse", "--abbrev-ref", "HEAD"),
        head: git("rev-parse", "--short", "HEAD"),
        commits: Number(git("rev-list", "--count", "HEAD")),
        firstCommit: git("log", "--max-parents=0", "--format=%as", "HEAD").split("\n").at(-1) ?? null,
        testFiles: tracked.filter((file) => /(^|\/)test\/.*\.test\.tsx?$|\.test\.tsx?$|\.t\.sol$/.test(file)).length,
    };
}

/** The dated files, and the git tags that are not archives. There is no other tagging of a measurement in this repository. */
function measurements() {
    const dir = join(ROOT, "data", "measurements");
    const files = readdirSync(dir).filter((file) => statSync(join(dir, file)).isFile());
    const dates = files.flatMap((file) => /\d{4}-\d{2}-\d{2}/.exec(file)?.[0] ?? []).sort();
    const families = new Set(files.map((file) => file.replace(/-?\d{4}-?\d{2}-?\d{2}.*/, "")));
    const tags = git("tag", "--list").split("\n").filter((tag) => tag !== "" && !tag.startsWith("archive/"));
    return {files: files.length, kinds: families.size, oldest: dates[0] ?? null, newest: dates.at(-1) ?? null, gitTagsOnAMeasurement: tags.length};
}

const SUITES: {dir: string; runner: "vitest" | "bun"}[] = [
    {dir: "packages/protocol", runner: "vitest"},
    {dir: "packages/graphql", runner: "vitest"},
    {dir: "apps/mcp", runner: "vitest"},
    {dir: "apps/web", runner: "vitest"},
    {dir: "apps/cli", runner: "bun"},
    {dir: "apps/hook", runner: "bun"},
    {dir: "apps/node", runner: "bun"},
    {dir: "apps/sponsor", runner: "bun"},
    {dir: "apps/probe", runner: "bun"},
    {dir: "apps/api", runner: "bun"},
];

/** Mocked at the network boundary, so this sends nothing. Contracts are not run here: Foundry is a separate toolchain. */
function tests() {
    spawnSync("bun", ["run", "--cwd", "packages/protocol", "build"], {cwd: ROOT, stdio: "ignore"});
    const env = {...process.env, ARP_TARGET: "testnet", ARP_NO_RECEIPTS: "1"};
    const suites = SUITES.filter((suite) => existsSync(join(ROOT, suite.dir))).map(({dir, runner}) => {
        const run = runner === "vitest"
            ? spawnSync("bunx", ["vitest", "run", "--reporter=json"], {cwd: join(ROOT, dir), env, encoding: "utf8", maxBuffer: 256 * 1024 * 1024})
            : spawnSync("bun", ["test", "--timeout", "20000"], {cwd: join(ROOT, dir), env, encoding: "utf8", maxBuffer: 64 * 1024 * 1024});
        if (runner === "vitest") {
            const start = run.stdout.indexOf("{");
            const report = start === -1 ? null : (JSON.parse(run.stdout.slice(start)) as {numPassedTests: number; numFailedTests: number}); // vitest's json reporter
            return {dir, passed: report?.numPassedTests ?? 0, failed: report?.numFailedTests ?? 0};
        }
        const count = (word: string) => Number(new RegExp(`^\\s*(\\d+) ${word}$`, "m").exec(`${run.stdout}\n${run.stderr}`)?.[1] ?? 0);
        return {dir, passed: count("pass"), failed: count("fail")};
    });
    return {suites, passed: suites.reduce((sum, suite) => sum + suite.passed, 0), failed: suites.reduce((sum, suite) => sum + suite.failed, 0), scope: "TypeScript suites only, on this working tree. Contracts are not run here."};
}

const args = process.argv.slice(2);
const at = new Date().toISOString();
const [chainLines, listed, agents, spend] = await Promise.all([attempt(lines), attempt(skillsListed), attempt(signedAgents), attempt(sponsor)]);
const report = {
    at,
    chain: 13579,
    ourWallets: [...OURS],
    lines: chainLines,
    skills: listed,
    agentsWithASignedAddress: agents,
    sponsor: spend,
    repository: repository(),
    measurements: measurements(),
    ...(args.includes("--tests") ? {tests: tests()} : {}),
};

const rows: [string, string][] = [];
const row = (label: string, value: string | number) => rows.push([label, String(value)]);
const NOT_READ = (value: {notRead: string}) => `not read (${value.notRead})`;

let verdict = "The lines could not be read, so this run says nothing about who wrote them.";
if (failed(chainLines)) row("result lines", NOT_READ(chainLines));
else {
    const {results, uses, holders} = chainLines;
    row("result lines, 13579", `${results.total}: ${chainLines.aboutASkill} about a skill, ${chainLines.aboutSomethingElse} about something else`);
    row("  written by our wallets", results.ours);
    row("  written by other wallets", results.others);
    row("  with a domain / a reason", `${chainLines.withADomain} / ${chainLines.withAReason}`);
    row("  holders, test agents we paid for", holders.paidByUs.length);
    row("  holders we did not pay for", holders.independent.length);
    row("`uses` edges, 13579", `${uses.total}: ${uses.ours} by our wallets, ${uses.others} by ${uses.otherWallets} other wallets`);
    row("first result line", chainLines.first === null ? "none" : `${chainLines.first.at} ${chainLines.first.term}`);
    row("  transaction", chainLines.first?.explorer ?? "none");
    row("latest result line", chainLines.latest === null ? "none" : `${chainLines.latest.at} ${chainLines.latest.term}`);
    row("  transaction", chainLines.latest?.explorer ?? "none");
    verdict =
        results.others === 0 && holders.independent.length === 0
            ? `All ${results.total} result lines so far are ours: our wallets wrote them, and any other holder is a test agent our treasury paid for. No third party has reported a result on a skill yet. The ${uses.others} \`uses\` edges by other wallets each say a use, and none of those wallets wrote a result.`
            : `${results.others} result lines by other wallets and ${holders.independent.length} holders we did not pay for: read them before saying no third party has reported a result.`;
}
if (failed(listed)) row("skills listed", NOT_READ(listed));
else row("skills listed, 13579", `${listed.total}, ${listed.listedByUs} of them by our wallets`);
if (failed(agents)) row("agents with a signed address", NOT_READ(agents));
else row("agents with a signed address", `${agents.total}, ${agents.ownedByUs} owned by our wallets`);
if (failed(spend)) row("sponsor address", NOT_READ(spend));
else {
    row("sponsor address", spend.address);
    row("  balance now", `${spend.balanceNow} tTRUST`);
    row("  transactions, whole life", spend.transactions ?? "not read");
    row("  deposits sent, after fees", `${spend.deposits}, ${spend.depositedAfterFees} tTRUST`);
}
const {repository: repo, measurements: measured} = report;
row("commits", `${repo.commits} on ${repo.branch} at ${repo.head}, since ${repo.firstCommit}`);
row("test files tracked", repo.testFiles);
row("tests", report.tests === undefined ? "not run (--tests runs them)" : `${report.tests.passed} passed, ${report.tests.failed} failed, TypeScript only`);
row("measurement files", `${measured.files} of ${measured.kinds} kinds, ${measured.oldest} to ${measured.newest}`);
row("git tags on a measurement", measured.gitTagsOnAMeasurement);

const width = Math.max(...rows.map(([label]) => label.length));
console.log(`Measured ${at}. Testnet 13579, reads only.\n`);
for (const [label, value] of rows) console.log(`${label.padEnd(width)}  ${value}`);
console.log(`\n${verdict}`);
if (!failed(spend)) console.log(`\nSponsor: ${spend.note}`);

if (!args.includes("--no-file")) {
    const file = join("data", "measurements", `proof-of-work-${at.slice(0, 16).replace(":", "")}.json`);
    writeFileSync(join(ROOT, file), `${JSON.stringify({...report, verdict}, null, 1)}\n`);
    console.log(`\nWrote ${file}`);
}
