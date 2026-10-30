import {describe, expect, it} from "vitest";

import {CORE_FRACTION, RINGS_GEOMETRY, TILT, clamp, lerp, smooth} from "../source-field-geometry";

/**
 * The mark's geometry, which is the design decision — the canvas loop over it is not testable here
 * and is checked in a browser (`MOTION-V2.md` §5).
 *
 * The properties below are the ones that make it read as a source rather than as a target: gaps
 * that tighten outward, a dot count that keeps the arc between dots roughly even, and dots that
 * shrink with distance. Changing one changes the mark, so each is asserted rather than assumed.
 */
describe("RINGS_GEOMETRY", () => {
    it("has 22 rings, innermost first, inside the rim", () => {
        expect(RINGS_GEOMETRY).toHaveLength(22);
        expect(RINGS_GEOMETRY[0]?.distance).toBe(0);
        expect(RINGS_GEOMETRY.at(-1)?.distance).toBe(1);
        for (const ring of RINGS_GEOMETRY) {
            expect(ring.radius).toBeGreaterThan(0);
            expect(ring.radius).toBeLessThanOrEqual(1);
        }
    });

    it("spaces the rings tighter towards the rim", () => {
        // The whole reason `f(u)` is not linear. Evenly spaced rings read as a target; a dense
        // core reads as a source, which is what the mark is named for.
        const gaps = RINGS_GEOMETRY.slice(1).map(
            (ring, index) => ring.radius - (RINGS_GEOMETRY[index]?.radius ?? 0),
        );
        for (const [index, gap] of gaps.entries()) {
            expect(gap, `gap ${index} is not positive`).toBeGreaterThan(0);
            if (index === 0) continue;
            expect(gap, `gap ${index} is wider than the one inside it`).toBeLessThan(
                gaps[index - 1] ?? Infinity,
            );
        }
        // And the ratio across the whole field is the one the design names.
        const first = gaps[0] ?? 0;
        const last = gaps.at(-1) ?? 0;
        expect(first / last).toBeGreaterThan(6);
        expect(first / last).toBeLessThan(10);
    });

    it("adds six dots per ring and shrinks them with distance", () => {
        RINGS_GEOMETRY.forEach((ring, index) => {
            expect(ring.count).toBe(6 * (index + 1));
            if (index === 0) return;
            expect(ring.size).toBeLessThan(RINGS_GEOMETRY[index - 1]?.size ?? Infinity);
        });
    });

    it("alternates the direction of rotation and slows the outer rings", () => {
        // Neighbours shearing against each other is what keeps the field from reading as one
        // rotating object, and the outer rings turning slower is what keeps it from reading as a
        // rigid disc.
        RINGS_GEOMETRY.forEach((ring, index) => {
            const inner = RINGS_GEOMETRY[index - 1];
            if (inner === undefined) return;
            expect(Math.sign(ring.speed)).toBe(-Math.sign(inner.speed));
            expect(Math.abs(ring.speed)).toBeLessThan(Math.abs(inner.speed));
        });
    });

    it("keeps the core inside the first ring", () => {
        // A core that reached the first ring would read as a filled disc, and the dive would start
        // from something already solid.
        expect(CORE_FRACTION).toBeGreaterThan(0);
        expect(CORE_FRACTION).toBeLessThan(RINGS_GEOMETRY[0]?.radius ?? 0);
    });

    it("tilts rather than squashing flat", () => {
        expect(TILT).toBeLessThan(1);
        expect(TILT).toBeGreaterThan(0.9);
    });
});

describe("the easing helpers", () => {
    it("clamps to the range it is given", () => {
        expect(clamp(-1)).toBe(0);
        expect(clamp(2)).toBe(1);
        expect(clamp(5, 0, 3)).toBe(3);
    });

    it("smooths with a flat derivative at both ends", () => {
        expect(smooth(0)).toBe(0);
        expect(smooth(1)).toBe(1);
        expect(smooth(0.5)).toBe(0.5);
        // Flat at the ends is the property that keeps a scrubbed fade from snapping: a step near
        // zero moves the output less than the same step in the middle.
        expect(smooth(0.02)).toBeLessThan(0.02);
        expect(smooth(0.98)).toBeGreaterThan(0.98);
    });

    it("interpolates", () => {
        expect(lerp(10, 20, 0)).toBe(10);
        expect(lerp(10, 20, 1)).toBe(20);
        expect(lerp(10, 20, 0.5)).toBe(15);
    });
});
