import {describe, expect, it} from "vitest";

import {
    curveLabelOf,
    matchesFilter,
    TOOL_FILTERS,
    unknowableUnder,
    type ToolRow,
} from "../tool-catalog";

const row = (overrides: Partial<ToolRow> = {}): ToolRow => ({
    key: `0x${"ab".repeat(32)}`,
    provenance: "declared",
    name: "github.com/crytic/slither",
    isUnnamed: false,
    href: "/atom/0xab",
    declarations: 3,
    paidDeclarations: 2,
    supportTrust: "1.0000",
    opposeTrust: null,
    stakers: null,
    ...overrides,
});

describe("matchesFilter", () => {
    it("keeps everything under `all`, because a default narrowing is a ranking", () => {
        expect(matchesFilter(row(), "all")).toBe(true);
        expect(matchesFilter(row({declarations: 0, paidDeclarations: 0}), "all")).toBe(true);
    });

    it("is one axis: `paid` is strictly inside `used`, which is inside `all`", () => {
        // Why the two checkboxes became one control. They were nested, so turning the stricter one
        // on made the looser one do nothing — and that is exactly what the user could not see
        // (2026-10-27): "c'est quoi la diff entre paid for et used by agent ?".
        const paid = row({declarations: 3, paidDeclarations: 2});
        const usedOnly = row({declarations: 3, paidDeclarations: 0});
        const neither = row({declarations: 0, paidDeclarations: 0});

        for (const [subject, all, used, isPaid] of [
            [paid, true, true, true],
            [usedOnly, true, true, false],
            [neither, true, false, false],
        ] as const) {
            expect(matchesFilter(subject, "all")).toBe(all);
            expect(matchesFilter(subject, "used")).toBe(used);
            expect(matchesFilter(subject, "paid")).toBe(isPaid);
        }
    });

    it("excludes an unknown rather than counting it as zero", () => {
        /**
         * `paidDeclarations` is `null` for a registered row: pricing its declarations needs the
         * per-edge vaults, which is the declared read. Treating `null` as 0 would make "paid for"
         * assert that nobody paid, which this read cannot know — the same distinction the oppose
         * column makes by staying empty.
         */
        expect(matchesFilter(row({paidDeclarations: null}), "paid")).toBe(false);
        expect(matchesFilter(row({paidDeclarations: 0}), "paid")).toBe(false);
        expect(matchesFilter(row({paidDeclarations: 1}), "paid")).toBe(true);
    });

    it("every declared filter is handled", () => {
        // A new `ToolFilter` with no branch returns `undefined` — falsy, so it would silently hide
        // every row rather than failing loudly.
        for (const filter of TOOL_FILTERS) {
            expect(typeof matchesFilter(row(), filter.id)).toBe("boolean");
        }
    });

    it("offers three points and reads loosest first", () => {
        expect(TOOL_FILTERS.map((filter) => filter.id)).toEqual(["all", "used", "paid"]);
        expect(TOOL_FILTERS.map((filter) => filter.label)).toEqual(["All", "Claimed", "Paid for"]);
        // No tooltips: an explanation a reader must hover for is one a touch screen never gets.
        for (const filter of TOOL_FILTERS) {
            expect(filter).not.toHaveProperty("title");
        }
    });
});

describe("unknowableUnder", () => {
    /**
     * Which of two **epistemically different** sentences a reader sees about what this page knows.
     *
     * "No row matches what you asked" and "the rows that exist cannot answer what you asked" are
     * not the same claim, and a reader who registered the only tool on the list deserves the second
     * — every filter here is about declarations, and a registered-only row has no per-edge figures
     * to answer with.
     */
    const registered = (overrides: Partial<ToolRow> = {}) =>
        row({
            provenance: "registered",
            paidDeclarations: null,
            declarations: 0,
            opposeTrust: null,
            stakers: 1,
            ...overrides,
        });

    it("counts nothing under `all`", () => {
        expect(unknowableUnder([registered(), row()], "all")).toBe(0);
    });

    it("counts a registered row excluded on an unknown", () => {
        // `paidDeclarations: null` is "this read cannot say", so the exclusion is not a verdict.
        expect(unknowableUnder([registered()], "paid")).toBe(1);
    });

    it("does NOT count a declared row whose answer is a measured no", () => {
        // `paidDeclarations: 0` is a fact: nobody paid. Calling that unknowable would tell the
        // reader the page cannot see something it can see.
        expect(unknowableUnder([row({paidDeclarations: 0})], "paid")).toBe(0);
    });

    it("counts nothing under `used`, which every row can answer", () => {
        // `declarations` is measured for both populations, so `used` always answers. A registered
        // row with zero declarations is a no, not an unknown.
        expect(unknowableUnder([registered()], "used")).toBe(0);
    });

    /**
     * The `contested` filter was the other half of this count and ADR `0056` removed it, so `paid`
     * is now the only point on the axis that can exclude a row on an unknown. That makes this the
     * whole of the unknowable surface rather than one case of two.
     */
    it("counts only the unknown, never a measured no", () => {
        expect(unknowableUnder([registered()], "paid")).toBe(1);
        expect(unknowableUnder([row({paidDeclarations: 0})], "paid")).toBe(0);
    });
});

describe("curveLabelOf", () => {
    it("names the two curves this app knows", () => {
        // The contract's own names. They were "Long term" and "Short term", which is an
        // invention — nothing in a bonding curve is about time — under a control called "Horizon"
        // that the user could not read at all (2026-10-27).
        expect(curveLabelOf(1)).toBe("Linear");
        expect(curveLabelOf(2)).toBe("Progressive");
    });

    it("falls back to the id rather than inventing a name", () => {
        // The reason the function exists rather than being an index lookup: a curve this app does
        // not know is a curve it cannot name, and "curve 7" is honest where a made-up label would
        // not be. `defaultCurveId` is governance-configurable.
        expect(curveLabelOf(7)).toBe("curve 7");
    });
});
