/** Form B of the ontology page, on a real use: each qualifier is about the previous one. Testnet 13579 only.
 *
 *      bun run scripts/demo/pulse-nested-walk.ts                        plan, spends nothing
 *      bun run scripts/demo/pulse-nested-walk.ts --execute              signs with AGENT_PRIVATE_KEY
 *
 *  ((((agent 6, uses, cut-silences), in context of, video), has outcome, failed), because, missing-key)
 *
 *  The first two levels are on chain since the walk of 2026-11-05. The use is the one recorded in
 *  `data/measurements/pulse-walk-2026-11-05.jsonl`: the skill's prerequisite script stops without
 *  ELEVENLABS_API_KEY. Then it walks the graph back from `video` and prints what each query returned.
 *  The signer is checked against AGENT_ADDRESS, and the key is never printed (ADR `0037`).
 */
import {appendFileSync} from "node:fs";

import {getAddress, stringToHex, type Hex} from "viem";
import {privateKeyToAccount} from "viem/accounts";

import deployment from "../../data/deployments/13579.json";
import {encodeCreateAtom, encodeCreateTriple, multiVaultReads} from "../../packages/protocol/src/declare/multivault.ts";
import {RAW_KEY_CHAIN_ID, sendPlan, type SerialisedCall} from "../helpers/send-plan.ts";

const EDGE: Hex = "0xd2d718776d0a" as Hex;
const execute = process.argv.includes("--execute");
const IN_CONTEXT_OF = deployment.arp.endpointBinding.inContextOf as Hex; // a 32-byte id in this repo's record
const GRAPHQL = deployment.chain.graphqlUrl;

const key = process.env["AGENT_PRIVATE_KEY"];
const expected = process.env["AGENT_ADDRESS"];
if (!key || !expected) throw new Error("AGENT_PRIVATE_KEY and AGENT_ADDRESS are required");
const signer = privateKeyToAccount((key.startsWith("0x") ? key : `0x${key}`) as Hex).address; // a key is hex
if (getAddress(signer) !== getAddress(expected)) throw new Error(`the key signs as ${signer}, not ${expected}`);

const reads = multiVaultReads({
    address: deployment.intuition.multiVault as Hex, // an address in this repo's record
    chainId: RAW_KEY_CHAIN_ID,
    rpcUrl: deployment.chain.rpcUrl,
});

async function gql(query: string, variables: Record<string, unknown>) {
    const response = await fetch(GRAPHQL, {
        method: "POST",
        headers: {"content-type": "application/json"},
        body: JSON.stringify({query, variables}),
    });
    const body = (await response.json()) as {data?: Record<string, unknown>; errors?: unknown}; // checked next
    if (body.data === undefined) throw new Error(JSON.stringify(body.errors).slice(0, 300));
    return body.data;
}

const rows = (await gql(
    `query($prefix: String!, $signer: String!) { triples(where: {term_id: {_gte: $prefix}, creator_id: {_eq: $signer}}, order_by: {term_id: asc}, limit: 1) { term_id } }`,
    {prefix: EDGE, signer},
))["triples"] as {term_id: Hex}[]; // the query's shape
const usesEdge = rows[0]?.term_id;
if (usesEdge === undefined || !usesEdge.startsWith(EDGE)) throw new Error("the recorded edge was not found");

const [atomCost, tripleCost, stake] = await Promise.all([reads.atomCost(), reads.tripleCost(), reads.minDeposit()]);
const calls: SerialisedCall[] = [];
const push = (kind: string, value: bigint, data: Hex, why: string) =>
    calls.push({kind, chainId: RAW_KEY_CHAIN_ID, to: reads.address, value: value.toString(), data, why});

async function atom(label: string): Promise<Hex> {
    const data = stringToHex(label);
    const id = await reads.atomId(data);
    if (!(await reads.termExists(id))) push("create-atom", atomCost + stake, encodeCreateAtom(data, atomCost + stake), `the word "${label}"`);
    return id;
}
async function triple(subject: Hex, predicate: Hex, object: Hex, why: string): Promise<Hex> {
    const id = await reads.tripleId(subject, predicate, object);
    if (!(await reads.termExists(id))) push("create-triple", tripleCost + stake, encodeCreateTriple(subject, predicate, object, tripleCost + stake), why);
    return id;
}

