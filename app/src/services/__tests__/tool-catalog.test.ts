import {describe, expect, it} from "vitest";
import type {ToolListing, ToolListingPage} from "@arp-protocol/core";

import {buildToolCatalogView, TOOL_FILTERS, TOOL_ORDERS} from "../tool-catalog";

function tool(overrides: Partial<ToolListing> = {}): ToolListing {
    return {
        atomId: "0xaa",
        label: "slither",
        uri: "ipfs://bafk",
        hostedAt: "https://colony.io",
        type: "Thing",
        edgeCount: 1,
        pricedEdges: 1,
        supportAssetsSum: 10n ** 18n,
        opposeAssetsSum: 0n,
        ...overrides,
    };
}

function page(tools: ToolListing[], overrides: Partial<ToolListingPage> = {}): ToolListingPage {
    return {
        curveId: 1,
        edgesRead: tools.reduce((n, t) => n + t.edgeCount, 0),
        truncated: false,
        tools,
        ...overrides,
    };
}

describe("buildToolCatalogView", () => {
    it("keeps the listing's order rather than re-sorting", () => {
        const view = buildToolCatalogView(
            page([
                tool({atomId: "0xsecond", supportAssetsSum: 1n}),
                tool({atomId: "0xfirst", supportAssetsSum: 10n ** 20n}),
            ]),
        );
        // The order is a property of the whole listing; a page that re-sorted would make its own
        // order look like the listing's.
        expect(view.rows.map((r) => r.key)).toEqual(["0xsecond", "0xfirst"]);
    });

    it("stands the atom id in for a missing label and marks it for mono", () => {
        const view = buildToolCatalogView(page([tool({label: null, atomId: "0xbb"})]));
        expect(view.rows[0]?.name).toBe("0xbb");
        expect(view.rows[0]?.isUnnamed).toBe(true);
    });

    it("treats a blank label as absent, not as a name", () => {
        const view = buildToolCatalogView(page([tool({label: "   ", atomId: "0xcc"})]));
        expect(view.rows[0]?.isUnnamed).toBe(true);
    });

    it("leaves the counter cell null when nothing stands against the tool", () => {
        // A zero in that cell would read as agreement rather than as absence.
        expect(
            buildToolCatalogView(page([tool({opposeAssetsSum: 0n})])).rows[0]?.opposeTrust,
        ).toBeNull();
        expect(
            buildToolCatalogView(page([tool({opposeAssetsSum: 10n ** 18n})])).rows[0]?.opposeTrust,
        ).not.toBeNull();
    });

    it("carries paid declarations through, never a summed position count", () => {
        // ADR 0023: positions are counted per vault, so a sum across an atom's edges counts
        // nothing a reader recognises. `pricedEdges` is how many edges somebody paid for.
        const view = buildToolCatalogView(page([tool({edgeCount: 3, pricedEdges: 2})]));
        expect(view.rows[0]?.declarations).toBe(3);
        expect(view.rows[0]?.paidDeclarations).toBe(2);
    });

    it("carries truncation through, so a prefix cannot read as the whole set", () => {
        expect(buildToolCatalogView(page([tool()], {truncated: true})).truncated).toBe(true);
    });

    it("offers no order by score, and never will", () => {
        // ADR 0046: ARP composes no score. One descending score column would undo the argument the
        // whole surface exists to make. Asserted as a **set**, because the order of the buttons is
        // a layout decision that has already changed once — pinning the array made a reshuffle look
        // like a regression, which is the opposite of what this test is for.
        expect(new Set(TOOL_ORDERS.map((order) => order.id))).toEqual(
            new Set(["declarations", "conviction"]),
        );
        for (const order of TOOL_ORDERS) {
            expect(order.label).not.toMatch(/score|rank|best|top|rating/i);
        }
    });

    it("sorts by count and by amount, and by nothing in between", () => {
        // Three sorts became two. `priced-edges` ranked by *how many* claims carry a position — a
        // count of backed claims, sitting between the other two and reading as neither. The user
        // read "Most paid for" and "Most staked" as the same thing (2026-10-27), and needing to
        // explain that one is a count and the other a sum is the proof it should not be a button.
        //
        // Two things happen to a tool: an agent says it used it, and somebody puts money on it.
        // Count and amount. That is the whole space.
        expect(TOOL_ORDERS.map((order) => order.label)).toEqual(["Most claims", "Most staked"]);
    });

    it("never says a tool was used, only that somebody claimed it", () => {
        // `docs/14`, first line: a runtime is unobservable from outside, so nothing this page reads
        // can say a use happened. `declarations` counts sentences agents wrote. The label said
        // "Most used" for one commit and the user caught it — "si on déclare qu'on l'utilise mais
        // on l'utilise pas ?". A tier-4 word on tier-1 data (`docs/09` §3).
        for (const label of [
            ...TOOL_ORDERS.map((order) => order.label),
            ...TOOL_FILTERS.map((filter) => filter.label),
        ]) {
            expect(label).not.toMatch(/\bused?\b/i);
        }
    });
});
