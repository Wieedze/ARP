import type {Address, Hex} from "viem";

import {encodeDeposit, encodeRedeem, type MultiVaultReads} from "./multivault.js";
import type {PreparedCall} from "./types.js";

/**
 * Taking a position on an atom, and leaving one. **Plans, never transactions.**
 *
 * ## Why this is not `prepareStakeOnUsed`
 *
 * A vault is a vault, and `encodeDeposit` is term-agnostic — this module could have been a second
 * argument to that one. ADR `0056` is the reason it is not: depositing on a `(agent, uses, tool)`
 * edge says *this claim is true*, and depositing on an atom says *this thing is worth something*.
 * The ADR draws that line hard — the edge is "a receipt that costs money to write", the atom's
 * vault is "a market" — and the user's framing is the title of it: _« soit on mise sur un agent
 * soit on retire notre mise de l'agent, c'est un market donc pas un signal, juste une bourse
 * d'agents et d'outils »_. One planner for both acts would be the blur that ADR exists to stop.
 *
 * ## Why the exit ships with the entrance
 *
 * Same ADR, and it is not symmetry for its own sake: **a deposit nobody can withdraw is a donation**
 * and a one-directional market is a collection box. The app has had both since 2026-10-21. The
 * connector has had neither, so an agent could read a market through ARP and never join it — which
 * is the gap this module closes: measured 2026-10-28, **2,354 TRUST across 23 positions** sits on
 * 39 skill atoms on mainnet 1155 and not one wei of it is reachable through the node.
 *
 * ## It signs nothing
 *
 * ADR `0038`. Every function returns calls for the agent's own runtime to sign; this package holds
 * no key and has no send path, which is what makes ADR `0035`'s "ARP is not a party" structural
 * rather than promised.
 */

/** A target that is not on the chain, so there is no vault to join. */
export class TermNotFoundError extends Error {
    readonly termId: Hex;
    constructor(termId: Hex) {
        super(`term ${termId} does not exist on this chain, so it has no vault`);
        this.name = "TermNotFoundError";
        this.termId = termId;
    }
}

/** An amount below what the protocol accepts, read from the chain rather than assumed. */
export class BelowMinimumError extends Error {
    readonly amount: bigint;
    readonly minimum: bigint;
    constructor(amount: bigint, minimum: bigint) {
        super(`${amount} wei is below this chain's minimum deposit of ${minimum} wei`);
        this.name = "BelowMinimumError";
        this.amount = amount;
        this.minimum = minimum;
    }
}

/** An exit larger than the position. */
export class InsufficientSharesError extends Error {
    readonly held: bigint;
    readonly requested: bigint;
    constructor(held: bigint, requested: bigint) {
        super(`holds ${held} shares, cannot redeem ${requested}`);
        this.name = "InsufficientSharesError";
        this.held = held;
        this.requested = requested;
    }
}

export type MarketPositionPlan = {
    termId: Hex;
    /** Who receives the shares. Not necessarily the signer. */
    receiver: Address;
    /** The curve the deposit prices against, read from the chain rather than assumed. */
    curveId: bigint;
    /** Native TRUST the call sends. */
    amount: bigint;
    /** What it buys, from `previewDeposit`. Read, never computed. */
    shares: bigint;
    /** What reaches the vault. The difference from {@link amount} is what the fees take. */
    assetsAfterFees: bigint;
    /** The protocol's floor on this chain. 10x apart between 1155 and 13579. */
    minDeposit: bigint;
    calls: PreparedCall[];
    chainId: number;
};

export type MarketExitPlan = {
    termId: Hex;
    /** Who receives the TRUST. */
    receiver: Address;
    curveId: bigint;
    /** Shares being redeemed. */
    shares: bigint;
    /** What the account holds in total, so a caller can see whether this is a full exit. */
    held: bigint;
    /** What the redemption fetches, from `previewRedeem`. Read, never computed. */
    assetsAfterFees: bigint;
    calls: PreparedCall[];
    chainId: number;
};

/**
 * Join a market: deposit TRUST on an atom's vault.
 *
 * @param minShares the slippage floor. Zero accepts any price, which on a bonding curve between
 *        planning and signing is how a deposit buys less than it was quoted.
 */
export async function prepareMarketPosition(params: {
    termId: Hex;
    amount: bigint;
    receiver: Address;
    reads: MultiVaultReads;
    curveId?: bigint;
    minShares?: bigint;
}): Promise<MarketPositionPlan> {
    const [defaultCurveId, minDeposit, exists] = await Promise.all([
        params.reads.defaultCurveId(),
        params.reads.minDeposit(),
        params.reads.termExists(params.termId),
    ]);
    if (!exists) throw new TermNotFoundError(params.termId);
    if (params.amount < minDeposit) throw new BelowMinimumError(params.amount, minDeposit);

    const curveId = params.curveId ?? defaultCurveId;
    // On the curve the deposit will actually price against, not the default — measured on mainnet,
    // curve 2's share price ran 3.000–4.181 against curve 1's 1.000–1.060, so the same amount buys
    // very different holdings and the caller is told which before signing.
    const preview = await params.reads.previewDeposit(params.termId, curveId, params.amount);

    return {
        termId: params.termId,
        receiver: params.receiver,
        curveId,
        amount: params.amount,
        shares: preview.shares,
        assetsAfterFees: preview.assetsAfterFees,
        minDeposit,
        chainId: params.reads.chainId,
        calls: [
            {
                kind: "deposit",
                chainId: params.reads.chainId,
                to: params.reads.address,
                value: params.amount,
                data: encodeDeposit(
                    params.receiver,
                    params.termId,
                    curveId,
                    params.minShares ?? 0n,
                ),
                why: `take a position on ${params.termId} on curve ${curveId}`,
                preview: {shares: preview.shares, assetsAfterFees: preview.assetsAfterFees},
            },
        ],
    };
}

/**
 * Leave a market: redeem shares for TRUST.
 *
 * @param shares how many to redeem, or omitted for the whole position.
 * @param minAssets the slippage floor, in TRUST wei.
 */
export async function prepareMarketExit(params: {
    termId: Hex;
    receiver: Address;
    account: Address;
    reads: MultiVaultReads;
    shares?: bigint;
    curveId?: bigint;
    minAssets?: bigint;
}): Promise<MarketExitPlan> {
    const defaultCurveId = await params.reads.defaultCurveId();
    const curveId = params.curveId ?? defaultCurveId;
    const held = await params.reads.sharesOf(params.account, params.termId, curveId);
    const shares = params.shares ?? held;

    if (shares <= 0n) throw new InsufficientSharesError(held, shares);
    if (shares > held) throw new InsufficientSharesError(held, shares);

    const preview = await params.reads.previewRedeem(params.termId, curveId, shares);

    return {
        termId: params.termId,
        receiver: params.receiver,
        curveId,
        shares,
        held,
        assetsAfterFees: preview.assetsAfterFees,
        chainId: params.reads.chainId,
        calls: [
            {
                kind: "redeem",
                chainId: params.reads.chainId,
                to: params.reads.address,
                // **Zero, and this is the one call in the package that sends none.** A redeem that
                // carried value would be sending TRUST to collect TRUST.
                value: 0n,
                data: encodeRedeem(
                    params.receiver,
                    params.termId,
                    curveId,
                    shares,
                    params.minAssets ?? 0n,
                ),
                why: `leave the market on ${params.termId}, redeeming ${shares} shares`,
                preview: {shares, assetsAfterFees: preview.assetsAfterFees},
            },
        ],
    };
}
