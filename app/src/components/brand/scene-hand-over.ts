import {clamp, smooth} from "./source-field-geometry";

/**
 * How one scene leaves and the next arrives, as a function of scroll (ADR `0068`).
 *
 * ## Scenes do not overlap, and opacity is still continuous
 *
 * v1 held a scene fully opaque for 0.55 of its band and cross-faded over the rest, which put two
 * 52px display headings on screen at once, one through the other — measured at `progress 1.8`. The
 * overlap was never the point; the point was that opacity stay a **continuous function of scroll**,
 * because v1's predecessor switched on a rounded index and read as "a jump followed by a slow
 * fade". Those two properties are separable, and v1 conflated them.
 *
 * ## The asymmetry is the design
 *
 * Leaving eases **out** of position but **in** to transparency, so the text is seen moving while it
 * is still readable. Arriving does the reverse, so it is nearly opaque by the time it stops. Both
 * ease-out on both channels and a scene leaves before anybody notices it moved.
 *
 * Its own module so that it can be tested — the two assertions worth making are that a scene is
 * gone at {@link GONE} and that the two directions are not mirror images — and because a file
 * exporting both a component and a function breaks React Fast Refresh.
 */

/**
 * How far from its centre, in scenes, a scene is fully gone.
 *
 * Below 0.5, so there is a gap with nothing on screen: 4% of a band, which at a 1700–2900ms
 * hand-over is 70–120ms. Long enough that two headings never collide, short enough to read as one
 * beat rather than a cut, and the Saffron cover is over it anyway.
 */
export const GONE = 0.48;

/**
 * Px of drift across a whole hand-over.
 *
 * Up from v1's 18, which was invisible over a 240ms fade. The drift now spans a whole band rather
 * than a quarter of one, so it reads as slow travel; past about 120 it reads as a carousel.
 */
export const SLIDE = 70;

export function handOver(distance: number): {opacity: number; y: number} {
    const t = clamp(Math.abs(distance) / GONE);
    if (distance >= 0) return {opacity: 1 - t * t, y: -SLIDE * (1 - (1 - t) * (1 - t))};
    return {opacity: 1 - smooth(t), y: SLIDE * t * t};
}

/**
 * How far into a hand-over a scene's own elements start arriving.
 *
 * Negative, because it is measured from the scene's centre and the arrival happens *before* it. The
 * elements start as the Saffron cover **opens** onto the scene, not at the midpoint swap where the
 * cover still hides them — the hero has no cover in front of it and arrives immediately, and the
 * dive is the longest hand-over, so scene 1 waits longer than the rest.
 */
/**
 * How much of the hero is left, as the dive takes the screen.
 *
 * `MOTION-V2.md` §2.1.3: _"Scene 0 also fades over `progress ∈ [0, 0.34]` (ease-out), because the
 * dive needs the screen."_ {@link handOver} alone leaves the hero at half opacity at 0.34 and
 * gone only at {@link GONE} — by which point the zoom is past 11× and the growing core already
 * dominates, so the copy is half-lit over something that has replaced it.
 *
 * Ease-out, so it starts leaving on the first frame rather than waiting.
 */
export function heroClear(progress: number): number {
    const t = clamp(progress / 0.34);
    return 1 - (1 - (1 - t) * (1 - t));
}

export function opensAt(index: number): number {
    if (index === 0) return -1;
    if (index === 1) return -0.33;
    return -0.2;
}
