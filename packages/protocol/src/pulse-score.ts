import type {UsageOutcome, UsageReason} from "./declare/usage-context.js";
import type {PulseUsage} from "./pulse-usage.js";

/**
 * The score of a skill in a context (task 64, ADR `0137`). Public, and anyone can recompute it from
 * the search's order and the public declarations. It is computed when asked and never written on chain.
 *
 *     score = (prior + worked) / (1 + worked + failed)
 *
 * `worked` and `failed` are **distinct wallets** that said so, each weighed by `lineWeight` (ADR `0138`).
 * `prior` comes from the position in the search we start on, between 0.2 and 0.8, and counts as one
 * full wallet's word. The amount a wallet deposited is never read: rank is not for sale. So:
 *
 * - with nothing declared, the score is the prior, and the search's own order stands;
 * - below {@link WALLETS_TO_MOVE} wallets saying the same thing, a line is shown and moves nothing (ADR `0143`);
 * - three wallets lift all but the search's last result above its first;
 * - a skill absent from the search starts at the bottom of the range;
 * - each new wallet weighs less than the last, so the score moves from the search to the use.
 *
 * It says how a skill ranks for this search, today, from these signals. It does not say the skill works.
 */
export const SCORE_VERSION = "pulse-score-3";
const PRIOR_TOP = 0.8;
const PRIOR_BOTTOM = 0.2;

/** How many different wallets have to say the same thing before the ranking moves (ADR `0143`, the user's choice). */
export const WALLETS_TO_MOVE = 3;

export type PulseScore = {
    score: number;
    prior: number;
    worked: number;
    failed: number;
    version: typeof SCORE_VERSION;
};

/** A rank's prior. `rank` counts from 0, and `null` is a skill the search did not return. */
export function priorFromRank(rank: number | null, total: number): number {
    if (rank === null) return PRIOR_BOTTOM;
    if (total <= 1) return PRIOR_TOP;
    // Held at the floor: 0.8 - 0.6 lands just under 0.2 in floating point, which put a skill the search
    // did not return above the search's last result.
    return Math.max(PRIOR_BOTTOM, PRIOR_TOP - ((PRIOR_TOP - PRIOR_BOTTOM) * rank) / (total - 1));
}

/** What a person can supply, so a failure for lack of it does not concern them. */
export type Capability = "key" | "program" | "file";

const NEEDS: Partial<Record<UsageReason, Capability>> = {
    "missing-key": "key",
    "missing-program": "program",
    "missing-file": "file",
};

/**
 * A first guess, like the constants above. Changing one is the user's decision (`docs/tasks/66` §3).
 * `proven` stays at 1 by that decision: a self-hire passes every check, so a higher weight pays a faked receipt.
 */
export const SIGNAL_WEIGHTS = {near: 0.5, proven: 1};

export type SignalContext = {
    /** The domain searched and how near others are. `null` when the search names none: every line counts in full. */
    domain: string | null;
    /** The domains above and below it. */
    near: ReadonlySet<string>;
    canProvide: ReadonlySet<Capability>;
};

export type WeighedLine = {domain: string | null; outcome: UsageOutcome; reasons: readonly UsageReason[]; proven?: boolean};

/**
 * What one line is worth to this search. Zero means it does not concern this search.
 *
 * - **Domain**: the same one in full, one above or below at `near`, any other not at all.
 * - **Reason**: a failure for lack of something this person can supply does not concern them. `not-the-right-tool`
 *   counts only in the domain it names. A failure with no reason counts, as nothing excuses it.
 * - **Proof**: a verified receipt multiplies it by `proven`, 1 today. It says two keys talked, not that they are two people.
 */
