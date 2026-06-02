import {createPublicClient, createWalletClient, http, type Hex} from "viem";
import {privateKeyToAccount} from "viem/accounts";

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

/**
 * Build a wallet client backed by a raw private key. Used by:
 *   - The CLI demo script (Task 03b Phase 4) to drive both user and agent
 *     identities from `.env`.
 *   - Unit tests that need a deterministic signer without going through the
 *     browser wallet path.
 *
 * The browser UI (Task 04b) uses a separate WalletClient created from the
 * connected MetaMask provider — that path lives in the UI layer, not here.
 */
export function walletClientFromKey(privateKey: Hex) {
    const account = privateKeyToAccount(privateKey);
    return createWalletClient({
        account,
        chain: intuitionTestnet,
        transport: http(),
    });
}
