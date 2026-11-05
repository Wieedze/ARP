import {isAddress, type Address} from "viem";

import {intuitionTestnet} from "./chains";

/**
 * The address ARP's sponsoring service deposits from on this chain, or `null`.
 *
 * What it sends to an agent is what `/tools` counts as _signals_ (ADR `0143`). The
 * service is testnet-only (`security.md`, the signing table), so mainnet has none whatever the
 * environment says: a mainnet figure read off a testnet key would be two chains in one
 * number.
 *
 * `configured` is `VITE_ARP_SPONSOR_ADDRESS`; unset or blank, `recorded`, the address in
 * `data/deployments/13579.json`, is used instead (task 58). Malformed, it is `null`, and `/tools`
 * has no Signals to show — never a guess.
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
