import {
    encodeAbiParameters,
    keccak256,
    toBytes,
    type Hex,
} from "viem";

import {deployments} from "./deployments";

import {type Caveat} from "@metamask/smart-accounts-kit";

/**
 * Caveat builders for the two ARP custom enforcers deployed at the addresses
 * recorded in `deployments/13579.json`. Each builder returns a raw `Caveat`
 * (struct `{ enforcer, terms, args }`) ready to be placed in a delegation's
 * `caveats` array — the SDK does not auto-wrap our custom enforcers because
 * they are not part of the MetaMask standard enforcer catalogue.
 *
 * `terms` is the ABI-encoded byte payload the enforcer's `beforeHook`
 * decodes via `abi.decode(...)`. The encoding here MUST match the Solidity
 * decode line, otherwise the on-chain validation reverts at redemption.
 */

/**
 * `DomainScopeEnforcer` caveat. `terms` is `abi.encode(bytes32[])` where each
 * element is `keccak256(bytes(domain))`. Hashing on this side avoids
 * accidental case mismatches and saves on-chain calldata.
 *
 * @param allowedDomains  Domain identifiers the agent is permitted to
 *                        register modules in (e.g. `["solidity-audit"]`).
 *                        Must be non-empty; the enforcer reverts on
 *                        empty list.
 */
export function domainScopeCaveat(allowedDomains: string[]): Caveat {
    if (allowedDomains.length === 0) {
        throw new Error("domainScopeCaveat: allowedDomains must be non-empty");
    }
    const hashes = allowedDomains.map((d) => keccak256(toBytes(d)));
    const terms = encodeAbiParameters([{type: "bytes32[]"}], [hashes]);
    return {
        enforcer: deployments.arp.domainScopeEnforcer,
        terms,
        args: "0x" as Hex,
    };
}

/**
 * `TrustStakeCapEnforcer` caveat. `terms` is `abi.encode(uint256, uint256)`
 * with the per-window cap and the rolling-window length in seconds.
 *
 * @param cap            Maximum cumulative native-token spend per window
 *                       (in wei — tTRUST has 18 decimals on Intuition).
 * @param periodSeconds  Window length in seconds. Must be > 0; the enforcer
 *                       reverts on zero.
 */
export function trustStakeCapCaveat(cap: bigint, periodSeconds: bigint): Caveat {
    if (periodSeconds === 0n) {
        throw new Error("trustStakeCapCaveat: periodSeconds must be > 0");
    }
    const terms = encodeAbiParameters(
        [{type: "uint256"}, {type: "uint256"}],
        [cap, periodSeconds],
    );
    return {
        enforcer: deployments.arp.trustStakeCapEnforcer,
        terms,
        args: "0x" as Hex,
    };
}
