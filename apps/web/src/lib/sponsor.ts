import {isAddress, type Address} from "viem";

import {intuitionTestnet} from "./chains";

/**
 * The address ARP's sponsoring service deposits from on this chain, or `null`.
 *
 * A deposit it sent passed the proof gate, and `/tools` counts it as _proven_ (ADR `0094` §2). The
 * service is testnet-only (`security.md`, the signing table), so mainnet has none whatever the
 * environment says: a mainnet figure labelled proven by a testnet key would be two chains in one
 * number.
 *
 * Config, from `VITE_ARP_SPONSOR_ADDRESS`, because no sponsoring service exists yet (task 40).
 * Unset or malformed, it is `null` and every deposit reads as declared — never a guess.
 */
export function sponsorAddressFor(chainId: number, raw: string | undefined): Address | null {
    if (chainId !== intuitionTestnet.id || raw === undefined) return null;
    const trimmed = raw.trim();
    return isAddress(trimmed, {strict: false}) ? trimmed : null;
}
