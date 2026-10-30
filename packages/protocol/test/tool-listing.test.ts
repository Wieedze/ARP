import {describe, expect, it} from "vitest";

import {TOOL_LISTING_QUERY, TOOL_LISTING_SPONSORED_QUERY} from "@arp-protocol/graphql";

import {INTUITION_MAX_PAGE, listTools} from "../src/tool-listing.js";
import {SAME_AS, USES} from "../src/sources/intuition/terms.js";

/** One `uses` edge, shaped like the graph returns it. */
function edge(params: {
    atomId: string;
    label?: string;
    supportAssets?: string;
    supportPositions?: number;
    opposeAssets?: string;
    hostedAt?: string;
    /** Every deposit on the support term, and how many of them the sponsor sent. */
    deposits?: number;
    proven?: number;
}) {
    return {
        term_id: `edge-${params.atomId}-${params.supportAssets ?? "0"}`,
        object: {
            term_id: params.atomId,
            label: params.label ?? null,
            data: null,
            type: "Thing",
            value: {thing: {url: params.hostedAt ?? null}},
        },
        term: {
            total_assets: params.supportAssets ?? "0",
            vaults: [
                {
                    position_count: params.supportPositions ?? 0,
                    total_assets: params.supportAssets ?? "0",
                },
            ],
            deposits: {aggregate: {count: params.deposits ?? 0}},
            ...(params.proven === undefined ? {} : {proven: {aggregate: {count: params.proven}}}),
        },
        counter_term: {
            total_assets: params.opposeAssets ?? "0",
            vaults: [{position_count: 0, total_assets: params.opposeAssets ?? "0"}],
        },
    };
}

function transportOf(triples: unknown[]) {
    const seen: Record<string, unknown>[] = [];
    const queries: string[] = [];
    return {
        seen,
        queries,
        transport: {
            async request(query: string, variables: Record<string, unknown>) {
                queries.push(query);
                seen.push(variables);
                return {triples};
            },
        },
    };
}

