import type {Address, Hex} from "viem";

import {decideTransition, type RecordedState, type Verdict} from "../reachability.js";
import {encodeDeposit, encodeRedeem, type MultiVaultReads} from "./multivault.js";
import type {PreparedCall} from "./types.js";

/**
 * Prepared calls that move what an address asserts about one endpoint's reachability.
 *
 * **Plans, never signs** (ADR `0038`). The caller signs with its own key, which is what lets an
 * agent record a verdict ARP's attestor did not make — and that is the point rather than a
 * limitation. The only claim in this system a third party can reproduce deserves more than one
 * observer, and a second observer who cannot disagree is not one.
 *
 * ## The shape on chain
 *
 * One triple, `(tool, has tag, reachable)`, and its counter — which every triple is born with
 * (ADR `0053`), so the disagreeing side costs nothing to address and never has to be created.
 *
 * ```
 * position on the triple          this address says it answers
 * position on the counter-triple  this address says it does not
 * neither                         this address has not looked
 * ```
 *
 * The position carries the state and the triple is written once. The alternative — a triple per
 * observation — makes a **flapping endpoint produce the most permanent writes**, and its state is
 * the one that means least.
 *
 * ## What a flip costs, measured
 *
 * Redeem one side, deposit the other. On mainnet 1155, 2026-10-29: entry 0.50%, exit 0.75%,
 * protocol 1.25% — **3.75% of the stake**, or 0.000375 TRUST at `minDeposit`. Writing a triple is
 * 0.1. The deposit itself is not a cost; it comes back.
 */

export type ReachabilityTerms = {
    /** `(tool, has tag, reachable)`. */
    triple: Hex;
    /** Its counter. Derived, never created. */
    counter: Hex;
};

export type ReachabilityState = {
    terms: ReachabilityTerms;
    /** What `account` currently asserts. */
    recorded: RecordedState;
    /** Shares held on whichever side is held, so a flip knows what to redeem. */
    shares: bigint;
};

/**
 * What `account` currently asserts about this tool, read from its positions on both sides.
 *
 * **Both sides are read, and holding both is reported rather than resolved.** It should not happen
 * — nothing in this planner creates it — but a caller that deposited by hand could, and silently
 * picking one would hide a contradiction the reader is entitled to see.
 */
export async function readReachabilityState(
    reads: MultiVaultReads,
    account: Address,
    toolAtomId: Hex,
    hasTagPredicate: Hex,
    reachableAtomId: Hex,
    curveId: bigint,
): Promise<ReachabilityState & {bothSides: boolean}> {
    const triple = await reads.tripleId(toolAtomId, hasTagPredicate, reachableAtomId);
    const counter = await reads.counterTripleId(triple);
    const [up, down] = await Promise.all([
        reads.sharesOf(account, triple, curveId),
        reads.sharesOf(account, counter, curveId),
    ]);

    const bothSides = up > 0n && down > 0n;
    const recorded: RecordedState = up > 0n ? "up" : down > 0n ? "down" : "none";
    return {terms: {triple, counter}, recorded, shares: up > 0n ? up : down, bothSides};
}

export type ReachabilityPlan = {
    /** Empty when nothing should change — which is the common case and not a failure. */
    calls: PreparedCall[];
    from: RecordedState;
    to: RecordedState;
    why: string;
};

/**
 * The calls that move `account` from what it asserts to what the verdicts say it should.
 *
 * `history` is newest first. The policy lives in `reachability.ts` and is deliberately asymmetric:
 * three consecutive down verdicts to condemn, one success to rehabilitate, and a non-verdict is
 * skipped rather than counted as agreement.
 *
 * `minShares` and `minAssets` are both zero here and that is a real limit, stated rather than
 * hidden: on a flat curve a position's price does not move between planning and signing, and
 * `reachable` is recorded on the default curve where the price is 1. A caller recording on a
 * progressive curve must not use this.
 */
export function planReachability(
    state: ReachabilityState,
    history: readonly Verdict[],
    options: {
        multiVault: Address;
        chainId: number;
        receiver: Address;
        curveId: bigint;
        /** What to put behind the assertion. The caller reads `minDeposit` off the chain. */
        stake: bigint;
        toolLabel: string;
    },
): ReachabilityPlan {
    const move = decideTransition(state.recorded, history);
    if (!move.change) {
        return {calls: [], from: state.recorded, to: state.recorded, why: move.why};
    }

    const calls: PreparedCall[] = [];
    const leaving = move.from === "up" ? state.terms.triple : state.terms.counter;
    const entering = move.to === "up" ? state.terms.triple : state.terms.counter;

    if (move.from !== "none" && state.shares > 0n) {
        calls.push({
            kind: "redeem",
            chainId: options.chainId,
            to: options.multiVault,
            // Redeem is NOT payable. A value here would be sending TRUST to collect TRUST.
            value: 0n,
            data: encodeRedeem(options.receiver, leaving, options.curveId, state.shares, 0n),
            why: `stop asserting ${options.toolLabel} ${move.from === "up" ? "answers" : "does not answer"}`,
        });
    }

    calls.push({
        kind: "deposit",
        chainId: options.chainId,
        to: options.multiVault,
        value: options.stake,
        data: encodeDeposit(options.receiver, entering, options.curveId, 0n),
        why: `${options.toolLabel} ${move.to === "up" ? "answers" : "does not answer"} — ${move.why}`,
    });

    return {calls, from: move.from, to: move.to, why: move.why};
}
