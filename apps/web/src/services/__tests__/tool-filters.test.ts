import {describe, expect, it} from "vitest";

import {curveLabelOf, toolIndexOf, type ToolRow} from "../tool-catalog";

const row = (overrides: Partial<ToolRow> = {}): ToolRow => ({
    key: `0x${"ab".repeat(32)}`,
    provenance: "declared",
    name: "crytic/slither",
    isUnnamed: false,
    source: null,
    label: null,
    href: "/atom/0xab",
    declarations: 3,
    paidDeclarations: 2,
    supportTrust: "1.0000",
    opposeTrust: null,
    stakers: null,
    ...overrides,
});

describe("toolIndexOf", () => {
    it("files a skill under skills and everything else under repositories", () => {
        expect(toolIndexOf(row({name: "brainstorming", source: "obra/superpowers"}))).toBe(
            "skills",
        );
        expect(toolIndexOf(row())).toBe("repos");
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
