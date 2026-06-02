import {
    signDelegation as sdkSignDelegationViaEOA,
    type Caveat,
    type Delegation,
    type Implementation,
    type MetaMaskSmartAccount,
} from "@metamask/smart-accounts-kit";
import {bytesToHex, type Hex} from "viem";

import {deployments} from "../lib/deployments";

/**
 * Build + sign ARP delegations.
 *
 * ARP delegations are always:
 *   - `delegator`  = the user's Smart Account address
 *   - `delegate`   = the agent EOA address (separate from the user's EOA)
 *   - `authority`  = ROOT_AUTHORITY (this is a root delegation, not a sub-delegation
 *                    in a chain)
 *   - `caveats`    = ARP's two custom enforcers (see `lib/caveat-builder.ts`),
 *                    optionally composed with MetaMask standard enforcers
 *
 * The SDK's `createDelegation` helper requires a `scope` (one of MetaMask's
 * standard scope types) or a parent delegation — neither fits ARP, which
 * uses purely custom enforcers. We therefore construct the Delegation
 * struct manually. The struct shape is the framework's canonical type.
 */

/** `ROOT_AUTHORITY` per the Delegation Framework — top-level (no parent). */
export const ROOT_AUTHORITY: Hex =
    "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";

const ZERO_SALT: Hex = `0x${"00".repeat(32)}`;

/**
 * Build an unsigned ARP delegation.
 *
 * @param salt  Optional 32-byte salt distinguishing this delegation from
 *              other (delegator, delegate, caveats) tuples. If unspecified,
 *              `randomSalt()` is recommended for production — defaulting to
 *              zero here makes test fixtures deterministic.
 */
export function buildDelegation(params: {
    delegator: Hex;
    delegate: Hex;
    caveats: Caveat[];
    salt?: Hex;
}): Omit<Delegation, "signature"> {
    return {
        delegate: params.delegate,
        delegator: params.delegator,
        authority: ROOT_AUTHORITY,
        caveats: params.caveats,
        salt: params.salt ?? ZERO_SALT,
    };
}

/** Generate a cryptographically-random 32-byte salt. */
export function randomSalt(): Hex {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    return bytesToHex(bytes);
}

/**
 * Sign a delegation via the user's Smart Account. The SA's `signDelegation`
 * method routes the EIP-712 signature through the SA's configured owner
 * (the user's EOA for Hybrid, a passkey for WebAuthn, etc.).
 *
 * IMPORTANT: the Smart Account MUST be deployed on-chain before the
 * DelegationManager can validate the signature (it falls back to ERC-1271
 * which calls `isValidSignature` on the SA's bytecode). MetaMask SAs
 * deploy lazily on the first userOp — so for first-use, send a no-op
 * userOp through a Bundler before relying on this. Until the UI bundler
 * is wired (Task 04b), use `signDelegationViaEOA` for demos.
 */
export async function signDelegationAs<TImpl extends Implementation>(params: {
    delegation: Omit<Delegation, "signature">;
    smartAccount: MetaMaskSmartAccount<TImpl>;
}): Promise<Delegation> {
    const signature = await params.smartAccount.signDelegation({
        delegation: params.delegation,
    });
    return {...params.delegation, signature};
}

/**
 * Sign a delegation with an EOA private key directly. The signer becomes
 * the delegator — no Smart Account intermediation, just standard ECDSA
 * over EIP-712 typed data. Validated by the DelegationManager via
 * `ecrecover` (the cheapest validation path).
 *
 * Used by the Task 03b Phase 4 CLI demo to keep the on-chain flow
 * working before Smart Account deployment infrastructure (Bundler) is
 * wired up. ADR records this choice.
 *
 * @param chainId               Defaults to Intuition Testnet (13579) per
 *                              `deployments/13579.json`.
 * @param delegationManager     Defaults to the deployed DelegationManager
 *                              address from the same file.
 */
export async function signDelegationViaEOA(params: {
    delegation: Omit<Delegation, "signature">;
    privateKey: Hex;
    chainId?: number;
    delegationManager?: Hex;
}): Promise<Delegation> {
    const signature = await sdkSignDelegationViaEOA({
        privateKey: params.privateKey,
        delegation: params.delegation,
        chainId: params.chainId ?? deployments.chain.chainId,
        delegationManager: params.delegationManager ?? deployments.metamaskDelegationFramework.delegationManager,
    });
    return {...params.delegation, signature};
}

/**
 * Serialize a `Delegation` to a JSON-safe string. Useful for localStorage,
 * postMessage, or off-chain transport. `bigint` is not handled because
 * the canonical `Delegation` struct uses `Hex` for `salt` (no bigints).
 */
export function serializeDelegation(delegation: Delegation): string {
    return JSON.stringify(delegation);
}

export function deserializeDelegation(serialized: string): Delegation {
    // Trusted: writers are app-controlled; runtime validation would be
    // theatre — if a corrupted blob reaches us, downstream redeem will revert.
    return JSON.parse(serialized) as Delegation;
}
