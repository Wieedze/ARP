/** What a domain tree costs on a given chain, read off the chain rather than copied.
 *
 *      ARP_TARGET=testnet bun run scripts/measure/domain-seed-costs.ts
 *
 *  Read-only. Signs nothing. Exists because `rules/portability.md` measured `getAtomCost()` and
 *  `getTripleCost()` 100x apart between the two chains, so a figure tuned on testnet is wrong by
 *  two orders of magnitude on mainnet.
 */
import {formatEther} from "viem";

import {multiVaultReads} from "../../packages/protocol/src/declare/index.js";

import mainnetDeployment from "../../data/deployments/1155.json";
import testnetDeployment from "../../data/deployments/13579.json";

const TARGETS = {mainnet: 1155, testnet: 13579} as const;
const RPCS: Record<number, string> = {
    1155: "https://rpc.intuition.systems/http",
    13579: "https://testnet.rpc.intuition.systems/http",
};

const targetName = (process.env.ARP_TARGET ?? "testnet") as keyof typeof TARGETS;
const chainId = TARGETS[targetName];
if (chainId === undefined) throw new Error(`unknown ARP_TARGET ${String(targetName)}`);

/** Read from `data/deployments/`, never from a constant here: the address differs per chain and a
 *  default at module scope is what `rules/portability.md` rule 1 forbids. */
const MULTIVAULTS: Record<number, string> = {
    1155: (mainnetDeployment as {intuition: {multiVault: string}}).intuition.multiVault,
    13579: (testnetDeployment as {intuition: {multiVault: string}}).intuition.multiVault,
};

const reads = multiVaultReads({
    address: MULTIVAULTS[chainId] as `0x${string}`,
    chainId,
    rpcUrl: RPCS[chainId] as string,
});
const [atomCost, tripleCost, minDeposit] = await Promise.all([
    reads.atomCost(),
    reads.tripleCost(),
    reads.minDeposit(),
]);

const perAtom = atomCost + minDeposit;
const perTriple = tripleCost + minDeposit;

console.log(`chain ${chainId} (${targetName})`);
console.log(`  getAtomCost()   ${formatEther(atomCost)}`);
console.log(`  getTripleCost() ${formatEther(tripleCost)}`);
console.log(`  minDeposit      ${formatEther(minDeposit)}`);
console.log(`  per atom   (cost + minDeposit) ${formatEther(perAtom)}`);
console.log(`  per triple (cost + minDeposit) ${formatEther(perTriple)}`);

for (const [label, atoms, triples] of [
    ["smoke test: root + 2 domains, 2 hierarchy edges, 1 has tag", 3, 3],
    ["a 12-domain first level, flat under one root", 13, 12],
] as [string, number, number][]) {
    const total = perAtom * BigInt(atoms) + perTriple * BigInt(triples);
    console.log(`\n  ${label}`);
    console.log(`    ${atoms} atoms + ${triples} triples = ${formatEther(total)}`);
}

// A module, not a global script — see the note in predicate-objects.ts.
export {};
