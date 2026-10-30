import {describe, expect, it} from "vitest";

import {nextStop} from "../use-claim-loupe";

describe("the tour", () => {
    it("never lands on the claim it is already on", () => {
        for (let from = 0; from < 5; from += 1) {
            for (const roll of [0, 0.2, 0.5, 0.8, 0.999]) {
                const next = nextStop(from, 5, () => roll);
                expect(next).not.toBe(from);
                expect(next).toBeGreaterThanOrEqual(0);
                expect(next).toBeLessThan(5);
            }
        }
    });

    it("can reach every other claim", () => {
        const seen = new Set([0, 0.25, 0.5, 0.75].map((roll) => nextStop(2, 5, () => roll)));
        expect([...seen].sort()).toEqual([0, 1, 3, 4]);
    });

    it("stays on the only claim there is", () => {
        expect(nextStop(null, 1)).toBe(0);
        expect(nextStop(0, 1)).toBe(0);
    });
});
