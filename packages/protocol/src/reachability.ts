import type {ProbeOutcome} from "./verify/types.js";

/**
 * From a probe's verdict to what ARP should be asserting on chain.
 *
 * The one claim in this system a third party can check for the price of one HTTP request, which is
 * why it is the only one ARP records as a fact. Everything else it holds is a declaration
 * (`docs/14`): verified by **replication**, never by an oracle.
 *
 * ## It is a position, not a triple per observation
 *
 * One triple, `(tool, has tag, reachable)`, written once and never again. The **position** carries
 * the state: held on the triple while the endpoint answers, moved to the counter-triple when it
 * stops. The user's design, 2026-10-28, and it is the only one that passes their own rule — a thing
 * goes on chain if it is immutable, or if the protocol gives a way to revise it, and a position is
 * the revision mechanism.
 *
 * Writing a triple per state change was the alternative and it is worse in a way that is not
 * obvious: **a flapping endpoint produces the most permanent writes**, and its state is the one
 * that means least. Measured cost of the position instead: a flip is redeem + deposit on an
 * existing triple, 3.75% of the stake — entry 0.50%, exit 0.75%, protocol 1.25% twice — which at
 * `minDeposit` 0.01 on mainnet is 0.000375 TRUST. Writing a triple is 0.1. **267× cheaper**, and it
 * leaves no contradiction behind.
 *
 * ## The history stays off chain
 *
 * Only the current state is recorded. The series of observations — the uptime record — is mutable,
 * voluminous, and by the same rule does not belong on chain. What a reader acts on is trustless;
 * what is only interesting in aggregate is not.
 */

/** A probe outcome reduced to the only three things that matter for the record. */
export type Verdict = "up" | "down" | "no-verdict";

/**
 * Which probe outcomes are a verdict **about the endpoint**, and which are about us.
 *
 * The asymmetry is `probe.ts`'s and it is principled: a timeout is an answer about the agent — an
 * endpoint that cannot respond in eight seconds is not serving callers. A TLS or DNS failure is
 * not, because it could equally be our network. A `429` is never a verdict, it is the host asking
 * us to stop.
 *
 * `not-checkable` means nothing was probed at all, so nothing is claimed.
 */
export function verdictOf(outcome: ProbeOutcome): Verdict {
    if (outcome.status !== "confirmed") return "no-verdict";
    switch (outcome.code) {
        case "live":
        case "serves-declared-protocol":
            return "up";
        case "dead":
        case "declared-protocol-not-served":
            return "down";
    }
}

/** What ARP currently asserts on chain about one endpoint. */
export type RecordedState = "up" | "down" | "none";

/**
 * How many consecutive **down** verdicts condemn an endpoint that is currently recorded up.
 *
 * Asymmetric on purpose, because the two errors do not cost the same. Marking a live tool dead
 * takes its visibility away and is our reputation; marking a dead tool live costs an agent one
 * wasted session. So: slow to condemn, fast to rehabilitate — **one** success is enough to go back
 * up, because a success is unambiguous, the server answered.
 *
 * Three verdicts spaced an hour apart is a real outage. Three ten seconds apart is one network
 * hiccup, which is why the caller's spacing matters as much as this number and why
 * {@link decideTransition} takes a history rather than a count.
 */
export const DOWN_VERDICTS_TO_CONDEMN = 3;

export type Transition =
    | {change: false; state: RecordedState; why: string}
    | {change: true; from: RecordedState; to: "up" | "down"; why: string};

/**
 * Whether the recorded state should move, given the verdicts seen most recently first.
 *
 * `history[0]` is the newest. Entries that are not a verdict are **skipped, not counted as
 * agreement** — an endpoint behind a rate limiter would otherwise drift toward whatever it was
 * last recorded as, which is the opposite of what a rate limit tells us.
 */
export type TransitionOptions = {
    /**
     * How many consecutive down verdicts condemn. Defaults to {@link DOWN_VERDICTS_TO_CONDEMN}.
     *
     * **Two roles, two numbers, and conflating them was a real mistake.** A systematic prober makes
     * a *public* verdict about somebody else's service seen from outside, so three is right — to
     * condemn is to take an author's visibility away. An agent that calls an endpoint and gets
     * nothing is reporting **what happened to it**, first hand, and asking it for three
     * confirmations is asking it to doubt its own experience. It passes 1.
     */
    condemnAfter?: number;
};

export function decideTransition(
    state: RecordedState,
    history: readonly Verdict[],
    options: TransitionOptions = {},
): Transition {
    const condemnAfter = Math.max(1, options.condemnAfter ?? DOWN_VERDICTS_TO_CONDEMN);
    const verdicts = history.filter((entry) => entry !== "no-verdict");
    const newest = verdicts[0];

    if (newest === undefined) {
        return {change: false, state, why: "no verdict in the history — nothing is claimed"};
    }

    if (newest === "up") {
        if (state === "up") return {change: false, state, why: "answers, and that is already recorded"};
        return {
            change: true,
            from: state,
            to: "up",
            why: state === "none" ? "answers — first record" : "answers again — one success rehabilitates",
        };
    }

    // newest === "down"
    if (state === "down") return {change: false, state, why: "does not answer, and that is already recorded"};

    const consecutive = countLeading(verdicts, "down");
    if (consecutive < condemnAfter) {
        return {
            change: false,
            state,
            why: `${consecutive} of ${condemnAfter} consecutive down verdicts — not condemned yet`,
        };
    }
    return {
        change: true,
        from: state,
        to: "down",
        why: `${consecutive} consecutive down verdicts`,
    };
}

function countLeading(verdicts: readonly Verdict[], value: Verdict): number {
    let count = 0;
    for (const entry of verdicts) {
        if (entry !== value) break;
        count += 1;
    }
    return count;
}

/**
 * What a transition costs to write, so a caller can refuse a flip that is not worth it.
 *
 * Both numbers are read from the chain by the caller, never assumed: `minDeposit` differs 10×
 * between chains and the term costs 100× (`rules/portability.md` rule 3).
 */
export type FlipCost = {
    /** Leaving the side currently held. Zero when nothing is held yet. */
    redeem: bigint;
    /** Entering the other side. */
    deposit: bigint;
};

export function flipCost(from: RecordedState, stake: bigint): FlipCost {
    return {redeem: from === "none" ? 0n : stake, deposit: stake};
}
