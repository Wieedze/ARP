/** Move each catalogued MCP server's identity from its repository to what an agent calls — its
 *  package, or its remote endpoint — and price it.
 *
 *      ARP_TARGET=testnet AGENT_ADDRESS=0x… bun run scripts/seed/plan-tool-identity.ts [--json /tmp/p.json]
 *      bun run scripts/agent/agent-send-plan.ts --chain 13579 --plan /tmp/p.json --execute
 *
 *  Plans and prints. **Signs nothing and sends nothing** — `agent-send-plan.ts` is the only place
 *  in this repo that holds a key (ADR `0038`).
 *
 *  ## What it plans
 *
 *  ADR `0087`: a tool is the thing an agent calls, and its repository is where it comes from. The
 *  catalogue registered the 22 MCP servers under their `github.com` URL, so today the atom tagged
 *  `mcp` is the repository. For each server whose package is **confirmed**:
 *
 *    1. the package atom, `npmjs.com/package/<name>` or `pypi.org/project/<name>` — the form the
 *       hook resolves a configured server to (`apps/hook/src/mcp-config.ts:141`), so the CLI and
 *       the web land on one atom;
 *    2. `(package, source, repository)`, the predicate the skills already carry;
 *    3. `(package, has tag, npm package | pypi package)`, `(package, has tag, mcp)`, and its domain
 *       tag when it has one — several tags, one per branch (ADR `0074`);
 *    4. a redemption of ARP's position on the repository's `mcp` and domain tags. The repository
 *       keeps `maintained`. A redeemed triple leaves ARP's reading and stays on chain for ever.
 *
 *  ## Confirmed means the registry says so
 *
 *  Candidates come from the README (`npx`, `uvx`, `pip install`) and the root `package.json` /
 *  `pyproject.toml`. A candidate is confirmed only when the registry's own record points back at
 *  this repository (`repository.url` on npm, `project_urls` on PyPI). A package that merely exists
 *  is not enough: a README can cite somebody else's package, and a wrong atom is permanent.
 *  Everything unconfirmed is printed for the user and planned for nobody.
 *
 *  ## A remote endpoint is planned only once the user validated it
 *
 *  `data/catalogue/remote-endpoints.json` lists candidates; an entry with `validated` is one the user
 *  accepted from `apps/probe`'s reading (an MCP OAuth `resource_metadata` header, or a JSON-RPC
 *  result to `initialize`). It is tagged `remote server` in place of a registry's kind. The probe
 *  determines; this plans; a person signs — the probe never writes (ADR `0089`).
 */
import {writeFileSync} from "node:fs";

import {formatEther, getAddress, stringToHex, type Hex} from "viem";

import catalogue from "../../data/catalogue/tools.json";
import remoteEndpoints from "../../data/catalogue/remote-endpoints.json";
import proposal from "../../data/catalogue/domains.proposal.json";
import {
    atomDataForUri,
    encodeCreateAtoms,
    encodeCreateTriples,
    encodeRedeem,
    multiVaultReads,
} from "../../packages/protocol/src/declare/index.js";
import {HAS_TAG} from "../../packages/protocol/src/sources/intuition/terms.js";
import {normaliseToolUrl, toolAtomUri} from "../../packages/protocol/src/declare/tool-thing.js";

const TARGETS = {mainnet: 1155, testnet: 13579} as const;

/** `source`, the same constant `seed-skills.ts` checked against `calculateAtomId`. */
const SOURCE = "0xe6b33153a6f58b47bcfe074cd154447608d5788e96446246536ddb9cd84105a4" as Hex;

/** The kind tags. Compounds, so each is listed in `domains.proposal.json` `compounds` (ADR `0088`). */
const KIND_TAG = {npm: "npm package", pypi: "pypi package", endpoint: "remote server"} as const;

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
    console.error("refusing mainnet: no ADR authorises ARP seeding the catalogue on 1155.");
    process.exit(1);
}
const attestorEnv = process.env["AGENT_ADDRESS"];
if (attestorEnv === undefined || !/^0x[0-9a-fA-F]{40}$/.test(attestorEnv)) {
    console.error("AGENT_ADDRESS must be set: it holds the positions to redeem and signs the plan.");
    process.exit(1);
}
const attestor = getAddress(attestorEnv);

