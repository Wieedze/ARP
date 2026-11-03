import {isAddress, type Address} from "viem";

import {intuitionTestnet} from "./chains";

/**
 * The address ARP's sponsoring service deposits from on this chain, or `null`.
 *
 * `/tools` counts a deposit from it as _proven_ (ADR `0094` §2). Most passed the proof gate, but not
 * all: the edge creations the service paid for count too, and so do the deployer's own writes from
 * the same key before the service existed (`scripts/measure/sponsor-deposit-provenance.ts`). The
 * service is testnet-only (`security.md`, the signing table), so mainnet has none whatever the
 * environment says: a mainnet figure labelled proven by a testnet key would be two chains in one
 * number.
 *
 * `configured` is `VITE_ARP_SPONSOR_ADDRESS`; unset or blank, `recorded`, the address in
 * `data/deployments/13579.json`, is used instead (task 58). The service has run since task 50, and
 * with the environment as the only source nobody had set it, so the Usage column was empty and every
 * sponsored deposit read as declared. Malformed, it is `null` and every deposit reads as declared — never a guess.
 */
export function sponsorAddressFor(
    chainId: number,
    configured: string | undefined,
    recorded?: string,
): Address | null {
    // `.env.example` ships the key empty, and an empty value is not a choice of address.
    const raw = configured === undefined || configured.trim() === "" ? recorded : configured;
    if (chainId !== intuitionTestnet.id || raw === undefined) return null;
    const trimmed = raw.trim();
    return isAddress(trimmed, {strict: false}) ? trimmed : null;
}
