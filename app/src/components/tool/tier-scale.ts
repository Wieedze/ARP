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
    "off-curve": "Staked off-curve",
    "free-assertion": "Free assertion",
};

export const TIER_TONE_CLASS: Record<ProvenanceTier, string> = {
    fact: "text-[color:var(--color-fg)] font-semibold",
    "confirmed-by-both": "text-[color:var(--color-fg)] font-semibold",
    "tool-declared": "text-[color:var(--color-fg)] font-medium",
    "priced-assertion": "text-[color:var(--color-fg)] font-medium",
    "off-curve": "text-[color:var(--color-fg-60)] font-medium",
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
    "off-curve":
        "TRUST is behind this claim, on a bonding curve this page does not read. How much, and from how many, is not shown here.",
    "free-assertion": "The agent's own claim, with nothing on this curve behind it.",
};

/**
 * Why a rung cannot be reached yet. Empty for the ones that can.
 *
 * Shown on the page so the scale visibly continues above what the data can say. Without it, a
 * priced assertion reads as the best evidence that exists.
 */
export const TIER_UNREACHABLE_REASON: Record<ProvenanceTier, string | null> = {
    fact: "Nothing here reads payments, calldata or redemptions yet.",
    "confirmed-by-both": "No tool declares its own users, so there is no second party to agree.",
    "tool-declared": "Same: the tool side of an edge is not written by anything today.",
    "priced-assertion": null,
    "off-curve": null,
    "free-assertion": null,
};
