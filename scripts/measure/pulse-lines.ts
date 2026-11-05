/** Read the real lines of the two skills of the walk with the reader the tool uses, and count the forms on 13579. Holds no key.
 *
 *      bun run scripts/measure/pulse-lines.ts
 */
import {writeFileSync} from "node:fs";

import {stringToHex, type Hex} from "viem";

import deployment from "../../data/deployments/13579.json";
import {BECAUSE_LABEL, HAS_OUTCOME_LABEL} from "../../packages/protocol/src/declare/usage-context.ts";
import {multiVaultReads} from "../../packages/protocol/src/declare/multivault.ts";
import {findToolAtoms, getPulseUsage} from "../../packages/protocol/src/pulse-usage.ts";
import {toolAtomUri} from "../../packages/protocol/src/index.ts";

const SKILLS = [
    "https://github.com/nateherkai/herk-edit-kit?skill=cut-silences",
    "https://github.com/agenticluke/claude-skill-video-editing-plus?skill=video-editing",
];
const graphqlUrl = deployment.chain.graphqlUrl;
const inContextOf = deployment.arp.endpointBinding.inContextOf;
const reads = multiVaultReads({address: deployment.intuition.multiVault as Hex, chainId: 13579, rpcUrl: deployment.chain.rpcUrl}); // an address in this repo's record
const hasOutcome = await reads.atomId(stringToHex(HAS_OUTCOME_LABEL));
const because = await reads.atomId(stringToHex(BECAUSE_LABEL));

const uris = SKILLS.map(toolAtomUri);
const atoms = await findToolAtoms(uris, {graphqlUrl});
const usage = await getPulseUsage([...atoms.values()], {graphqlUrl, inContextOf, hasOutcome, because});
const skills = SKILLS.map((url, at) => {
    const atom = atoms.get(uris[at] ?? "");
    const read = atom === undefined ? undefined : usage.get(atom.toLowerCase());
    return {url, atom, lines: read?.declarations.flatMap((row) => row.lines.map((line) => ({writer: row.writer, agent: row.agent.label, ...line}))) ?? [], byReason: read?.byReason ?? {}};
});

const response = await fetch(graphqlUrl, {
    method: "POST",
    headers: {"content-type": "application/json"},
    body: JSON.stringify({
        query: `query($p: String!) { triples(where: {predicate_id: {_eq: $p}}, limit: 250) { subject_id object { label } positions(where: {shares: {_gt: "0"}}) { shares } } }`,
        variables: {p: hasOutcome},
    }),
});
const body = (await response.json()) as {data: {triples: {subject_id: string; object: {label: string} | null; positions: {shares: string}[]}[]}}; // the query's shape
const contexts = await fetch(graphqlUrl, {
    method: "POST",
    headers: {"content-type": "application/json"},
    body: JSON.stringify({
        query: `query($p: String!, $s: [String!]!) { triples(where: {predicate_id: {_eq: $p}, term_id: {_in: $s}}, limit: 250) { term_id } }`,
        variables: {p: inContextOf, s: body.data.triples.map((row) => row.subject_id)},
    }),
});
const nested = new Set(((await contexts.json()) as {data: {triples: {term_id: string}[]}}).data.triples.map((row) => row.term_id)); // the query's shape
const outcomes = body.data.triples;
const forms = {
    at: new Date().toISOString(),
    chain: 13579,
    outcomeLines: outcomes.length,
    formB: outcomes.filter((row) => nested.has(row.subject_id)).length,
    // Form A and a form B outcome with no domain look the same on chain.
    onTheEdge: outcomes.filter((row) => !nested.has(row.subject_id)).length,
    distinctPositionSizes: [...new Set(outcomes.flatMap((row) => row.positions.map((position) => position.shares)))],
};
console.log(JSON.stringify({forms, skills}, null, 1));
writeFileSync(`data/measurements/pulse-lines-${forms.at.slice(0, 16).replace(":", "")}.json`, `${JSON.stringify({forms, skills}, null, 1)}\n`);
