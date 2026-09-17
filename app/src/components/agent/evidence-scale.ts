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

/**
 * The same argument at label scale, for the tab strip.
 *
 * Tone and weight, no size — the strip has no room for the size scale, and a
 * tab is a control rather than a hero. Three tiers rather than the panel's
 * seven, and they stop at `--color-fg-60`: at `--text-label` the next step down
 * is 3.66:1 against the background, and this text is the signal rather than
 * chrome. The ordering still agrees with `SCORE_TONE_CLASS`, so the strip and
 * the panel never disagree about which provider is better backed.
 */
export const EVIDENCE_TONE_CLASS: Record<EvidenceWeight, string> = {
    unknown: "text-[color:var(--color-fg-60)]",
    none: "text-[color:var(--color-fg-60)]",
    single: "text-[color:var(--color-fg-60)]",
    thin: "text-[color:var(--color-fg-60)]",
    moderate: "text-[color:var(--color-fg)]",
    substantial: "text-[color:var(--color-fg)] font-medium",
    deep: "text-[color:var(--color-fg)] font-medium",
};
