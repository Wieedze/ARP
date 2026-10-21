import type {ProvenanceTier} from "../../services/tool-usage-view";

/**
 * The ladder, rendered as type weight — the same device the panel uses for evidence
 * (`components/agent/evidence-scale.ts`), applied to usage instead of to trust.
 *
 * `docs/14:156`: _"What the interface must never do is render these at the same weight."_ So the
 * two rungs this data reaches are deliberately far apart: a priced assertion takes the foreground
 * colour and medium weight, and a free one is muted and normal. The gap is the point.
 *
 * Tailwind needs the full class string present in the source to emit it, so these are literal
 * lookup tables rather than interpolated strings.
 */

export const TIER_LABEL: Record<ProvenanceTier, string> = {
    fact: "Fact",
    "confirmed-by-both": "Confirmed by both",
    "tool-declared": "Tool's word",
    "priced-assertion": "Priced assertion",
    "free-assertion": "Free assertion",
};

export const TIER_TONE_CLASS: Record<ProvenanceTier, string> = {
    fact: "text-[color:var(--color-fg)] font-semibold",
    "confirmed-by-both": "text-[color:var(--color-fg)] font-semibold",
    "tool-declared": "text-[color:var(--color-fg)] font-medium",
    "priced-assertion": "text-[color:var(--color-fg)] font-medium",
    "free-assertion": "text-[color:var(--color-fg-60)] font-normal",
};

/**
 * One sentence per rung, so the weight is never just decoration.
 *
 * The bottom one says **nothing**, in `docs/14`'s own word, because that is the row "that gets
 * mistaken for data" and a softer phrasing is how it gets mistaken.
 */
export const TIER_CAPTION: Record<ProvenanceTier, string> = {
    fact: "A payment, an on-chain call or a redeemed delegation. The chain recorded it.",
    "confirmed-by-both": "The tool and the agent both declared it, and their interests oppose.",
    "tool-declared": "The tool's word that this agent used it. A third party, and strong.",
    "priced-assertion": "The agent's own claim, with TRUST behind it. Priced, not proven.",
    "free-assertion": "The agent's own claim, with nothing on this curve behind it.",
};

/**
 * The off-curve case, which is **not a rung** and so is kept out of the tables above.
 *
 * Its tone is `--color-fg` with `font-normal`: distinguished from a priced assertion by weight and
 * from a free one by colour, rather than being free's near-twin. They are the two states furthest
 * apart in meaning — "real capital is behind this" against "nothing is" — and one weight step was
 * the smallest distinction on the page between them.
 */
export const OFF_CURVE_LABEL = "Staked off-curve";

export const OFF_CURVE_TONE_CLASS = "text-[color:var(--color-fg)] font-normal";

export const OFF_CURVE_CAPTION =
    "TRUST is behind this claim, on a bonding curve this page does not read.";