const compounds = new Set(
    (proposal as {compounds: {label: string; why: string}[]}).compounds
        .filter((entry) => entry.why.trim().length > 0)
        .map((entry) => entry.label),
);
for (const label of Object.values(KIND_TAG)) {
    if (!compounds.has(label)) {
        console.error(`refusing "${label}": list it under \`compounds\` with its reason (ADR 0088).`);
        process.exit(1);
    }
}

// ---- 1. resolve each repository to its package, off chain ------------------------------------

type Registry = "npm" | "pypi";
type Candidate = {registry: Registry; name: string};
type Resolution =
    | {state: "confirmed"; registry: Registry; name: string; url: string}
    | {state: "unconfirmed"; candidates: string[]; remotes: string[]};

const githubToken = process.env["GITHUB_TOKEN"];

async function text(url: string, headers: Record<string, string> = {}): Promise<string | null> {
    const response = await fetch(url, {headers});
    return response.ok ? response.text() : null;
}

async function readme(repo: string): Promise<string> {
    const headers: Record<string, string> = {Accept: "application/vnd.github.raw"};
    if (githubToken !== undefined) headers["Authorization"] = `Bearer ${githubToken}`;
    return (await text(`https://api.github.com/repos/${repo}/readme`, headers)) ?? "";
}

/** `@scope/name@1.2` and `name@latest` both lose their version; a scope's own `@` stays. */
function stripVersion(spec: string): string {
    const at = spec.indexOf("@", spec.startsWith("@") ? 1 : 0);
    return at === -1 ? spec : spec.slice(0, at);
}

