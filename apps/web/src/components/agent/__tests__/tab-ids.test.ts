import {describe, expect, it} from "vitest";

import {initialSectionOf} from "../tab-ids";

const TABS = [
    {slug: "capabilities", label: "Capabilities", count: 0},
    {slug: "ratings", label: "Ratings", count: 2},
    {slug: "endpoints", label: "Endpoints"},
];

describe("initialSectionOf", () => {
    it("opens the tab a link names", () => {
        expect(initialSectionOf(TABS, "endpoints")).toBe("endpoints");
    });

    it("otherwise opens the first tab with rows, not an empty one", () => {
        expect(initialSectionOf(TABS, null)).toBe("ratings");
        expect(initialSectionOf(TABS, "no-such-tab")).toBe("ratings");
    });

    it("never treats a tab without a count as having rows", () => {
        const tabs = [
            {slug: "endpoints", label: "Endpoints"},
            {slug: "capabilities", label: "Capabilities", count: 35},
        ];
        expect(initialSectionOf(tabs, null)).toBe("capabilities");
    });

    it("falls back to the first tab when none has rows", () => {
        expect(initialSectionOf([{slug: "a", label: "A", count: 0}], null)).toBe("a");
        expect(initialSectionOf([], null)).toBeNull();
    });
});
