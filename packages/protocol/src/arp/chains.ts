/**
 * The two Intuition chain definitions, and **the only place in this package that names a chain**.
 *
 * `rules/portability.md` measures and protects that invariant: everything outside `src/arp/` takes
 * `graphqlUrl` and `rpcUrls` keyed by `chainId`, and a plan carries its own `chainId`. This file is
 * the one exception, because an L3 is not in viem's chain registry and a consumer cannot resolve it.
 *
 * **It used to be 790 lines across six files** — an `ArpClient`, a `ModuleRegistry` reader, an
 * agent-reputation surface, a third copy of three ABIs, and a `TESTNET_DEPLOYMENT` of ARP's own
 * addresses. Measured 2026-10-21: every one of those exports had **zero consumers** outside this
 * package. They were the surface ADR `0051` retired — ARP points at tools hosted elsewhere and keeps
 * no catalogue — and `ModuleRegistry.sol` and `DomainScopeEnforcer.sol` went the same day.
 */
import {defineChain} from "viem";

/**
 * The Intuition Testnet chain definition (chainId 13579). Intuition is
 * an L3 not yet indexed by Etherscan, so consumers can't auto-resolve
 * the chain from viem — we bake it in here.
 */
export const intuitionTestnet = defineChain({
    id: 13579,
    name: "Intuition Testnet",
    nativeCurrency: {decimals: 18, name: "Test Trust", symbol: "tTRUST"},
    rpcUrls: {
        default: {http: ["https://testnet.rpc.intuition.systems/http"]},
    },
    blockExplorers: {
        default: {
            name: "Intuition Testnet Explorer",
            url: "https://testnet.explorer.intuition.systems",
        },
    },
    testnet: true,
});

/**
 * The Intuition Mainnet chain definition (chainId 1155).
 */
export const intuitionMainnet = defineChain({
    id: 1155,
    name: "Intuition",
    nativeCurrency: {decimals: 18, name: "Intuition", symbol: "TRUST"},
    rpcUrls: {
        default: {http: ["https://rpc.intuition.systems/http"]},
    },
    blockExplorers: {
        default: {
            name: "Intuition Explorer",
            url: "https://explorer.intuition.systems",
        },
    },
});
