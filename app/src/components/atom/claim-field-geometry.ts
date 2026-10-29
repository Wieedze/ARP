/**
 * Where each claim sits in the field, as fractions of the box.
 *
 * Pure, and separate from the component, so the placement can be tested without a DOM — the same
 * split `sigil-geometry.ts` makes for the agent glyph, and for the same reason: a ring that
 * overlaps or a dot that falls outside the box is arithmetic, and arithmetic is testable.
 *
 * ## The shape
 *
 * The atom sits at the centre. Each **predicate** gets a ring, innermost first, and each claim on
 * that predicate gets a dot on it. So the distance from the centre says which predicate, and the
 * count on a ring says how many said it.
 *
 * Angles start at twelve o'clock and run clockwise, and each ring is rotated by half a step
 * relative to the one inside it. Without that offset, a tool with the same subject under two
 * predicates draws two dots on the same radius and they read as one line rather than two claims.
 */

/** A dot's place and what it is, all in `0..1` of the box's width. */
export type ClaimDot = {
    /** Index into the flattened claim list the caller passed, so it can map back to the row. */
    index: number;
    /** Which ring, 0 innermost. */
    ring: number;
    cx: number;
    cy: number;
};

export type ClaimRing = {
    ring: number;
    /** Radius as a fraction of the box's width. */
    r: number;
    /** How many of this ring's claims are drawn, after the cap. */
    drawn: number;
    /** How many it has in total. Larger than `drawn` when the cap bit. */
    total: number;
};

/**
 * The most dots drawn on one ring.
 *
 * **Not a styling choice.** Measured on mainnet: one tag atom carries 250+ edges on a single
 * predicate, and a ring of 250 dots at any size that stays inside the box is a solid line. The
 * overflow is **stated** by the caller rather than dropped silently — a field that quietly showed
 * 36 of 250 would be the kind of claim `rules/claims.md` exists to stop.
 */
export const MAX_DOTS_PER_RING = 36;

/**
 * The band the rings are spread across, as fractions of the box's width.
 *
 * **Distributed, not stepped.** A fixed gap per ring meant an atom with two predicates used the
 * middle of the box and left the rest empty, while one with six overflowed it. The rings now share
 * the band however many there are, so the field is the same size and the same weight on every atom
 * — the box is the constant, the spacing is not.
 */
const INNER = 0.17;
const OUTER = 0.42;

/**
 * Lay out one field.
 *
 * @param groups how many claims each predicate has, in render order.
 * @returns the rings and every dot, with `index` counting through the groups in the same order.
 */
export function claimField(groups: readonly number[]): {rings: ClaimRing[]; dots: ClaimDot[]} {
    const rings: ClaimRing[] = [];
    const dots: ClaimDot[] = [];
    let index = 0;

    groups.forEach((total, ring) => {
        const drawn = Math.min(total, MAX_DOTS_PER_RING);
        // One ring sits at the outer edge; more share the band evenly.
        const r =
            groups.length === 1 ? OUTER : INNER + (ring / (groups.length - 1)) * (OUTER - INNER);
        rings.push({ring, r, drawn, total});

        // Half a step of rotation per ring, so two claims about the same subject under different
        // predicates do not line up on one radius and read as a single mark.
        const step = drawn === 0 ? 0 : (Math.PI * 2) / drawn;
        const offset = (ring % 2) * (step / 2);
        for (let position = 0; position < drawn; position += 1) {
            const angle = -Math.PI / 2 + offset + position * step;
            dots.push({
                index: index + position,
                ring,
                cx: 0.5 + r * Math.cos(angle),
                cy: 0.5 + r * Math.sin(angle),
            });
        }
        index += total;
    });

    return {rings, dots};
}
