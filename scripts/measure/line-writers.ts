/** Who wrote the result lines and the `uses` edges on testnet 13579. Holds no key.
 *
 *      bun run scripts/measure/line-writers.ts
 *
 *  `docs/30` says no third party has reported a result on a skill: this is the check. The result lines are the
 *  `has outcome` triples. The `uses` edges are printed too, because a `uses` edge alone is a line (`docs/28`) and
 *  most of them are not ours, so "no third party wrote a line" would be false. A wallet holding a position on a result
 *  line can also stand behind it (`pulse-usage.ts`), so holders outside our two wallets are counted as well. The two
 *  wallets are the signers recorded in `data/measurements/pulse-walk-2026-11-05.jsonl`.
 */
import {writeFileSync} from "node:fs";

import {stringToHex, type Hex} from "viem";

import deployment from "../../data/deployments/13579.json";
import {multiVaultReads} from "../../packages/protocol/src/declare/multivault.ts";
import {HAS_OUTCOME_LABEL} from "../../packages/protocol/src/declare/usage-context.ts";

const OURS = new Set(["0x906f3a52ec089f8d4e9127f91c6be5ae0d18f91f", "0xe596096f4176b682e300d73963e7b04b383c1aa1"]);
const USES = "0x5c0bde1cc696456c0268248c4656acdf9621fdb39e605bc99b0a83dc8ff6e800"; // as in `scripts/measure/line-cost.ts`
const PAGE = 250;

const reads = multiVaultReads({address: deployment.intuition.multiVault as Hex, chainId: 13579, rpcUrl: deployment.chain.rpcUrl}); // an address in this repo's record
const hasOutcome = await reads.atomId(stringToHex(HAS_OUTCOME_LABEL));

async function writers(predicate: string): Promise<{total: number; truncated: boolean; ours: number; others: number; otherWallets: number; holdersOutsideOurs: number}> {
    const response = await fetch(deployment.chain.graphqlUrl, {
        method: "POST",
        headers: {"content-type": "application/json"},
        body: JSON.stringify({
            query: `query($p: String!, $l: Int!) { triples(where: {predicate_id: {_eq: $p}}, limit: $l) { creator_id positions(where: {shares: {_gt: "0"}}) { account_id } } }`,
            variables: {p: predicate, l: PAGE},
        }),
    });
    const body = (await response.json()) as {data?: {triples: {creator_id: string; positions: {account_id: string}[]}[]}; errors?: unknown}; // the query's shape, checked on the next line
    if (body.data === undefined) throw new Error(`graphql: ${JSON.stringify(body.errors)}`);
    const creators = body.data.triples.map((row) => row.creator_id.toLowerCase());
    const others = creators.filter((creator) => !OURS.has(creator));
    const holders = new Set(body.data.triples.flatMap((row) => row.positions.map((position) => position.account_id.toLowerCase())).filter((holder) => !OURS.has(holder)));
    return {total: creators.length, truncated: creators.length === PAGE, ours: creators.length - others.length, others: others.length, otherWallets: new Set(others).size, holdersOutsideOurs: holders.size};
}

const at = new Date().toISOString();
const result = {at, chain: 13579, ourWallets: [...OURS], resultLines: await writers(hasOutcome), usesEdges: await writers(USES)};
console.log(JSON.stringify(result, null, 1));
writeFileSync(`data/measurements/line-writers-${at.slice(0, 16).replace(":", "")}.json`, `${JSON.stringify(result, null, 1)}\n`);
