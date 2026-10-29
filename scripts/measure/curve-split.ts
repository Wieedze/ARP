/** The two bonding curves on one term, and whether they are different enough to carry two jobs.
 *
 *      bun run scripts/measure/curve-split.ts
 *
 *  Read-only. Signs nothing.
 *
 *  The design question: a term has one vault PER CURVE, so the same claim can host two markets. If
 *  one curve is flat, a position on it is a **registration** — capital in, capital out, no timing
 *  edge, so a verifier holding one has no financial interest in its own verdict. If the other rises,
 *  a position on it is a **bet**. That separation is what keeps speculation from poisoning
 *  verification, and the protocol would be providing it rather than us building it.
 */
import {createPublicClient, formatEther, http, parseAbi} from "viem";

import record from "../../deployments/1155.json";

const client = createPublicClient({transport: http("https://rpc.intuition.systems/http")});
const multiVault = record.intuition.multiVault as `0x${string}`;

const mvAbi = parseAbi([
    "function getBondingCurveConfig() view returns ((address registry, uint256 defaultCurveId))",
    "function currentSharePrice(bytes32 termId, uint256 curveId) view returns (uint256)",
    "function getVault(bytes32 termId, uint256 curveId) view returns (uint256 totalAssets, uint256 totalShares)",
    "function previewDeposit(bytes32 termId, uint256 curveId, uint256 assets) view returns (uint256 shares, uint256 assetsAfterFees)",
]);
const registryAbi = parseAbi([
    "function count() view returns (uint256)",
    "function curveAddresses(uint256 curveId) view returns (address)",
]);
const curveAbi = parseAbi(["function name() view returns (string)"]);

const config = await client.readContract({
    address: multiVault,
    abi: mvAbi,
    functionName: "getBondingCurveConfig",
});
console.log(`bonding curve registry  ${config.registry}`);
console.log(`defaultCurveId          ${config.defaultCurveId}`);

const count = await client.readContract({
    address: config.registry,
    abi: registryAbi,
    functionName: "count",
});
console.log(`curves                  ${count}`);

/** `(zet.box) uses (Cursor)` — the richest `uses` edge on mainnet, so both curves may hold something. */
const TERM = "0x0001e21b0f7ab0d32b2363d661cd95b4fb2a05ee75d164fb46920148af54fe3b" as const;
const ONE = 10n ** 18n;

for (let curveId = 1n; curveId <= count; curveId++) {
    const address = await client.readContract({
        address: config.registry,
        abi: registryAbi,
        functionName: "curveAddresses",
        args: [curveId],
    });
    const name = await client
        .readContract({address, abi: curveAbi, functionName: "name"})
        .catch(() => "(no name())");
    const price = await client
        .readContract({address: multiVault, abi: mvAbi, functionName: "currentSharePrice", args: [TERM, curveId]})
        .catch(() => null);
    const vault = await client
        .readContract({address: multiVault, abi: mvAbi, functionName: "getVault", args: [TERM, curveId]})
        .catch(() => null);
    // What 1 TRUST buys, which is the number that decides whether being early pays.
    const preview = await client
        .readContract({address: multiVault, abi: mvAbi, functionName: "previewDeposit", args: [TERM, curveId, ONE]})
        .catch(() => null);

    console.log(`\ncurve ${curveId}  ${name}`);
    console.log(`  address        ${address}`);
    console.log(`  share price    ${price === null ? "—" : formatEther(price)}`);
    if (vault !== null) {
        console.log(`  this term      ${formatEther(vault[0])} assets · ${formatEther(vault[1])} shares`);
    }
    if (preview !== null) {
        console.log(`  1 TRUST buys   ${formatEther(preview[0])} shares (after ${formatEther(ONE - preview[1])} of fees)`);
    }
}

// A module, not a global script — see the note in predicate-objects.ts.
export {};
