import {describe, expect, it} from "vitest";

import {GONE, SLIDE, handOver, opensAt} from "../scene-hand-over";

/**
 * The two properties ADR `0068` exists for, and nothing else.
 *
 * The deck does pin under `happy-dom` (1024x768 clears the 900x680 threshold), but
 * `getBoundingClientRect()` returns zero there, so `progress` never leaves 0 and no rendered
 * assertion can watch a hand-over happen. The curve below is the only part of it any suite here can
 * reach, which makes it worth asserting precisely: both defects it fixed were visible in a
 * screenshot and invisible to every gate.
 */
describe("handOver", () => {
    it("is fully opaque at a scene's centre and gone by GONE, both directions", () => {
        expect(handOver(0).opacity).toBe(1);
        // `toBeCloseTo`, not `toBe(0)`: at distance 0 the leaving branch computes `-SLIDE * 0`,
        // which is negative zero, and `toEqual` distinguishes the two.
        expect(handOver(0).y).toBeCloseTo(0, 10);
        expect(handOver(GONE).opacity).toBeCloseTo(0, 10);
        expect(handOver(-GONE).opacity).toBeCloseTo(0, 10);
        // Past GONE it stays gone rather than going negative, which would brighten again.
        expect(handOver(1).opacity).toBe(0);
        expect(handOver(-1).opacity).toBe(0);
    });

    it("never leaves two neighbouring scenes both legible", () => {
        // The defect: at HOLD 0.55 two 52px display headings were on screen at once, one through
        // the other. One scene centred means its neighbours are a whole band away, so the real
        // question is the worst case *between* two scenes — where both are 0.5 away.
        const leaving = handOver(0.5);
        const arriving = handOver(-0.5);
        expect(leaving.opacity).toBe(0);
        expect(arriving.opacity).toBe(0);

        // And across the whole hand-over, the two never sum to something readable. 0.15 is the
        // point at which a heading at that opacity over another is text on text.
        for (let d = 0; d <= 1; d += 0.01) {
            const both = handOver(d).opacity + handOver(d - 1).opacity;
            expect(both, `both scenes visible at distance ${d.toFixed(2)}`).toBeLessThanOrEqual(1);
        }
    });

    it("moves on the first frame when leaving and settles when arriving", () => {
        // The asymmetry is the design, not a simplification. Leaving eases **out** of position, so
        // a tenth of the way through the hand-over it has already travelled a visible distance; a
        // scene arriving at the same point has barely started, because it eases **in**.
        const leftEarly = Math.abs(handOver(0.1 * GONE).y);
        const arrivedEarly = Math.abs(handOver(-0.1 * GONE).y);
        expect(leftEarly).toBeGreaterThan(arrivedEarly * 5);

        // Opacity is the other way round: the leaving scene is still nearly solid while it moves.
        expect(handOver(0.1 * GONE).opacity).toBeGreaterThan(handOver(-0.1 * GONE).opacity);
    });

    it("drifts up when leaving and up into place when arriving", () => {
        // Sign matters: the outgoing scene leaves upward and the incoming one rises from below. Get
        // it backwards and the two cross, which reads as a carousel.
        expect(handOver(0.5).y).toBeCloseTo(-SLIDE, 6);
        expect(handOver(-0.5).y).toBeCloseTo(SLIDE, 6);
    });
});

describe("opensAt", () => {
    it("lets the hero arrive at once and makes the rest wait for their cover", () => {
        // The hero has no Saffron in front of it, so it never waits. Every other scene arrives as
        // its cover opens, and scene 1 waits longest because the dive is the longest hand-over.
        expect(opensAt(0)).toBe(-1);
        expect(opensAt(1)).toBeLessThan(opensAt(2));
        for (const index of [2, 3, 4, 5]) expect(opensAt(index)).toBe(-0.2);
    });

    it("never opens after the scene is already active", () => {
        // A positive value would hold a scene's content back past the midpoint swap, which is the
        // one moment the reader is certainly looking at it.
        for (const index of [0, 1, 2, 3, 4, 5]) expect(opensAt(index)).toBeLessThanOrEqual(0);
    });
});
