import {createPublicClient, http} from "viem";

import {intuitionTestnet} from "./chains";

/**
 * Read-only public client bound to Intuition Testnet. Used for all view
 * calls (`readContract`, `simulateContract`, `getAtomCost`, etc.). Constructed
 * from the same `intuitionTestnet` chain definition consumed by the UI
 * (Wagmi later wraps this in Task 04+), so the chain ID and RPC URL are
 * the single source of truth declared in `chains.ts`.
 */
export const publicClient = createPublicClient({
    chain: intuitionTestnet,
    transport: http(),
});
