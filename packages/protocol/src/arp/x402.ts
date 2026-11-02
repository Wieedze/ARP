/**
 * Where ARP takes x402 payments while it is on testnet: USDC on Base Sepolia, settled by the public
 * x402.org facilitator (ADR `0094` §4, ADR `0105`).
 *
 * In `src/arp/` because it names a chain, and this is the one namespace allowed to
 * (`rules/portability.md`). The rest of `src/x402/` takes these as config.
 *
 * Read 2026-11-02, by `curl -s https://x402.org/facilitator/supported`: an unauthenticated GET answers
 * 200 and lists `{"x402Version":2,"scheme":"exact","network":"eip155:84532"}`. No API key. The
 * mainnet facilitator is a different question and is not answered here.
 */
export const X402_TESTNET = {
    /** Base Sepolia, as CAIP-2 names it. The x402 v2 wire format uses CAIP-2, not a chain name. */
    network: "eip155:84532",
    chainId: 84532,
    /** The public facilitator. "Intended for development and testnet workflows" (docs.x402.org). */
    facilitatorUrl: "https://x402.org/facilitator",
    /** Circle's USDC on Base Sepolia, the asset `@x402/evm` prices a `$` amount in on this network. */
    usdc: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
} as const;
