import {describe, expect, it} from "vitest";

import {claimField, MAX_DOTS_PER_RING} from "../claim-field-geometry";

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
