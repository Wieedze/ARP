import {describe, expect, it} from "vitest";

import {
    claimField,
    claimGrain,
    DOT_BASE_PX,
    dotDiameter,
    foldGroups,
    LOUPE,
    loupeLine,
    loupeRest,
    MAX_DOTS_PER_RING,
    MAX_RINGS,
} from "../claim-field-geometry";

/**
 * The field's placement, which is arithmetic and so is testable without a DOM.
 *
 * Three things can go wrong here and none is visible to a type checker: a dot outside the box, two
 * rings at the same radius, and a cap that silently drops claims. The third is the one
 * `rules/claims.md` cares about — a field showing 36 of 250 without saying so is a count rendered
 * as a total.
 */
describe("claimField", () => {
    it("puts every dot inside the box", () => {
        const {dots} = claimField([5, 9, 3, 12]);
        expect(dots).toHaveLength(29);
        for (const dot of dots) {
            expect(dot.cx).toBeGreaterThan(0);
            expect(dot.cx).toBeLessThan(1);
            expect(dot.cy).toBeGreaterThan(0);
            expect(dot.cy).toBeLessThan(1);
        }
    });

    it("gives each predicate its own radius, growing outward", () => {
        const {rings} = claimField([3, 3, 3]);
        expect(rings.map((ring) => ring.ring)).toEqual([0, 1, 2]);
        for (let index = 1; index < rings.length; index += 1) {
            expect(rings[index]!.r).toBeGreaterThan(rings[index - 1]!.r);
        }
    });

    it("spreads the rings across the band however many there are", () => {
        // A fixed gap per ring left a two-predicate atom using the middle of the box and overflowed
        // a six-predicate one. The outermost ring is at the same radius in every case, so the field
        // reads at one weight across atoms.
        const outermost = (counts: number[]) => {
            const {rings} = claimField(counts);
            return rings[rings.length - 1]!.r;
        };
        expect(outermost([4])).toBeCloseTo(outermost([4, 4]), 10);
        expect(outermost([4, 4])).toBeCloseTo(outermost([4, 4, 4, 4, 4, 4]), 10);
        // And nothing reaches the edge of the box, so a dot's own radius never clips.
        expect(outermost([4, 4, 4])).toBeLessThan(0.5);
    });

    it("indexes dots into the flattened claim list, so a dot maps back to its row", () => {
        // The component looks a row up by `index`; an off-by-one would label every dot with its
        // neighbour's claim and nothing would throw.
        const {dots} = claimField([2, 3]);
        expect(dots.map((dot) => dot.index)).toEqual([0, 1, 2, 3, 4]);
        expect(dots.filter((dot) => dot.ring === 0).map((dot) => dot.index)).toEqual([0, 1]);
        expect(dots.filter((dot) => dot.ring === 1).map((dot) => dot.index)).toEqual([2, 3, 4]);
    });

    it("caps a ring and keeps the real total, so the caller can say so", () => {
        // Measured on mainnet: one tag atom carries 250+ edges on a single predicate, and a ring of
        // 250 dots at any size that stays in the box is a solid line.
        const {rings, dots} = claimField([250]);
        expect(rings[0]!.drawn).toBe(MAX_DOTS_PER_RING);
        expect(rings[0]!.total).toBe(250);
        expect(dots).toHaveLength(MAX_DOTS_PER_RING);
    });

    it("keeps the index aligned past a capped ring", () => {
        // The cap draws fewer dots than the group has, so the next group's first index must still
        // be the group's own offset. Advancing by `drawn` instead of `total` would shift every
        // later dot onto the wrong row — silently, and only on atoms busy enough to hit the cap.
        const {dots} = claimField([250, 2]);
        expect(dots.filter((dot) => dot.ring === 1).map((dot) => dot.index)).toEqual([250, 251]);
    });

    it("rotates alternate rings, so two claims about one subject do not line up", () => {
        const {dots} = claimField([4, 4]);
        const inner = dots.find((dot) => dot.ring === 0)!;
        const outer = dots.find((dot) => dot.ring === 1)!;
        // Both would start at twelve o'clock without the offset, putting them on one radius.
        expect(Math.abs(inner.cx - 0.5)).toBeLessThan(1e-9);
        expect(Math.abs(outer.cx - 0.5)).toBeGreaterThan(0.01);
    });

    it("draws nothing for a predicate with no claims, and still reserves its ring", () => {
        const {rings, dots} = claimField([0, 2]);
        expect(rings).toHaveLength(2);
        expect(rings[0]!.drawn).toBe(0);
        expect(dots.every((dot) => dot.ring === 1)).toBe(true);
    });
});

