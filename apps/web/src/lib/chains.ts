import { defineChain } from "viem";

/**
 * Intuition Testnet chain definition.
 *
 * Canonical reference: deployments/13579.json (chain section).
 * MetaMask Delegation Framework v1.3.0 is deployed on this chain — see
 * the same file's metamaskDelegationFramework section for contract addresses.
 *
 * Read-only RPC and explorer URLs come from VITE_ env vars so they can be
 * overridden in deploy environments (e.g. preview branches). The defaults
 * below match the values documented in the intuition skill.
 */
export const intuitionTestnet = defineChain({
    id: 13579,
    name: "Intuition Testnet",
    nativeCurrency: {decimals: 18, name: "Test Trust", symbol: "tTRUST"},
    rpcUrls: {
        default: {
            http: [
                import.meta.env.VITE_INTUITION_TESTNET_RPC_URL ??
                    "https://testnet.rpc.intuition.systems/http",
            ],
        },
    },
    blockExplorers: {
        default: {
            name: "Intuition Testnet Explorer",
            url:
                import.meta.env.VITE_INTUITION_TESTNET_EXPLORER ??
                "https://testnet.explorer.intuition.systems",
        },
    },
    testnet: true,
});