function candidatesFrom(readmeText: string): {candidates: Candidate[]; remotes: string[]} {
    const found: Candidate[] = [];
    const npmSpec = "(@?[a-z0-9][\\w.-]*(?:\\/[\\w.-]+)?(?:@[\\w.^~-]+)?)";
    for (const match of readmeText.matchAll(new RegExp(`npx\\s+(?:-y\\s+|--yes\\s+)?${npmSpec}`, "gi"))) {
        found.push({registry: "npm", name: stripVersion(match[1] ?? "")});
    }
    // The JSON config form: `"command": "npx", "args": ["-y", "@scope/name"]`.
    for (const match of readmeText.matchAll(/"command"\s*:\s*"npx"[\s\S]{0,120}?"args"\s*:\s*\[([^\]]*)\]/g)) {
        const first = [...(match[1] ?? "").matchAll(/"([^"]+)"/g)]
            .map((arg) => arg[1] ?? "")
            .find((arg) => !arg.startsWith("-"));
        if (first !== undefined) found.push({registry: "npm", name: stripVersion(first)});
    }
    for (const match of readmeText.matchAll(/(?:uvx\s+(?:--from\s+)?|pip install\s+)([a-z0-9][\w.-]*)/gi)) {
        found.push({registry: "pypi", name: match[1] ?? ""});
    }
    const remotes = [
        ...new Set(
            [...readmeText.matchAll(/https:\/\/[^\s"'`)<>\]]+\/(?:mcp|sse)\b/g)].map((m) => m[0]),
        ),
    ];
    return {candidates: found.filter((c) => c.name.length > 1), remotes};
}

async function manifestCandidates(repo: string): Promise<Candidate[]> {
    const out: Candidate[] = [];
    const pkg = await text(`https://raw.githubusercontent.com/${repo}/HEAD/package.json`);
    if (pkg !== null) {
        try {
            const parsed = JSON.parse(pkg) as {name?: unknown; private?: unknown};
            if (typeof parsed.name === "string" && parsed.private !== true) {
                out.push({registry: "npm", name: parsed.name});
            }
        } catch (error) {
            console.error(`  ${repo}: package.json does not parse (${String(error)})`);
        }
    }
    const pyproject = await text(`https://raw.githubusercontent.com/${repo}/HEAD/pyproject.toml`);
    const pyName = pyproject?.match(/^\s*name\s*=\s*"([^"]+)"/m)?.[1];
    if (pyName !== undefined) out.push({registry: "pypi", name: pyName});
    return out;
}

/** Does the registry's own record point at this repository? */
async function pointsBack(candidate: Candidate, repo: string): Promise<boolean> {
    const needle = `github.com/${repo}`.toLowerCase();
    if (candidate.registry === "npm") {
        const body = await text(`https://registry.npmjs.org/${candidate.name.replace("/", "%2f")}/latest`);
        if (body === null) return false;
        const record = JSON.parse(body) as {repository?: string | {url?: string}};
        const url = typeof record.repository === "string" ? record.repository : (record.repository?.url ?? "");
        return url.toLowerCase().replace(/\.git$/, "").includes(needle);
    }
    const body = await text(`https://pypi.org/pypi/${candidate.name}/json`);
    if (body === null) return false;
    const record = JSON.parse(body) as {info?: {project_urls?: Record<string, string> | null; home_page?: string | null}};
    const urls = [...Object.values(record.info?.project_urls ?? {}), record.info?.home_page ?? ""];
    return urls.some((url) => url.toLowerCase().replace(/\.git$/, "").replace(/\/$/, "").endsWith(needle));
}

function packageUrl(candidate: Candidate): string {
    return candidate.registry === "npm"
        ? `https://www.npmjs.com/package/${candidate.name}`
        : `https://pypi.org/project/${candidate.name}`;
}

async function resolve(repo: string): Promise<Resolution> {
    const fromReadme = candidatesFrom(await readme(repo));
    const all = [...fromReadme.candidates, ...(await manifestCandidates(repo))];
    const unique = [...new Map(all.map((c) => [`${c.registry}:${c.name}`, c])).values()];
    const confirmed: Candidate[] = [];
    for (const candidate of unique) if (await pointsBack(candidate, repo)) confirmed.push(candidate);
    const only = confirmed.length === 1 ? confirmed[0] : undefined;
    if (only !== undefined) {
        return {state: "confirmed", registry: only.registry, name: only.name, url: normaliseToolUrl(packageUrl(only))};
    }
    // Several confirmed is a monorepo publishing more than one server: the user picks, not a regex.
    return {
        state: "unconfirmed",
        candidates: (confirmed.length > 1 ? confirmed : unique).map((c) => `${c.registry}:${c.name}${confirmed.includes(c) ? " ✓" : ""}`),
        remotes: fromReadme.remotes,
    };
}

type Tool = {url: string; kind: string};
const servers = (catalogue as {tools: Tool[]}).tools.filter((tool) => tool.kind === "mcp-server");
const assignment = (proposal as {_toolAssignment: {tools: {url: string; does: string | null; is: string}[]; unassignedTools: {url: string; does?: string | null; is: string}[]}})._toolAssignment;
const tagsOf = new Map(
    [...assignment.tools, ...assignment.unassignedTools].map((row) => [row.url, {does: row.does ?? null, is: row.is}]),
);

console.log(`resolving ${servers.length} MCP servers${githubToken === undefined ? " (GitHub unauthenticated)" : ""}\n`);
const resolved: {repoUrl: string; repo: string; resolution: Resolution}[] = [];
for (const server of servers) {
    const repo = new URL(server.url).pathname.slice(1);
    const resolution = await resolve(repo);
    resolved.push({repoUrl: server.url, repo, resolution});
    if (resolution.state === "confirmed") {
        console.log(`  ✓ ${repo.padEnd(42)} ${resolution.url.slice("https://".length)}`);
    } else {
        const seen = [...resolution.candidates, ...resolution.remotes.map((r) => `remote:${r}`)];
        console.log(`  ? ${repo.padEnd(42)} ${seen.length === 0 ? "nothing found" : seen.slice(0, 4).join("  ")}`);
    }
}

// ---- 2. price it on chain ----------------------------------------------------------------------

const record = (await import(`../../data/deployments/${chainId}.json`)) as {
    default: {intuition: {multiVault: string}; chain: {rpcUrl: string}};
};
const multiVault = record.default.intuition.multiVault as Hex;
const rpcUrl =
    process.env["INTUITION_RPC_URL"] ?? process.env["INTUITION_TESTNET_RPC_URL"] ?? record.default.chain.rpcUrl;
const {createPublicClient, http} = await import("viem");
const client = createPublicClient({transport: http(rpcUrl)});
const reads = multiVaultReads({address: multiVault, chainId, client});

const [stake, atomCost, tripleCost, curveId] = await Promise.all([
    reads.minDeposit(),
    reads.atomCost(),
    reads.tripleCost(),
    reads.defaultCurveId(),
]);
const atomAssets = atomCost + stake;
const tripleAssets = tripleCost + stake;

type PlannedCall = {kind: string; chainId: number; to: Hex; value: string; data: Hex; why: string};
const calls: PlannedCall[] = [];
const newAtoms: {data: Hex; why: string}[] = [];
const newTriples: {subjectId: Hex; predicateId: Hex; objectId: Hex; why: string}[] = [];
const redeems: {termId: Hex; shares: bigint; floor: bigint; why: string}[] = [];

const labelIds = new Map<string, Hex>();
async function labelAtom(label: string): Promise<Hex> {
    const known = labelIds.get(label);
    if (known !== undefined) return known;
    const data = stringToHex(label);
    const id = await reads.atomId(data);
    labelIds.set(label, id);
    if (!(await reads.termExists(id))) newAtoms.push({data, why: `the tag "${label}"`});
    return id;
}

async function planTriple(subjectId: Hex, predicateId: Hex, objectId: Hex, why: string): Promise<void> {
    const id = await reads.tripleId(subjectId, predicateId, objectId);
    if (!(await reads.termExists(id))) newTriples.push({subjectId, predicateId, objectId, why});
}

async function planRedeem(subjectId: Hex, objectId: Hex, why: string): Promise<void> {
    const id = await reads.tripleId(subjectId, HAS_TAG as Hex, objectId);
    if (!(await reads.termExists(id))) return;
    // Two endpoints from one repository retire the same repository tag: once, or the second fails.
    if (redeems.some((redeem) => redeem.termId === id)) return;
    const shares = await reads.sharesOf(attestor, id, curveId);
    if (shares === 0n) return;
    const preview = await reads.previewRedeem(id, curveId, shares);
    redeems.push({termId: id, shares, floor: preview.assetsAfterFees, why});
}

for (const {repoUrl, repo, resolution} of resolved) {
    if (resolution.state !== "confirmed") continue;
    const tags = tagsOf.get(repoUrl);
    const repoId = await reads.atomId(atomDataForUri(toolAtomUri(repoUrl)));
    const packageData = atomDataForUri(toolAtomUri(resolution.url));
    const packageId = await reads.atomId(packageData);
    if (!(await reads.termExists(packageId))) newAtoms.push({data: packageData, why: resolution.url});

    await planTriple(packageId, SOURCE, repoId, `${resolution.name} source ${repo}`);
    const kindLabels = [KIND_TAG[resolution.registry], tags?.is ?? "mcp"];
    if (tags?.does) kindLabels.push(tags.does);
    for (const label of kindLabels) {
        await planTriple(packageId, HAS_TAG as Hex, await labelAtom(label), `${resolution.name} has tag ${label}`);
    }
    for (const label of [tags?.is ?? "mcp", ...(tags?.does ? [tags.does] : [])]) {
        await planRedeem(repoId, await labelAtom(label), `retire "${repo} has tag ${label}"`);
    }
}

/** `domain` overrides the repository's: `null` when the repository's tag does not describe this
 *  server — one repository can publish several, and each carries only what it does. */
type Endpoint = {repo: string; endpoint: string; validated?: string; domain?: string | null};
const validated = (remoteEndpoints as {endpoints: Endpoint[]}).endpoints.filter((row) => row.validated !== undefined);
console.log(`\nendpoints    ${validated.length} validated by the user`);
for (const row of validated) {
    const repoUrl = `https://github.com/${row.repo}`;
    const tags = tagsOf.get(repoUrl);
    const url = normaliseToolUrl(row.endpoint);
    const repoId = await reads.atomId(atomDataForUri(toolAtomUri(repoUrl)));
    const endpointData = atomDataForUri(toolAtomUri(url));
    const endpointId = await reads.atomId(endpointData);
    if (!(await reads.termExists(endpointId))) newAtoms.push({data: endpointData, why: url});
    const name = url.slice("https://".length);

    await planTriple(endpointId, SOURCE, repoId, `${name} source ${row.repo}`);
    const does = row.domain !== undefined ? row.domain : (tags?.does ?? null);
    const labels = [KIND_TAG.endpoint, tags?.is ?? "mcp", ...(does ? [does] : [])];
    for (const label of labels) {
        await planTriple(endpointId, HAS_TAG as Hex, await labelAtom(label), `${name} has tag ${label}`);
    }
    for (const label of [tags?.is ?? "mcp", ...(tags?.does ? [tags.does] : [])]) {
        await planRedeem(repoId, await labelAtom(label), `retire "${row.repo} has tag ${label}"`);
    }
}

if (newAtoms.length > 0) {
    calls.push({
        kind: "create-atom",
        chainId,
        to: multiVault,
        value: (atomAssets * BigInt(newAtoms.length)).toString(),
        data: encodeCreateAtoms(newAtoms.map((atom) => ({atomData: atom.data, assets: atomAssets}))),
        why: newAtoms.map((atom) => atom.why).join(", "),
    });
}
// Eight a call: the RPC meters bytes, not gas (`seed-skills.ts`).
for (let at = 0; at < newTriples.length; at += 8) {
    const group = newTriples.slice(at, at + 8);
    calls.push({
        kind: "create-triple",
        chainId,
        to: multiVault,
        value: (tripleAssets * BigInt(group.length)).toString(),
        data: encodeCreateTriples(group.map(({why: _why, ...triple}) => ({...triple, assets: tripleAssets}))),
        why: group.map((triple) => triple.why).join("; "),
    });
}
for (const redeem of redeems) {
    calls.push({
        kind: "redeem",
        chainId,
        to: multiVault,
        // Redeem is not payable; `minAssets` is `previewRedeem`'s figure, never zero.
        value: "0",
        data: encodeRedeem(attestor, redeem.termId, curveId, redeem.shares, redeem.floor),
        why: redeem.why,
    });
}

const spent = calls.reduce((sum, call) => sum + BigInt(call.value), 0n);
const returned = redeems.reduce((sum, redeem) => sum + redeem.floor, 0n);
const confirmedCount = resolved.filter((row) => row.resolution.state === "confirmed").length;

console.log(`\nchain        ${chainId} (${targetName})`);
console.log(`confirmed    ${confirmedCount} of ${servers.length} · the rest are planned for nobody`);
console.log(`atoms        ${newAtoms.length} × ${formatEther(atomAssets)}`);
console.log(`triples      ${newTriples.length} × ${formatEther(tripleAssets)}`);
console.log(`redeems      ${redeems.length}, returning ${formatEther(returned)} after fees`);
console.log(`spent        ${formatEther(spent)} tTRUST · net ${formatEther(spent - returned)}`);
console.log(`balance      ${formatEther(await client.getBalance({address: attestor}))} tTRUST`);

const jsonPath = arg("json");
if (calls.length === 0) {
    console.log("nothing to plan.");
} else if (jsonPath === undefined) {
    console.log(`\n${calls.length} calls · pass --json <path> to write the plan`);
} else {
    writeFileSync(jsonPath, JSON.stringify(calls, null, 2));
    console.log(`\n${calls.length} calls · plan written to ${jsonPath}`);
}

// A module, not a global script — see the note in scripts/measure/predicate-objects.ts.
export {};
