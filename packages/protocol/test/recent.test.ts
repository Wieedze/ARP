import {describe, expect, it} from "vitest";

import {getRecentDeclarations} from "../src/recent.js";
import {SAME_AS, USES} from "../src/sources/intuition/terms.js";

/** One `uses` edge, shaped the way the indexer returns it. */
function edge(params: {
    id: string;
    at: string;
    subject?: string | null;
    object?: string | null;
    assets?: string;
    positions?: number;
}) {
    return {
        term_id: params.id,
        created_at: params.at,
        subject: {term_id: "agent-1", label: params.subject ?? "Agent One"},
        object: {term_id: "tool-1", label: params.object ?? "Slither"},
        term: {
            total_assets: params.assets ?? "1000000",
            vaults: [{position_count: params.positions ?? 0}],
        },
    };
}

function transportOf(triples: unknown[]) {
    const seen: Record<string, unknown>[] = [];
    return {
        seen,
        transport: {
            async request(_query: string, variables: Record<string, unknown>) {
                seen.push(variables);
                return {triples};
            },
        },
    };
}

describe("getRecentDeclarations", () => {
    it("asks for `uses` edges whose subject carries `same as`", async () => {
        const {seen, transport} = transportOf([]);
        await getRecentDeclarations({transport, limit: 5});

        // The filter is the whole point of this read: without it the newest `uses` edges on
        // mainnet are `Optimism uses …`, `Arbitrum uses …` — prose, not agent declarations. It
        // lives in the query so a caller cannot forget it.
        expect(seen[0]).toMatchObject({uses: USES, sameAs: SAME_AS, limit: 5});
    });

    it("sends `curveId` as a string, because the variable is declared `numeric`", async () => {
        const {seen, transport} = transportOf([]);
        await getRecentDeclarations({transport, curveId: 2});

        // Declaring it `String!` is rejected at validation time and takes the whole query down —
        // the bug that broke the trust surface on 2026-09-16.
        expect(seen[0]?.["curveId"]).toBe("2");
    });

    it("reports assets only when a position stands behind the claim", async () => {
        const {transport} = transportOf([
            edge({id: "backed", at: "2026-10-20T10:00:00Z", positions: 1, assets: "5000000"}),
            edge({id: "bare", at: "2026-10-19T10:00:00Z", positions: 0, assets: "1000000"}),
        ]);
        const rows = await getRecentDeclarations({transport});

        // Every term is born holding `minShare`, so a non-zero figure is not evidence of a stake.
        // The position count is the test, never the amount (ADR `0042`).
        expect(rows[0]).toMatchObject({tripleId: "backed", assets: 5000000n, positions: 1});
        expect(rows[1]).toMatchObject({tripleId: "bare", assets: null, positions: 0});
    });

    it("drops a row missing any of the four fields a reader needs", async () => {
        const good = edge({id: "whole", at: "2026-10-20T10:00:00Z"});
        const {transport} = transportOf([
            good,
            {...good, term_id: null},
            {...good, created_at: null},
            {...good, subject: null},
            {...good, object: null},
            "not an object",
        ]);
        const rows = await getRecentDeclarations({transport});

        // A declaration without a subject, an object or a date is not one anybody can act on, and
        // guessing at the gap would put a half-row on the front page.
        expect(rows).toHaveLength(1);
        expect(rows[0]?.tripleId).toBe("whole");
    });

    it("returns an empty list rather than throwing when nothing qualifies", async () => {
        // Mainnet returns zero and that is the honest answer, not a failure — a caller renders it
        // as "nothing yet" and never falls back to a sample.
        const {transport} = transportOf([]);
        await expect(getRecentDeclarations({transport})).resolves.toEqual([]);
    });
});
