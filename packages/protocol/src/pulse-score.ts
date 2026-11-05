import type {PulseUsage} from "./pulse-usage.js";

/**
 * The score of a skill in a context (task 64, ADR `0137`). Public, and anyone can recompute it from
 * the search's order and the public declarations. It is computed when asked and never written on chain.
 *
 *     score = (prior + worked) / (1 + worked + failed)
 *
 * `worked` and `failed` count **distinct wallets** that said so in this context. `prior` comes from the
 * position in the search we start on, between 0.2 and 0.8, and counts as one wallet's word. So:
 *
 * - with nothing declared, the score is the prior, and the search's own order stands;
 * - one wallet cannot lift a skill above the search's first result, and two can;
 * - a skill absent from the search starts at the bottom of the range;
 * - each new wallet weighs less than the last, so the score moves from the search to the use.
 *
 * It says how a skill ranks for this search, today, from these signals. It does not say the skill works.
 */
export const SCORE_VERSION = "pulse-score-1";
const PRIOR_TOP = 0.8;
const PRIOR_BOTTOM = 0.2;

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
    return PRIOR_TOP - ((PRIOR_TOP - PRIOR_BOTTOM) * rank) / (total - 1);
}

/** Distinct wallets per outcome, in these domains. `null` domains counts every declaration. */
export function walletsSaying(
    usage: PulseUsage | undefined,
    domains: ReadonlySet<string> | null,
): {worked: number; failed: number} {
    const worked = new Set<string>();
    const failed = new Set<string>();
    for (const row of usage?.declarations ?? []) {
        if (domains !== null && !row.domains.some((domain) => domains.has(domain))) continue;
        const wallet = row.writer.toLowerCase();
        if (row.outcomes.includes("worked")) worked.add(wallet);
        if (row.outcomes.includes("failed")) failed.add(wallet);
    }
    return {worked: worked.size, failed: failed.size};
}

export function scoreSkill(input: {rank: number | null; total: number; worked: number; failed: number}): PulseScore {
    const prior = priorFromRank(input.rank, input.total);
    return {
        score: (prior + input.worked) / (1 + input.worked + input.failed),
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
