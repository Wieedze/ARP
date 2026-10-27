import {describe, expect, it} from "vitest";

import {
    curveLabelOf,
    matchesFilters,
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

describe("matchesFilters", () => {
    it("keeps everything when nothing is on, because a default filter is a ranking", () => {
        expect(matchesFilters(row(), [])).toBe(true);
        expect(matchesFilters(row({declarations: 0, paidDeclarations: 0}), [])).toBe(true);
    });

    it("combines with AND, so two filters narrow rather than widen", () => {
        const neither = row({paidDeclarations: 1, declarations: 0});
        expect(
            matchesFilters(row({paidDeclarations: 1, declarations: 1}), [
                "paid-for",
                "declared-by-agents",
            ]),
        ).toBe(true);
        expect(matchesFilters(neither, ["paid-for", "declared-by-agents"])).toBe(false);
    });

    it("excludes an unknown rather than counting it as zero", () => {
        /**
         * `paidDeclarations` is `null` for a registered row: pricing its declarations needs the
         * per-edge vaults, which is the declared read. Treating `null` as 0 would make "paid for"
         * assert that nobody paid, which this read cannot know — the same distinction the oppose
         * column makes by staying empty.
         */
        expect(matchesFilters(row({paidDeclarations: null}), ["paid-for"])).toBe(false);
        expect(matchesFilters(row({paidDeclarations: 0}), ["paid-for"])).toBe(false);
        expect(matchesFilters(row({paidDeclarations: 1}), ["paid-for"])).toBe(true);
    });

    it("every declared filter is handled", () => {
        // A new `ToolFilter` with no branch would fall through `every` as `undefined` — falsy, so it
        // would silently hide every row rather than failing loudly.
        for (const filter of TOOL_FILTERS) {
            expect(typeof matchesFilters(row(), [filter.id])).toBe("boolean");
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

    it("counts nothing when no filter is on", () => {
        expect(unknowableUnder([registered(), row()], [])).toBe(0);
    });

    it("counts a registered row excluded on an unknown", () => {
        // `paidDeclarations: null` is "this read cannot say", so the exclusion is not a verdict.
        expect(unknowableUnder([registered()], ["paid-for"])).toBe(1);
    });

    it("does NOT count a declared row whose answer is a measured no", () => {
        // `paidDeclarations: 0` is a fact: nobody paid. Calling that unknowable would tell the
        // reader the page cannot see something it can see.
        expect(unknowableUnder([row({paidDeclarations: 0})], ["paid-for"])).toBe(0);
    });

    it("does NOT count a row excluded only by a filter that answered it", () => {
        // `declarations` is measured for both populations, so `declared-by-agents` always answers.
        // A registered row with zero declarations is a no, not an unknown.
        expect(unknowableUnder([registered()], ["declared-by-agents"])).toBe(0);
    });

    it("counts nothing among rows that match", () => {
        expect(unknowableUnder([row()], ["paid-for", "declared-by-agents"])).toBe(0);
    });

    /**
     * The `contested` filter was the other half of this count and ADR `0056` removed it, so
     * `paid-for` is now the only filter that can exclude a row on an unknown. That makes this the
     * whole of the unknowable surface rather than one case of two.
     */
    it("counts only the unknown, never a measured no", () => {
        expect(unknowableUnder([registered()], ["paid-for"])).toBe(1);
        expect(unknowableUnder([row({paidDeclarations: 0})], ["paid-for"])).toBe(0);
    });
});

describe("curveLabelOf", () => {
    it("names the two curves this app knows", () => {
        expect(curveLabelOf(1)).toBe("Long term");
        expect(curveLabelOf(2)).toBe("Short term");
    });

    it("falls back to the id rather than inventing a name", () => {
        // The reason the function exists rather than being an index lookup: a curve this app does
        // not know is a curve it cannot name, and "curve 7" is honest where "Long term" would be an
        // invention. `defaultCurveId` is governance-configurable.
        expect(curveLabelOf(7)).toBe("curve 7");
    });
});
