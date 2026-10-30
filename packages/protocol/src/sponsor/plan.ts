import {getAddress, type Address, type Hex} from "viem";

import {encodeDeposit, type MultiVaultReads} from "../declare/multivault.js";
import type {PreparedCall} from "../declare/types.js";

/** The term is not on the chain, so there is nothing to deposit on and `previewDeposit` would revert. */
export class SponsoredTermMissingError extends Error {
    constructor(readonly termId: Hex) {
        super(`term ${termId} does not exist on this chain; create it before asking for a deposit`);
        this.name = "SponsoredTermMissingError";
    }
}

/** The amount is under the chain's `minDeposit`, which `previewDeposit` does not catch. */
export class SponsoredBelowMinDepositError extends Error {
    constructor(
        readonly amount: bigint,
        readonly minDeposit: bigint,
    ) {
        super(
            `a sponsored deposit of ${amount} wei is under this chain's minDeposit ${minDeposit}`,
        );
        this.name = "SponsoredBelowMinDepositError";
    }
}

/** The deposit would mint nothing, so it would be a donation to the vault. */
export class SponsoredZeroSharesError extends Error {
    constructor(readonly termId: Hex) {
        super(`a deposit on ${termId} would mint zero shares`);
        this.name = "SponsoredZeroSharesError";
    }
}

export type SponsoredDepositPlan = {
    call: PreparedCall;
    curveId: bigint;
    /** What the chain said the deposit buys, before anything is sent. */
    expectedShares: bigint;
};

/** Default slippage floor: the deposit must buy at least 99% of the shares previewed. */
export const SPONSORED_MIN_SHARES_BPS = 9_900n;

/**
 * The one call the sponsoring service sends for a proven use: `deposit(receiver = agent, …)`, paid
 * by the sponsor, with the shares minted to the agent (ADR `0094` §3).
 *
 * **The receiver is the agent and never the sponsor.** A position held by ARP would link to nothing
 * and put ARP's own money into ARP's own figures (ADR `0046`), which is why the parameter is named
 * `receiver` and there is no default for it.
 *
 * Every chain value is read here and none is assumed: the curve, `minDeposit` and the preview
 * (`rules/portability.md` rule 3). The call is prepared, not sent; the service sends it.
 */
export async function planSponsoredDeposit(params: {
    receiver: Address;
    termId: Hex;
    amount: bigint;
    reads: MultiVaultReads;
    curveId?: bigint;
}): Promise<SponsoredDepositPlan> {
    const {termId, amount, reads} = params;
    const receiver = getAddress(params.receiver);
    if (!(await reads.termExists(termId))) throw new SponsoredTermMissingError(termId);
    const [curveId, minDeposit] = await Promise.all([
        params.curveId ?? reads.defaultCurveId(),
        reads.minDeposit(),
    ]);
    if (amount < minDeposit) throw new SponsoredBelowMinDepositError(amount, minDeposit);
    const preview = await reads.previewDeposit(termId, curveId, amount);
    if (preview.shares === 0n) throw new SponsoredZeroSharesError(termId);
    const minShares = (preview.shares * SPONSORED_MIN_SHARES_BPS) / 10_000n;
    return {
        curveId,
        expectedShares: preview.shares,
        call: {
            kind: "deposit",
            chainId: reads.chainId,
            to: reads.address,
            value: amount,
            data: encodeDeposit(receiver, termId, curveId, minShares),
            why: `sponsored deposit of ${amount} wei on ${termId}, shares to ${receiver}`,
            preview,
        },
    };
}
