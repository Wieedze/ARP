import {describe, expect, it} from "vitest";

import {
    CELLS,
    fnv1a,
    GRID,
    LARGE_FROM,
    sigilDots,
    trameDots,
    type SigilModule,
} from "../sigil-geometry";

/**
 * The sigil's whole claim is that it is an **identity**: the same agent produces the same glyph
 * everywhere and forever. Nothing else in the app asserts that, so these are the tests that make it
 * true rather than intended — a silent change here would re-draw every agent in the product and no
 * other gate would notice.
 */

const MODULES: SigilModule[] = [
    {name: "ipfs", state: "proven"},
    {name: "github", state: "declared"},
    {name: "cursor", state: "mismatch"},
];

describe("the cell budget", () => {
    it("is 27: columns 0-3 over 7 rows, minus the centre", () => {
        expect(CELLS).toHaveLength(27);
        expect(CELLS).not.toContainEqual([3, 3]);
        expect(CELLS.every(([col, row]) => col >= 0 && col < 4 && row >= 0 && row < GRID)).toBe(
            true,
        );
    });
});

describe("fnv1a", () => {
    it("is stable and unsigned", () => {
        // Pinned values, not properties: the hash IS the placement, so a different implementation
        // that is still "a good hash" would move every dot in the product.
        expect(fnv1a("")).toBe(2166136261);
        expect(fnv1a("a")).toBe(0xe40c292c);
        expect(fnv1a("foobar")).toBe(0xbf9cf968);
        expect(fnv1a("ipfs0xabc")).toBeGreaterThanOrEqual(0);
    });
});

describe("sigilDots", () => {
    it("is deterministic in the agent and the module names", () => {
        expect(sigilDots("0xagent", MODULES, 104)).toEqual(sigilDots("0xagent", MODULES, 104));
    });

    it("gives two different agents different glyphs from the same modules", () => {
        expect(sigilDots("0xagent-one", MODULES, 104)).not.toEqual(
            sigilDots("0xagent-two", MODULES, 104),
        );
    });

    it("mirrors every cell off the axis and never the one on it", () => {
        const dots = sigilDots("0xagent", MODULES, 104);
        // Column 3's centre is 4.5 + 8.5*3 = 30, the axis itself.
        for (const dot of dots) if (dot.cx === 30) expect(dot.mirrored).toBe(false);
        const offAxis = dots.filter((d) => d.cx !== 30);
        for (const dot of offAxis.filter((d) => !d.mirrored)) {
            expect(
                offAxis.some(
                    (other) => other.mirrored && other.cy === dot.cy && other.cx === 60 - dot.cx,
                ),
            ).toBe(true);
        }
    });

    it("never exceeds the grid, however many modules are declared", () => {
        const many: SigilModule[] = Array.from({length: 40}, (_, i) => ({
            name: `module-${i}`,
            state: "declared",
        }));
        const claimed = new Set(sigilDots("0xagent", many, 104).map((d) => `${d.cx},${d.cy}`));
        // 27 cells, of which 24 are off-axis and so drawn twice: at most 24*2 + 3 = 51 positions.
        expect(claimed.size).toBeLessThanOrEqual(51);
    });

    /**
     * `max(3, ceil(12 / moduleCount))` reads as a floor of three and is also a *target of twelve*.
     * One module claims twelve cells, so a single-tool agent still reads as a glyph rather than as
     * three specks; the floor only binds once there are five or more modules. Both halves are
     * asserted because a first draft of this test read the formula as "three each" and failed.
     */
    it("targets twelve dots, and floors at three per module once there are many", () => {
        const one = sigilDots("0xagent", [{name: "ipfs", state: "proven"}], 104);
        expect(one.filter((d) => !d.mirrored)).toHaveLength(12);

        const four = sigilDots("0xagent", [...MODULES, {name: "ipfs2", state: "proven"}], 104);
        expect(four.filter((d) => !d.mirrored)).toHaveLength(12);

        // Twelve modules: ceil(12/12) = 1, floored to 3, so 36 claims against 27 cells — the grid
        // fills and the rest are dropped rather than overflowing.
        const twelve: SigilModule[] = Array.from({length: 12}, (_, i) => ({
            name: `m${i}`,
            state: "declared",
        }));
        expect(sigilDots("0xagent", twelve, 104).filter((d) => !d.mirrored)).toHaveLength(27);
    });

    it("grows the dots below the large threshold, because the smallest tier vanishes at row size", () => {
        const large = sigilDots("0xagent", MODULES, LARGE_FROM);
        const small = sigilDots("0xagent", MODULES, LARGE_FROM - 1);
        expect(Math.min(...large.map((d) => d.r))).toBeLessThan(
            Math.min(...small.map((d) => d.r)),
        );
        // Same cells, different radii — the placement must not move with the size.
        expect(large.map((d) => [d.cx, d.cy])).toEqual(small.map((d) => [d.cx, d.cy]));
    });

    it("carries each module's state onto its dots", () => {
        expect(new Set(sigilDots("0xagent", MODULES, 104).map((d) => d.state))).toEqual(
            new Set(["proven", "declared", "mismatch"]),
        );
    });
});

describe("trameDots", () => {
    it("covers the full 7 x 7, including cells nothing can claim", () => {
        expect(trameDots(104)).toHaveLength(GRID * GRID);
        // The centre has no claimable cell but does carry a trame dot under the core.
        expect(trameDots(104)).toContainEqual({cx: 30, cy: 30, r: 0.6});
    });

    it("thickens below the large threshold", () => {
        expect(trameDots(48)[0].r).toBeGreaterThan(trameDots(104)[0].r);
    });
});