export function lineWeight(line: WeighedLine, context: SignalContext, weights = SIGNAL_WEIGHTS): number {
    const exact = context.domain === null || line.domain === context.domain;
    const near = !exact && line.domain !== null && context.near.has(line.domain);
    if (!exact && !near) return 0;
    if (line.outcome === "failed" && line.reasons.length > 0) {
        const applies = line.reasons.some((reason) => {
            if (reason === "not-the-right-tool") return exact;
            const need = NEEDS[reason];
            return need === undefined || !context.canProvide.has(need);
        });
        if (!applies) return 0;
    }
    return (exact ? 1 : weights.near) * (line.proven === true ? weights.proven : 1);
}

/** The weight behind each outcome. A wallet keeps its heaviest line per outcome, so writing more lines adds nothing. */
export function signalOf(
    usage: PulseUsage | undefined,
    context: SignalContext,
): {worked: number; failed: number; failuresThatDoNotApply: number; heard: {worked: number; failed: number}} {
    const best = {worked: new Map<string, number>(), failed: new Map<string, number>()};
    const excused = new Set<string>();
    for (const row of usage?.declarations ?? []) {
        const wallet = row.writer.toLowerCase();
        for (const line of row.lines) {
            const weight = lineWeight(line, context);
            if (line.outcome === "failed" && weight === 0 && lineWeight({...line, reasons: []}, context) > 0) excused.add(wallet);
            if (weight > (best[line.outcome].get(wallet) ?? 0)) best[line.outcome].set(wallet, weight);
        }
    }
    const failuresThatDoNotApply = [...excused].filter((wallet) => !best.failed.has(wallet)).length;
    // Below the threshold the weight is 0, and `heard` says how many wallets were left out of the ranking.
    const sum = (map: Map<string, number>) =>
        map.size < WALLETS_TO_MOVE ? 0 : [...map.values()].reduce((total, weight) => total + weight, 0);
    const heard = (map: Map<string, number>) => (map.size < WALLETS_TO_MOVE ? map.size : 0);
    return {
        worked: sum(best.worked),
        failed: sum(best.failed),
        failuresThatDoNotApply,
        heard: {worked: heard(best.worked), failed: heard(best.failed)},
    };
}

/** Whether a skill the search did not return may enter its list: {@link WALLETS_TO_MOVE} wallets said the same thing (ADR `0143`). */
export function entersList(usage: PulseUsage | undefined, context: SignalContext): boolean {
    const {worked, failed} = signalOf(usage, context);
    return worked > 0 || failed > 0;
}

/**
 * What a reader is told about lines below the threshold, or `null` when there are none. Said beside the line
 * because a line that moves no score can still move a choice (`docs/tasks/71` §4). The user's wording.
 */
export function unconfirmedNote(heard: {worked: number; failed: number}): string | null {
    const said = (count: number, word: string) => (count === 0 ? null : `${count} wallet${count === 1 ? "" : "s"} said ${word}`);
    const parts = [said(heard.failed, "failed"), said(heard.worked, "worked")].filter((part) => part !== null);
    if (parts.length === 0) return null;
    return `${parts.join(" and ")}: not confirmed, below ${WALLETS_TO_MOVE} wallets. Check it in the skill's file.`;
}

/** The formula alone, so a caller that already holds the weights runs the same one. */
export function scoreFrom(prior: number, worked: number, failed: number): number {
    return (prior + worked) / (1 + worked + failed);
}

export function scoreSkill(input: {rank: number | null; total: number; worked: number; failed: number}): PulseScore {
    const prior = priorFromRank(input.rank, input.total);
    return {
        score: scoreFrom(prior, input.worked, input.failed),
        prior,
        worked: input.worked,
        failed: input.failed,
        version: SCORE_VERSION,
    };
}

/**
 * The domain a need's words name: the longest tree label among them, whole words only. `null` when none
 * does, and then the score reads every declaration. It guesses nothing beyond the words.
 */
export function inferDomain(query: string, labels: readonly string[]): string | null {
    const words = ` ${query.toLowerCase().replace(/[^a-z0-9-]+/g, " ").trim()} `;
    const matches = labels.filter((label) => words.includes(` ${label.toLowerCase()} `));
    return [...matches].sort((a, b) => b.length - a.length)[0] ?? null;
}
