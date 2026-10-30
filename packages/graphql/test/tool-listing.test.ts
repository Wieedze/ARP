import {describe, expect, it} from "vitest";

import {TOOL_LISTING_QUERY, TOOL_LISTING_SPONSORED_QUERY} from "../src/queries/tool-listing.js";

describe("the tool listing documents", () => {
    it("counts every deposit on the support term in both", () => {
        for (const query of [TOOL_LISTING_QUERY, TOOL_LISTING_SPONSORED_QUERY]) {
            expect(query).toContain("deposits: deposits_aggregate { aggregate { count } }");
        }
    });

    it("declares no sponsor variable when there is no sponsor to filter on", () => {
        // A null `_eq` is a validation error on the indexer; a filter that matched everything would
        // count every deposit as proven. So the unsponsored document has no such filter at all.
        expect(TOOL_LISTING_QUERY).not.toContain("$sponsor");
        expect(TOOL_LISTING_QUERY).not.toContain("proven");
    });

    it("filters the proven count on the sender, case-insensitively", () => {
        expect(TOOL_LISTING_SPONSORED_QUERY).toContain("$sponsor: String!");
        expect(TOOL_LISTING_SPONSORED_QUERY).toContain(
            "proven: deposits_aggregate(where: {sender_id: {_ilike: $sponsor}})",
        );
    });

    it("never counts the counter-triple's deposits", () => {
        // Opposition is not a use. The deposit counts sit under `term`, and `counter_term` carries
        // only its vault.
        const counter = TOOL_LISTING_SPONSORED_QUERY.slice(
            TOOL_LISTING_SPONSORED_QUERY.indexOf("counter_term"),
        );
        expect(counter).not.toContain("deposits_aggregate");
    });
});
