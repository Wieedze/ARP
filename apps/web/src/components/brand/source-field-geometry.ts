/**
 * The Source Field's rings, as numbers.
 *
 * Separate from the canvas for the same reason `sigil-geometry.ts` is: the geometry is the design
 * decision and the drawing is a loop over it, so the part worth testing is the part with no
 * `CanvasRenderingContext2D` in it.
 *
 * The values are ported from the approved reference (`docs/design/arp-motion-reference/index.html`, §2.2 of the
 * build contract beside it), where they were tuned in a browser. They are not derived from anything
 * — changing one changes the mark, so they are stated once, here.
 */

/** Rings, centre outward. */
const RINGS = 22;

/**
 * How much tighter the gaps are at the rim than at the centre.
 *
 * The rings are **not** evenly spaced: `f(u)` below spends more of the radius near the middle, so
 * the field reads as something with a dense core rather than as a target. 8 is the ratio of the
 * first gap to the last.
 */
const RATIO = 8;

/** Where the innermost ring sits, and the outermost, in the same units. The core is inside `FIRST`. */
const FIRST = 0.52;
const RIM = 3.6;

/** The tilt, as the factor the vertical axis is squashed by. 0.35rad, matching the 3D original. */
export const TILT = Math.cos(0.35);

/** The Saffron core, as a fraction of the rim. */
export const CORE_FRACTION = (0.1 / RIM) * 1.6;

export type Ring = {
    /** Radius as a fraction of the rim, so one number scales the whole field. */
    radius: number;
    /** Dots on this ring. Six per step out, so the arc between them stays roughly even. */
    count: number;
    /** Dot radius in px at a 300px rim — the scale everything here was tuned at. */
    size: number;
    /** 0 at the centre, 1 at the rim. Drives colour and alpha. */
    distance: number;
    /** Radians per second. Alternating by ring, so neighbours shear against each other. */
    speed: number;
};

/**
 * The rings, innermost first.
 *
 * Computed once at module load: 22 objects with no input, so a per-render call would do the same
 * arithmetic for the same answer on every frame of every mount.
 */
export const RINGS_GEOMETRY: readonly Ring[] = Array.from({length: RINGS}, (_, index) => {
    const k = index + 1;
    const u = index / (RINGS - 1);
    // Spends radius near the centre: the derivative is RATIO at u=0 and 1 at u=1.
    const f = (RATIO * u - ((RATIO - 1) * u * u) / 2) / ((RATIO + 1) / 2);
    return {
        radius: (FIRST + (RIM - FIRST) * f) / RIM,
        count: 6 * k,
        size: 0.45 + 2.4 * Math.pow(1 - u, 1.1),
        distance: u,
        speed: ((k % 2 === 0 ? -1 : 1) * 2 * Math.PI) / (36 + k * 9),
    };
});

/** `t` clamped into `[low, high]`. */
export function clamp(value: number, low = 0, high = 1): number {
    return Math.min(Math.max(value, low), high);
}

/** Smoothstep. Zero derivative at both ends, which is what keeps a scrubbed fade from snapping. */
export function smooth(t: number): number {
    return t * t * (3 - 2 * t);
}

export function lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t;
}
