/** Put ARP's own skill in ARP's registry: the skill, its repository, `source` and `has tag`.
 *
 *      ARP_TARGET=testnet bun run scripts/seed/seed-own-skill.ts --json /tmp/own-skill.json
 *      bun run scripts/agent/agent-send-plan.ts --chain 13579 --plan /tmp/own-skill.json --execute
 *
 *  Plans and prints. **Signs nothing and sends nothing** (ADR `0038`).
 *
 *  `seed-skills.ts` cannot do this one. It reads the skills.sh measurement, which does not list
 *  `Wieedze/ARP`, and it points `source` at repository atoms that already exist, which this one
 *  did not. Same identifiers as the other 662 (ADR `0077`): the skill is
 *  `github.com/<owner>/<repo>?skill=<name>`, the repository is its URL, and the domain is what
 *  {@link classifySkill} reads from the SKILL.md's own description.
 */
import {readFileSync, writeFileSync} from "node:fs";

import {formatEther, stringToHex, type Hex} from "viem";

import {
    atomDataForUri,
    encodeCreateAtoms,
    encodeCreateTriples,
    multiVaultReads,
} from "../../packages/protocol/src/declare/index.js";
import {normaliseToolUrl, toolAtomUri} from "../../packages/protocol/src/declare/tool-thing.js";
import {HAS_TAG} from "../../packages/protocol/src/sources/intuition/terms.js";
import {classifySkill} from "../../packages/protocol/src/skill-domains.js";

const REPO = "Wieedze/ARP";
const SKILL = "arp";
const SKILL_FILE = "skills/arp/SKILL.md";

/** `source`, already on chain — the constant and its check are in `seed-skills.ts`. */
const SOURCE = "0xe6b33153a6f58b47bcfe074cd154447608d5788e96446246536ddb9cd84105a4" as Hex;

function arg(name: string): string | undefined {
    const index = process.argv.indexOf(`--${name}`);
    return index === -1 ? undefined : process.argv[index + 1];
}

/** The frontmatter's `description:` line, the one text a classifier and a reader both see. */
export function frontmatterDescription(markdown: string): string {
    const line = markdown.split("\n").find((text) => text.startsWith("description: "));
    if (line === undefined) throw new Error("no description: line in the frontmatter");
    return line.slice("description: ".length).trim();
}

const chainId = 13579;
if ((process.env["ARP_TARGET"] ?? "testnet") !== "testnet") {
    console.error("refusing: this plan is for testnet 13579 only.");
    process.exit(1);
}

const record = (await import(`../../data/deployments/${chainId}.json`)) as {
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

const description = frontmatterDescription(readFileSync(SKILL_FILE, "utf8"));
const domain = classifySkill(SKILL, description);
if (domain === null) throw new Error("the description matches no domain keyword");

const repoUrl = normaliseToolUrl(`https://github.com/${REPO}`);
const skillUrl = normaliseToolUrl(`https://github.com/${REPO}?skill=${SKILL}`);
const repoData = atomDataForUri(toolAtomUri(repoUrl));
const skillData = atomDataForUri(toolAtomUri(skillUrl));
const [repoId, skillId, domainId] = await Promise.all([
    reads.atomId(repoData),
    reads.atomId(skillData),
    reads.atomId(stringToHex(domain)),
]);
if (!(await reads.termExists(domainId))) throw new Error(`domain \`${domain}\` is not on chain`);

const [sourceId, tagId] = await Promise.all([
    reads.tripleId(skillId, SOURCE, repoId),
    reads.tripleId(skillId, HAS_TAG as Hex, domainId),
]);
const [repoOn, skillOn, sourceOn, tagOn] = await Promise.all(
    [repoId, skillId, sourceId, tagId].map((id) => reads.termExists(id)),
);

console.log(`chain        ${chainId}`);
console.log(`skill        ${skillUrl}  ${skillOn ? "on chain" : "to create"}  ${skillId}`);
console.log(`repository   ${repoUrl}  ${repoOn ? "on chain" : "to create"}  ${repoId}`);
console.log(`source       ${sourceOn ? "on chain" : "to write"}  ${sourceId}`);
console.log(`has tag      ${domain}  ${tagOn ? "on chain" : "to write"}  ${tagId}`);

type PlannedCall = {kind: string; chainId: number; to: Hex; value: string; data: Hex; why: string};
const calls: PlannedCall[] = [];

const atoms = [
    ...(repoOn ? [] : [{atomData: repoData, assets: atomAssets}]),
    ...(skillOn ? [] : [{atomData: skillData, assets: atomAssets}]),
];
if (atoms.length > 0) {
    calls.push({
        kind: "create-atom",
        chainId,
        to: multiVault,
        value: (atomAssets * BigInt(atoms.length)).toString(),
        data: encodeCreateAtoms(atoms),
        why: `ARP's own skill and repository: ${atoms.length} atom(s)`,
    });
}
const triples = [
    ...(sourceOn ? [] : [{subjectId: skillId, predicateId: SOURCE, objectId: repoId, assets: tripleAssets}]),
    ...(tagOn ? [] : [{subjectId: skillId, predicateId: HAS_TAG as Hex, objectId: domainId, assets: tripleAssets}]),
];
if (triples.length > 0) {
    calls.push({
        kind: "create-triple",
        chainId,
        to: multiVault,
        value: (tripleAssets * BigInt(triples.length)).toString(),
        data: encodeCreateTriples(triples),
        why: `source and has tag ${domain} for ${SKILL}`,
    });
}

const total = calls.reduce((sum, call) => sum + BigInt(call.value), 0n);
console.log(`\n${calls.length} calls · ${formatEther(total)} tTRUST`);
if (calls.length === 0) process.exit(0);

const jsonPath = arg("json");
if (jsonPath !== undefined) {
    writeFileSync(jsonPath, JSON.stringify(calls, null, 2));
    console.log(`plan written to ${jsonPath}`);
}
