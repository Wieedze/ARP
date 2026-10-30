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

/* -------------------------------------------------------------------------- */
/* v2: the fold, the grain, the dot's mass and the loupe.                      */
/* -------------------------------------------------------------------------- */

/**
 * The most rings the field draws.
 *
 * Past it, the rings share the band so tightly that two predicates read as one line. Groups from
 * the fifth onward **fold** into one last ring, and the legend still names each of them with its
 * own count, so nothing is dropped, only drawn together.
 */
export const MAX_RINGS = 5;

/** A ring of the field after the fold: either one group, or every group past the cap. */
export type ShownRing<G> = {
    /** The groups drawn on this ring. One, except on the folded ring. */
    members: readonly G[];
    folded: boolean;
};

/**
 * Which groups get a ring of their own, and which share the last one.
 *
 * Generic so it can be tested on plain counts and used on `GroupView`s alike.
 */
export function foldGroups<G>(groups: readonly G[]): ShownRing<G>[] {
    if (groups.length <= MAX_RINGS) {
        return groups.map((group) => ({members: [group], folded: false}));
    }
    const own = groups.slice(0, MAX_RINGS - 1).map((group) => ({members: [group], folded: false}));
    return [...own, {members: groups.slice(MAX_RINGS - 1), folded: true}];
}

/** One grain point, in `0..1` of the box, like a dot. */
export type GrainPoint = {cx: number; cy: number};

/** The grain's radius, as a fraction of the box. About 1.2px on a 22rem field. */
export const GRAIN_R = 0.0036;

/**
 * Every claim past the drawn ones, as a fine stipple on the same ring.
 *
 * **Decoration of a count the legend states**, never a claim of its own: it is `aria-hidden` and
 * has no target. Without it, 250 claims on one ring looked exactly like 36. The points sit evenly
 * in the gaps between drawn dots, never on one, and only a crowded ring (more than six per gap)
 * splits them into two rows either side of the line.
 */
export function claimGrain(ring: ClaimRing): GrainPoint[] {
    const extra = ring.total - ring.drawn;
    if (extra <= 0 || ring.drawn === 0) return [];
    const step = (Math.PI * 2) / ring.drawn;
    const offset = (ring.ring % 2) * (step / 2);
    const perGap = Math.ceil(extra / ring.drawn);
    const points: GrainPoint[] = [];
    for (let e = 0; e < extra; e += 1) {
        const slot = e % ring.drawn;
        const layer = Math.floor(e / ring.drawn);
        const angle = -Math.PI / 2 + offset + (slot + (layer + 1) / (perGap + 1)) * step;
        const r = ring.r + (perGap > 6 ? (layer % 2 === 1 ? 0.007 : -0.007) : 0);
        points.push({cx: 0.5 + r * Math.cos(angle), cy: 0.5 + r * Math.sin(angle)});
    }
    return points;
}

/**
 * Whether a dot grows with the number of accounts behind it.
 *
 * `docs/17` §4 proposed it; it is the one open decision of the v2 field. Set to `false` and every
 * dot is the base size, nothing else changes.
 */
export const SIZE_BY_POSITIONS = true;

/** The drawn mark's diameter in px, for a claim with this many positions. */
export const DOT_BASE_PX = 10;
const DOT_MAX_PX = 17;

/**
 * A dot's diameter. **By position count, never by amount**: ADR `0042`, creating a term seeds its
 * vaults, so an amount says "this exists", not "people stand behind it". A free claim is always the
 * base size, and hollow, so it can never look heavy. Logarithmic and capped, so one crowded claim
 * cannot dwarf the ring.
 */
export function dotDiameter(positions: number): number {
    if (!SIZE_BY_POSITIONS || positions <= 0) return DOT_BASE_PX;
    return Math.min(DOT_BASE_PX + 3.2 * Math.log2(positions), DOT_MAX_PX);
}

/**
 * The loupe: the reading head tied to the card by a line.
 *
 * All in `0..1` of the field's box, like the dots.
 */
export const LOUPE = {
    /** Where it rests on the outer ring, clockwise from three o'clock. */
    restDegrees: -60,
    /** The angle the line rises at from the loupe to the bar. */
    riseDegrees: 35,
    /**
     * The bar's height, level with the card's middle. **Above the field**, not inside it: at
     * `0.055` a loupe riding the top of the outer ring (`y = 0.08`) left a rise of a few pixels and
     * the line read as straight. The user, 2026-10-29: _« garde toujours un angle, jamais de ligne
     * complètement droite »_. From here the shortest rise is `0.12` of the box.
     */
    barY: -0.04,
    /** Where the bar ends: past the field's right edge, under the card, which stops it. */
    barEndX: 1.6,
    /**
     * The furthest right the corner may go: inside the 4rem gap, short of the card at `~1.18`.
     * From the bottom of the field a 35° rise would put the corner under the card, which hides it,
     * and the reader would see one slanted stroke and no angle. Past this the rise steepens.
     */
    cornerMaxX: 1.08,
    /** The loupe's radius. */
    radius: 0.032,
    /** A base dot's radius, for "is the whole dot inside the loupe". */
    dotRadius: 0.0142,
    /** Time constant of the glide, ms: about 95% of the way in 480ms. */
    glideMs: 160,
    /** Under this distance the loupe locks onto the dot instead of easing behind it. */
    lock: 0.006,
    /** With nobody pointing, the loupe moves to the next claim this often. */
    tourMs: 4000,
    /** How often, at rest, the card re-reads the dot nearest the loupe. */
    pollMs: 120,
} as const;

export type Point = {x: number; y: number};

/** The loupe's resting place on a ring of radius `r`. */
export function loupeRest(r: number): Point {
    const angle = (LOUPE.restDegrees * Math.PI) / 180;
    return {x: 0.5 + r * Math.cos(angle), y: 0.5 + r * Math.sin(angle)};
}

/**
 * The line from the loupe to the card, as an SVG `points` string.
 *
 * It leaves from the loupe's **rim**, not its centre, rises at `riseDegrees` to the bar and runs
 * along it past the box, where the card (above it in z) stops it at its border. The corner never
 * passes `cornerMaxX`, so it is always in view.
 */
export function loupeLine(at: Point): string {
    const cornerX = Math.min(
        at.x + Math.abs(at.y - LOUPE.barY) / Math.tan((LOUPE.riseDegrees * Math.PI) / 180),
        LOUPE.cornerMaxX,
    );
    const angle = Math.atan2(LOUPE.barY - at.y, cornerX - at.x);
    const sx = at.x + LOUPE.radius * Math.cos(angle);
    const sy = at.y + LOUPE.radius * Math.sin(angle);
    const f = (n: number) => n.toFixed(4);
    return `${f(sx)},${f(sy)} ${f(cornerX)},${LOUPE.barY} ${LOUPE.barEndX},${LOUPE.barY}`;
}