describe("listTools", () => {
    it("groups edges by tool and counts them", async () => {
        const {transport} = transportOf([
            edge({atomId: "0xaa", label: "slither"}),
            edge({atomId: "0xaa", supportAssets: "5"}),
            edge({atomId: "0xbb", label: "foundry"}),
        ]);
        const page = await listTools({transport});
        expect(page.tools.map((t) => [t.atomId, t.edgeCount])).toEqual([
            ["0xaa", 2],
            ["0xbb", 1],
        ]);
        expect(page.edgesRead).toBe(3);
        expect(page.truncated).toBe(false);
    });

    it("counts priced edges, not summed positions — ADR 0023's trap", async () => {
        // Two edges, each with 3 positions. A summed count would say 6, which is a count of nothing
        // a reader recognises. What the page says is that 2 of its edges are paid for.
        const {transport} = transportOf([
            edge({atomId: "0xaa", supportAssets: "10", supportPositions: 3}),
            edge({atomId: "0xaa", supportAssets: "20", supportPositions: 3}),
            edge({atomId: "0xaa", supportAssets: "0", supportPositions: 0}),
        ]);
        const page = await listTools({transport});
        expect(page.tools[0]?.edgeCount).toBe(3);
        expect(page.tools[0]?.pricedEdges).toBe(2);
        // Assets are additive, so their sum is reported — and named as a sum.
        expect(page.tools[0]?.supportAssetsSum).toBe(30n);
    });

    it("treats dust as unpriced: assets without a position are not a stake", async () => {
        // ADR 0042: creating a term seeds both vaults with minShare, so assets alone prove the term
        // exists. 1e6 wei with no position is that dust.
        const {transport} = transportOf([
            edge({atomId: "0xaa", supportAssets: "1000000", supportPositions: 0}),
        ]);
        const page = await listTools({transport});
        expect(page.tools[0]?.pricedEdges).toBe(0);
        expect(page.tools[0]?.supportAssetsSum).toBe(1_000_000n);
    });

    it("orders by priced edges first, then by the money", async () => {
        const {transport} = transportOf([
            edge({atomId: "0xlow", supportAssets: "999", supportPositions: 1}),
            edge({atomId: "0xhigh", supportAssets: "1", supportPositions: 1}),
            edge({atomId: "0xhigh", supportAssets: "1", supportPositions: 1}),
        ]);
        const page = await listTools({transport});
        expect(page.tools.map((t) => t.atomId)).toEqual(["0xhigh", "0xlow"]);
    });

    it("orders by conviction when asked, which is a different answer", async () => {
        const {transport} = transportOf([
            edge({atomId: "0xlow", supportAssets: "999", supportPositions: 1}),
            edge({atomId: "0xhigh", supportAssets: "1", supportPositions: 1}),
            edge({atomId: "0xhigh", supportAssets: "1", supportPositions: 1}),
        ]);
        const page = await listTools({transport, order: "conviction"});
        expect(page.tools.map((t) => t.atomId)).toEqual(["0xlow", "0xhigh"]);
    });

    it("orders by declaration count when asked", async () => {
        const {transport} = transportOf([
            edge({atomId: "0xa"}),
            edge({atomId: "0xa", supportAssets: "1"}),
            edge({atomId: "0xa", supportAssets: "2"}),
            edge({atomId: "0xb", supportAssets: "999", supportPositions: 9}),
        ]);
        const page = await listTools({transport, order: "declarations"});
        expect(page.tools.map((t) => t.atomId)).toEqual(["0xa", "0xb"]);
    });

    it("reports truncation rather than implying a complete picture", async () => {
        const {transport} = transportOf(
            Array.from({length: 4}, (_, i) => edge({atomId: `0x${i}`})),
        );
        const page = await listTools({transport, edgeLimit: 4});
        expect(page.truncated).toBe(true);
    });

    it("carries where the tool is hosted — the pointer an agent goes and visits", async () => {
        const {transport} = transportOf([edge({atomId: "0xaa", hostedAt: "https://colony.io"})]);
        const page = await listTools({transport});
        expect(page.tools[0]?.hostedAt).toBe("https://colony.io");
    });

    it('treats the literal string "null" as no pointer, because three tools carry it', async () => {
        // Re-measured 2026-10-28 over the 85 distinct tools on mainnet `uses` edges: 28 carry no url
        // and three carry the four characters `null`. A pointer that reads as a URL and is not one
        // would send an agent to `https://null`.
        const {transport} = transportOf([
            edge({atomId: "0xaa", hostedAt: "null"}),
            edge({atomId: "0xbb", hostedAt: "   "}),
        ]);
        const page = await listTools({transport});
        expect(page.tools.map((t) => t.hostedAt)).toEqual([null, null]);
    });

    it("filters to agent declarations in the query, not in the caller", async () => {
        // The `uses` predicate is shared and most of what sits on it is prose: measured 2026-10-20,
        // 0 of 185 edges on mainnet 1155 have a subject carrying a `same as` edge. Those are not
        // this protocol's data, so the subject constraint travels in the query rather than leaving
        // the caller to separate two populations.
        const {transport, seen} = transportOf([]);
        await listTools({transport});
        expect(seen[0]?.["sameAs"]).toBe(SAME_AS);
    });

    it("sends the frozen `uses` term id and a numeric curve id", async () => {
        const {transport, seen} = transportOf([]);
        await listTools({transport, curveId: 2});
        expect(seen[0]).toMatchObject({uses: USES, curveId: "2", limit: INTUITION_MAX_PAGE});
        // `curveId` is a Hasura `numeric` and travels as a string; declaring it String! in the
        // query took the whole trust surface down once.
        expect(typeof seen[0]?.["curveId"]).toBe("string");
    });

    it("survives a row with no object, instead of dropping the page", async () => {
        const {transport} = transportOf([{term_id: "x", object: null}, edge({atomId: "0xaa"})]);
        const page = await listTools({transport});
        expect(page.tools).toHaveLength(1);
        expect(page.edgesRead).toBe(2);
    });
});

const SPONSOR = "0x906f3A52ec089f8D4E9127F91C6bE5Ae0d18f91f";