const video = await reads.atomId(stringToHex("video"));
const hasOutcome = await atom("has outcome");
const failed = await atom("failed");
const because = await atom("because");
const missingKey = await atom("missing-key");
const level2 = await reads.tripleId(usesEdge, IN_CONTEXT_OF, video);
if (!(await reads.termExists(level2))) throw new Error("level 2 is not on chain");
const level3 = await triple(level2, hasOutcome, failed, "level 3: in video, it failed");
const level4 = await triple(level3, because, missingKey, "level 4: because a key is missing");

console.log(JSON.stringify({usesEdge, level2, level3, level4, calls: calls.map((call) => [call.kind, call.why])}, null, 1));
const result = await sendPlan({calls, chainId: RAW_KEY_CHAIN_ID, rpcUrl: deployment.chain.rpcUrl, keyName: "AGENT_PRIVATE_KEY", execute});
const printable = JSON.parse(JSON.stringify(result, (_key, value) => (typeof value === "bigint" ? value.toString() : value))) as Record<string, unknown>; // a plain copy
console.log(JSON.stringify({status: printable["status"], hashes: printable["hashes"], revertedAt: printable["revertedAt"]}));

if (execute && result.status === "sent") {
    await new Promise((done) => setTimeout(done, 12_000));
    const started = Date.now();
    // Walk back from the domain, as a reader would: no id known but the words.
    const inVideo = (await gql(`query($p: String!, $o: String!) { triples(where: {predicate_id: {_eq: $p}, object_id: {_eq: $o}}, limit: 250) { term_id subject_id creator_id } }`, {p: IN_CONTEXT_OF, o: video}))["triples"] as {term_id: string; subject_id: string}[]; // the query's shape
    const outcomes = (await gql(`query($s: [String!]!, $p: String!) { triples(where: {subject_id: {_in: $s}, predicate_id: {_eq: $p}}, limit: 250) { term_id subject_id object { label } } }`, {s: inVideo.map((row) => row.term_id), p: hasOutcome}))["triples"] as {term_id: string; subject_id: string; object: {label: string} | null}[]; // the query's shape
    const reasons = (await gql(`query($s: [String!]!, $p: String!) { triples(where: {subject_id: {_in: $s}, predicate_id: {_eq: $p}}, limit: 250) { subject_id object { label } } }`, {s: outcomes.map((row) => row.term_id), p: because}))["triples"] as {subject_id: string; object: {label: string} | null}[]; // the query's shape
    const edges = (await gql(`query($t: [String!]!) { triples(where: {term_id: {_in: $t}}, limit: 250) { term_id subject { label } object { term_id } predicate_id } }`, {t: inVideo.map((row) => row.subject_id)}))["triples"] as {term_id: string; subject: {label: string} | null; object: {term_id: string} | null}[]; // the query's shape
    console.log(JSON.stringify({queries: 4, ms: Date.now() - started, inVideo: inVideo.length, outcomes: outcomes.map((row) => row.object?.label), reasons: reasons.map((row) => row.object?.label), agents: edges.map((row) => row.subject?.label)}));
    const walked = outcomes.some((row) => row.term_id.toLowerCase() === level3.toLowerCase()) && reasons.some((row) => row.object?.label === "missing-key");
    console.log(`walked back from video to the reason: ${walked}`);
    appendFileSync(
        `data/measurements/pulse-walk-2026-11-05.jsonl`,
        `${JSON.stringify({at: new Date().toISOString(), agent: "13579/6", signer, form: "B", usesEdge, level2, level3, level4, note: "Form B on the cut-silences failure already declared. The reason was read in the script, not observed by running it.", walkedBack: walked, result: printable})}\n`,
    );
}