describe("the v2 field", () => {
    it("folds every group past the cap into one last ring, and drops none", () => {
        const groups = ["a", "b", "c", "d", "e", "f", "g", "h", "i"];
        const shown = foldGroups(groups);
        expect(shown).toHaveLength(MAX_RINGS);
        expect(shown.slice(0, -1).every((ring) => !ring.folded && ring.members.length === 1)).toBe(
            true,
        );
        expect(shown.at(-1)!.folded).toBe(true);
        expect(shown.flatMap((ring) => ring.members)).toEqual(groups);
    });

    it("does not fold at or under the cap", () => {
        expect(foldGroups([1, 2, 3, 4, 5]).some((ring) => ring.folded)).toBe(false);
    });

    it("draws every undrawn claim as grain, exactly", () => {
        // The legend says "36 drawn, the rest as grain": the grain has to be the rest, not a texture.
        for (const total of [37, 100, 250, 1000]) {
            const {rings} = claimField([total]);
            expect(claimGrain(rings[0]!)).toHaveLength(total - MAX_DOTS_PER_RING);
        }
        expect(claimGrain(claimField([12]).rings[0]!)).toHaveLength(0);
    });

    it("keeps the grain inside the box", () => {
        const {rings} = claimField([3, 3, 3, 3, 1000]);
        for (const point of claimGrain(rings[4]!)) {
            expect(point.cx).toBeGreaterThan(0);
            expect(point.cx).toBeLessThan(1);
            expect(point.cy).toBeGreaterThan(0);
            expect(point.cy).toBeLessThan(1);
        }
    });

    it("never grows a dot with nothing behind it", () => {
        // ADR 0042: an amount says the term exists. Size reads positions, and zero is the base.
        expect(dotDiameter(0)).toBe(DOT_BASE_PX);
        expect(dotDiameter(-1)).toBe(DOT_BASE_PX);
        expect(dotDiameter(2)).toBeGreaterThanOrEqual(DOT_BASE_PX);
        expect(dotDiameter(1_000_000)).toBeLessThanOrEqual(17);
    });

    it("rests the loupe at -60° on the ring and draws the line from its rim to the bar", () => {
        const rest = loupeRest(0.42);
        expect(rest.x).toBeCloseTo(0.5 + 0.42 * Math.cos(-Math.PI / 3), 10);
        expect(rest.y).toBeCloseTo(0.5 + 0.42 * Math.sin(-Math.PI / 3), 10);
        const [start, corner, end] = loupeLine(rest)
            .split(" ")
            .map((pair) => pair.split(",").map(Number));
        expect(Math.hypot(start![0]! - rest.x, start![1]! - rest.y)).toBeCloseTo(LOUPE.radius, 3);
        expect(corner![1]).toBe(LOUPE.barY);
        expect(end).toEqual([LOUPE.barEndX, LOUPE.barY]);
    });

    it("always keeps a visible angle, wherever the loupe rides", () => {
        // Every ring radius the field can draw, all the way round. The rise is the segment from
        // the rim to the corner; a few pixels of it reads as a straight line.
        for (const r of [0.17, 0.3, 0.42]) {
            for (let degrees = 0; degrees < 360; degrees += 5) {
                const a = (degrees * Math.PI) / 180;
                const at = {x: 0.5 + r * Math.cos(a), y: 0.5 + r * Math.sin(a)};
                const [start, corner] = loupeLine(at)
                    .split(" ")
                    .map((pair) => pair.split(",").map(Number));
                const rise = Math.hypot(corner![0]! - start![0]!, corner![1]! - start![1]!);
                // 0.1 of a 22rem field is about 35px.
                expect(rise).toBeGreaterThan(0.1);
                // And the corner is in the gap, not under the card, so the angle is seen.
                expect(corner![0]).toBeLessThanOrEqual(LOUPE.cornerMaxX);
            }
        }
    });
});
