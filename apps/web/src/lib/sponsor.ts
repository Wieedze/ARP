import {isAddress, type Address} from "viem";

import {intuitionTestnet} from "./chains";

/**
 * The address ARP's sponsoring service deposits from on this chain, or `null`.
 *
 * A deposit it sent to an agent passed the proof gate, and `/tools` counts it as _proven_ (ADRs
 * `0094`, `0143`). The
 * service is testnet-only (`security.md`, the signing table), so mainnet has none whatever the
 * environment says: a mainnet figure labelled proven by a testnet key would be two chains in one
 * number.
 *
 * Config, from `VITE_ARP_SPONSOR_ADDRESS`. Unset or malformed, it is `null`, and `/tools` has no
 * Usage to show — never a guess.
 */
export function sponsorAddressFor(chainId: number, raw: string | undefined): Address | null {
    if (chainId !== intuitionTestnet.id || raw === undefined) return null;
    const trimmed = raw.trim();
    return isAddress(trimmed, {strict: false}) ? trimmed : null;
}
