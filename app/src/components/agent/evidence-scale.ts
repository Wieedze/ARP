import type {EvidenceWeight} from "../../services/agent-trust";

/**
 * The panel's one piece of hard design: type size and colour are set by how
 * much evidence a score rests on, not by the score.
 *
 * Tailwind needs the full class string present in the source to emit it, so
 * these are literal lookup tables rather than interpolated strings.
 */

export const SCORE_SIZE_CLASS: Record<EvidenceWeight, string> = {
    unknown: "text-[length:var(--text-score-2)]",
    none: "text-[length:var(--text-score-1)]",
    single: "text-[length:var(--text-score-2)]",
    thin: "text-[length:var(--text-score-2)]",
    moderate: "text-[length:var(--text-score-3)]",
    substantial: "text-[length:var(--text-score-4)]",
    deep: "text-[length:var(--text-score-5)]",
};

export const SCORE_TONE_CLASS: Record<EvidenceWeight, string> = {
    unknown: "text-[color:var(--color-fg-60)] font-normal",
    none: "text-[color:var(--color-fg-60)] font-normal",
    single: "text-[color:var(--color-fg-60)] font-normal",
    thin: "text-[color:var(--color-fg-60)] font-normal",
    moderate: "text-[color:var(--color-fg)] font-medium",
    substantial: "text-[color:var(--color-fg)] font-semibold",
    deep: "text-[color:var(--color-fg)] font-semibold",
};

/** One sentence naming what the size means, so the device is never just decorative. */
export const WEIGHT_CAPTION: Record<EvidenceWeight, string> = {
    unknown: "Weight unknown — the document publishes no reviewer count.",
    none: "No reviewers behind this score.",
    single: "One reviewer. A single opinion, priced as a score.",
    thin: "A handful of reviewers. Thin.",
    moderate: "Enough reviewers to be worth comparing.",
    substantial: "Hundreds of reviewers behind it.",
    deep: "Thousands of reviewers behind it.",
};
