/** What a level of a line costs, written or held by deposit, and who declares each `uses` edge. Testnet 13579, holds no key.
 *
 *      bun run scripts/measure/line-cost.ts
 *
 *  Small vaults only: the fractions above `feeThreshold` were not read, and neither was mainnet.
 */
import {writeFileSync} from "node:fs";

import {createPublicClient, http, parseAbi, type Hex} from "viem";

import deployment from "../../data/deployments/13579.json";
import {PULSE_USES_QUERY} from "../../packages/graphql/src/queries/pulse-usage.ts";

const USES = "0x5c0bde1cc696456c0268248c4656acdf9621fdb39e605bc99b0a83dc8ff6e800";
const graphql = async (query: string, variables: Record<string, unknown>) => {
    const response = await fetch(deployment.chain.graphqlUrl, {method: "POST", headers: {"content-type": "application/json"}, body: JSON.stringify({query, variables})});
    return ((await response.json()) as {data: {triples: Record<string, unknown>[]}}).data.triples; // the query's shape
};
const client = createPublicClient({transport: http(deployment.chain.rpcUrl)});
const address = deployment.intuition.multiVault as Hex; // an address in this repo's record
const abi = parseAbi([
    "function getVaultFees() view returns (uint256,uint256,uint256)",
    "function getTripleCost() view returns (uint256)",
    "function getBondingCurveConfig() view returns (address,uint256)",
    "function getGeneralConfig() view returns (address,address,uint256,uint256,uint256,uint256,uint256,uint256)",
    "function previewDeposit(bytes32,uint256,uint256) view returns (uint256,uint256)",
    "function previewRedeem(bytes32,uint256,uint256) view returns (uint256,uint256)",
]);

const objects = await graphql(`query($u: String!) { triples(where: {predicate_id: {_eq: $u}}, limit: 250) { object_id } }`, {u: USES});
const tools = [...new Set(objects.map((row) => row["object_id"] as string))]; // the query's shape
const edges = (await graphql(PULSE_USES_QUERY, {tools, uses: USES, limit: 250})) as {term_id: Hex; object_id: string; creator_id: string; positions: {account_id: string}[]}[]; // the query's shape

const [fees, tripleCost, [, curve], general] = await Promise.all([
    client.readContract({address, abi, functionName: "getVaultFees"}),
    client.readContract({address, abi, functionName: "getTripleCost"}),
    client.readContract({address, abi, functionName: "getBondingCurveConfig"}),
    client.readContract({address, abi, functionName: "getGeneralConfig"}),
]);
const minDeposit = general[4]; // read from the chain, never a copy (`portability.md`)
const term = edges[0]?.term_id as Hex; // 185 edges exist
const [shares] = await client.readContract({address, abi, functionName: "previewDeposit", args: [term, curve, minDeposit]});
const [back] = await client.readContract({address, abi, functionName: "previewRedeem", args: [term, curve, shares]});

const perTool = tools.map((tool) => {
    const own = edges.filter((edge) => edge.object_id === tool);
    const creators = new Set(own.map((edge) => edge.creator_id));
    const declarers = new Set(own.flatMap((edge) => [edge.creator_id, ...edge.positions.map((position) => position.account_id)]));
    return {tool, walletsThatWroteAnEdge: creators.size, walletsWithAPositionToo: declarers.size};
});
const result = {
    at: new Date().toISOString(),
    chain: 13579,
    vaultFeesOverTenThousand: fees.map(String),
    general: general.map(String),
    createFee: tripleCost.toString(),
    depositOneLevel: minDeposit.toString(),
    redeemBack: back.toString(),
    roundTripLoss: (minDeposit - back).toString(),
    createFeeOverRoundTripLoss: Number(tripleCost) / Number(minDeposit - back),
    edges: edges.length,
    edgesWithAHolderOtherThanTheirWriter: edges.filter((edge) => edge.positions.some((position) => position.account_id !== edge.creator_id)).length,
    // Had a position alone made a declarer, which the user rejected (ADR `0138`).
    toolsWhoseWalletCountWouldHaveChanged: perTool.filter((row) => row.walletsThatWroteAnEdge !== row.walletsWithAPositionToo).length,
    largestChanges: perTool.sort((a, b) => b.walletsWithAPositionToo - b.walletsThatWroteAnEdge - (a.walletsWithAPositionToo - a.walletsThatWroteAnEdge)).slice(0, 3),
};
console.log(JSON.stringify(result, null, 1));
writeFileSync(`data/measurements/line-cost-${result.at.slice(0, 16).replace(":", "")}.json`, `${JSON.stringify(result, null, 1)}\n`);