describe("listTools — proven and declared (ADR 0094 §2)", () => {
    it("counts every deposit as declared when no sponsor is configured", async () => {
        // Until the sponsoring service exists there is no proof gate, so nothing can have passed
        // one. Zero proven is true, not unknown.
        const {transport, queries, seen} = transportOf([
            edge({atomId: "0xaa", deposits: 2}),
            edge({atomId: "0xaa", supportAssets: "1", deposits: 1}),
        ]);
        const page = await listTools({transport});
        expect(queries[0]).toBe(TOOL_LISTING_QUERY);
        expect(seen[0]).not.toHaveProperty("sponsor");
        expect(page.sponsor).toBeNull();
        expect(page.tools[0]?.provenDeposits).toBe(0);
        expect(page.tools[0]?.declaredDeposits).toBe(3);
    });

    it("splits each edge's deposits by sender and sums them per tool", async () => {
        const {transport, queries, seen} = transportOf([
            edge({atomId: "0xaa", deposits: 3, proven: 1}),
            edge({atomId: "0xaa", supportAssets: "1", deposits: 2, proven: 2}),
            edge({atomId: "0xbb", deposits: 1, proven: 0}),
        ]);
        const page = await listTools({transport, sponsor: SPONSOR});
        expect(queries[0]).toBe(TOOL_LISTING_SPONSORED_QUERY);
        expect(seen[0]?.["sponsor"]).toBe(SPONSOR);
        expect(page.sponsor).toBe(SPONSOR);
        expect(page.tools.map((t) => [t.atomId, t.provenDeposits, t.declaredDeposits])).toEqual([
            ["0xaa", 3, 2],
            ["0xbb", 0, 1],
        ]);
    });

    it("never reports a negative declared count from an inconsistent response", async () => {
        // Two aggregates are two reads of a table that can move between them. More proven than
        // total would make `declared` negative; it is clamped instead.
        const {transport} = transportOf([edge({atomId: "0xaa", deposits: 1, proven: 4})]);
        const page = await listTools({transport, sponsor: SPONSOR});
        expect(page.tools[0]?.provenDeposits).toBe(1);
        expect(page.tools[0]?.declaredDeposits).toBe(0);
    });

    it("reads a missing aggregate as zero rather than dropping the edge", async () => {
        const {transport} = transportOf([
            {...edge({atomId: "0xaa"}), term: {total_assets: "0", vaults: []}},
        ]);
        const page = await listTools({transport, sponsor: SPONSOR});
        expect(page.tools[0]?.edgeCount).toBe(1);
        expect(page.tools[0]?.provenDeposits).toBe(0);
        expect(page.tools[0]?.declaredDeposits).toBe(0);
    });

    it("refuses a sponsor that is not an address, before any request", async () => {
        // It is matched with `_ilike`, where `%` and `_` are wildcards: a malformed value could
        // count somebody else's deposits as proven.
        const {transport, seen} = transportOf([]);
        await expect(listTools({transport, sponsor: "0x%"})).rejects.toThrow(/not an address/);
        await expect(listTools({transport, sponsor: `${SPONSOR}00`})).rejects.toThrow();
        expect(seen).toHaveLength(0);
    });

    it("treats a null sponsor as none", async () => {
        const {transport, queries} = transportOf([]);
        await listTools({transport, sponsor: null});
        expect(queries[0]).toBe(TOOL_LISTING_QUERY);
    });
});

describe("INTUITION_MAX_PAGE", () => {
    /**
     * The regression this constant exists to stop.
     *
     * `truncated` is `rows.length >= edgeLimit`, and the indexer returns at most 250 rows however
     * large `limit` is (probed on both chains, `atoms` and `triples`, 2026-10-21). So an `edgeLimit`
     * above 250 makes the condition unsatisfiable and a short read reports itself as complete.
     */
    it("clamps an over-large edgeLimit so `truncated` stays reachable", async () => {
        const rows = Array.from({length: INTUITION_MAX_PAGE}, (_, index) => ({
            term_id: `0x${String(index).padStart(64, "0")}`,
            object: {term_id: `0x${"ab".repeat(32)}`, label: "a tool", value: null, term: null},
            term: null,
            counter_term: null,
        }));
        const {transport, seen} = transportOf(rows);
        const page = await listTools({transport, edgeLimit: 10_000});
        expect(seen[0]?.["limit"]).toBe(INTUITION_MAX_PAGE);
        expect(page.edgesRead).toBe(INTUITION_MAX_PAGE);
        expect(page.truncated).toBe(true);
    });
});
