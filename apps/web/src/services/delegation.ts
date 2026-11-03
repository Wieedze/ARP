import {
    type Caveat,
    type Delegation,
    type Implementation,
    type MetaMaskSmartAccount,
} from "@metamask/smart-accounts-kit";
import {bytesToHex, parseEther, type Hex} from "viem";

import {composeAndStakeCaveats} from "../lib/caveat-builder";

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
const ROOT_AUTHORITY: Hex = "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";

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
 * userOp through a Bundler before relying on this.
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
 * The cap typed into `/account`'s form, in tTRUST, as wei — or why it is not one. Zero is refused:
 * a zero cap signs a delegation that can never spend, which reads as a guard rail and is none.
 */
export function parseCapInput(text: string): {cap: bigint} | {error: string} {
    const trimmed = text.trim();
    if (!/^\d+(\.\d{1,18})?$/.test(trimmed)) return {error: "Cap must be a tTRUST amount"};
    const cap = parseEther(trimmed);
    return cap === 0n ? {error: "Cap must be above 0"} : {cap};
}

/**
 * The unsigned delegation `/account` signs: the operator's Smart Account lets `delegate` call the
 * MultiVault's three composing methods, under a cumulative cap per fixed window
 * (`composeAndStakeCaveats`). It was `/rig` step 4, and it is the only UI that builds one.
 */
export function stakeDelegation(params: {
    delegator: Hex;
    delegate: Hex;
    cap: bigint;
    periodSeconds: bigint;
    salt?: Hex;
}): Omit<Delegation, "signature"> {
    return buildDelegation({
        delegator: params.delegator,
        delegate: params.delegate,
        caveats: composeAndStakeCaveats({cap: params.cap, periodSeconds: params.periodSeconds}),
        salt: params.salt ?? randomSalt(),
    });
}
