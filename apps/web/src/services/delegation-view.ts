import {delegationHash} from "@arp-protocol/core";
import {getSmartAccountsEnvironment, type Delegation} from "@metamask/smart-accounts-kit";
import {decodeAbiParameters, getAddress, type Address, type Hex} from "viem";

import {intuitionTestnet} from "../lib/chains";
import {deployments} from "../lib/deployments";

/**
 * One stored delegation, read back for a row on `/account`: who may act, under which caveats, and
 * the hash the `DelegationManager` keys its revocation by.
 *
 * The caveats are decoded from the signed struct itself, never from what the form asked for, so the
 * row shows what the signature covers. An enforcer this page does not know is listed by address,
 * not dropped: hiding a caveat would show a delegation as looser than it is, or tighter.
 */
export type CaveatView =
    | {kind: "stake-cap"; enforcer: Address; cap: bigint; periodSeconds: bigint}
    | {kind: "named"; enforcer: Address; name: string}
    | {kind: "unknown"; enforcer: Address};

export type DelegationView = {
    hash: Hex;
    delegate: Address;
    delegator: Address;
    caveats: CaveatView[];
};

const ENVIRONMENT = getSmartAccountsEnvironment(intuitionTestnet.id);

/** Enforcer address → the framework's own name for it, minus the `Enforcer` suffix. */
const NAMES = new Map<string, string>(
    Object.entries(ENVIRONMENT.caveatEnforcers).map(([name, address]) => [
        address.toLowerCase(),
        name.replace(/Enforcer$/, ""),
    ]),
);

function decodeStakeCap(terms: Hex): {cap: bigint; periodSeconds: bigint} | null {
    try {
        const [cap, periodSeconds] = decodeAbiParameters(
            [{type: "uint256"}, {type: "uint256"}],
            terms,
        );
        return {cap, periodSeconds};
    } catch {
        return null;
    }
}

export function describeCaveat(caveat: {enforcer: Hex; terms: Hex}): CaveatView {
    const enforcer = getAddress(caveat.enforcer);
    if (enforcer.toLowerCase() === deployments.arp.trustStakeCapEnforcer.toLowerCase()) {
        const decoded = decodeStakeCap(caveat.terms);
        if (decoded !== null) return {kind: "stake-cap", enforcer, ...decoded};
        return {kind: "unknown", enforcer};
    }
    const name = NAMES.get(enforcer.toLowerCase());
    return name === undefined ? {kind: "unknown", enforcer} : {kind: "named", enforcer, name};
}

export function describeDelegation(delegation: Delegation): DelegationView {
    return {
        // Checksummed first: viem's struct hash rejects a mixed-case address that fails its
        // checksum, and the case is not part of what was signed (an address encodes as 20 bytes).
        hash: delegationHash({
            delegate: getAddress(delegation.delegate),
            delegator: getAddress(delegation.delegator),
            authority: delegation.authority,
            caveats: delegation.caveats.map(({enforcer, terms, args}) => ({
                enforcer: getAddress(enforcer),
                terms,
                args,
            })),
            salt: delegation.salt,
            signature: delegation.signature,
        }),
        delegate: getAddress(delegation.delegate),
        delegator: getAddress(delegation.delegator),
        caveats: delegation.caveats.map(describeCaveat),
    };
}

/** `86400n` → `1d`. Whole units only; anything else is printed in seconds. */
export function formatPeriod(seconds: bigint): string {
    if (seconds > 0n && seconds % 86_400n === 0n) return `${seconds / 86_400n}d`;
    if (seconds > 0n && seconds % 3_600n === 0n) return `${seconds / 3_600n}h`;
    return `${seconds}s`;
}
