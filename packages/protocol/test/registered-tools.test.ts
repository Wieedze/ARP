import {describe, expect, it} from "vitest";

import {TOOL_THING_DESCRIPTION} from "../src/declare/index.js";
import {SAME_AS, USES} from "../src/sources/intuition/terms.js";
import {listRegisteredTools} from "../src/registered-tools.js";
import {INTUITION_MAX_PAGE} from "../src/tool-listing.js";
import type {GraphqlTransport} from "@arp-protocol/graphql";

/** An atom row shaped like the indexer's, so the reader is checked against the real response. */
const atom = (
    id: string,
    name: string,
    positions: number | null,
    assets: string | null,
    declarations = 0,
) => ({
    term_id: id,
    label: name,
    data: `ipfs://bafkrei${id.slice(2)}`,
    value: {thing: {url: `https://${name}`}},
    term: {vaults: positions === null ? [] : [{position_count: positions, total_assets: assets}]},
    as_object_triples_aggregate: {aggregate: {count: declarations}},
});

function transportOf(atoms: unknown[]): {
    transport: GraphqlTransport;
    seen: Record<string, unknown>[];
} {
    const seen: Record<string, unknown>[] = [];
    return {
        transport: {
            async request(_query: string, variables?: Record<string, unknown>) {
                seen.push(variables ?? {});
                return {atoms};
            },
        },
        seen,
    };
}

describe("listRegisteredTools", () => {
    it("asks for the recipe's fixed description, which is the whole membership test", async () => {
        // A registered tool is recognised by the recipe, not by a list ARP keeps: every field of a
        // tool's Thing derives from its normalised URL and `description` is identical for all of
        // them (ADR `0054`). So membership is computable and verifiable by anyone, and there is
        // nothing to store — which is ADR `0051`.
        const {transport, seen} = transportOf([]);
        await listRegisteredTools({transport, curveId: 2});
        expect(seen[0]).toMatchObject({
            description: TOOL_THING_DESCRIPTION,
            curveId: "2",
            limit: INTUITION_MAX_PAGE,
        });
    });

    it("filters the declaration count on BOTH clauses `listTools` uses", async () => {
        /**
         * Unfiltered, the aggregate counted **every** incoming triple under any predicate, and the
         * catalogue prints it in the same column as `listTools`'s figure — which counts `uses` edges
         * from identified agents only. Two populations, one column, one word: `rules/claims.md` §2,
         * in the component whose existence rests on the opposite filter being necessary.
         */
        const {transport, seen} = transportOf([]);
        await listRegisteredTools({transport});
        expect(seen[0]?.["uses"]).toBe(USES);
        // And the subject must carry a `same as` edge, which is the only proof on the graph that it
        // is a real agent. This clause was missing for a round, and the catalogue prints this count
        // in the same column as `listTools`'s — so the two have to mean the same thing.
        expect(seen[0]?.["sameAs"]).toBe(SAME_AS);
    });

    it("clamps an over-large limit at the indexer's silent cap", async () => {
        const {transport, seen} = transportOf([]);
        await listRegisteredTools({transport, limit: 10_000});
        expect(seen[0]?.["limit"]).toBe(INTUITION_MAX_PAGE);
    });

    it("reads an empty set as empty rather than as a failure", async () => {
        // The live state on both chains, 2026-10-21: nothing is registered yet. A catalogue that
        // cannot say "nothing here" without erroring is a catalogue nobody can launch with.
        const page = await listRegisteredTools({transport: transportOf([]).transport});
        expect(page.tools).toEqual([]);
        expect(page.truncated).toBe(false);
    });

    it("orders on positions before assets, because assets include the creation dust", async () => {
        // Every term's vault is seeded with `minShare` when it is created (ADR `0042`), so a tool
        // nobody staked on still reports assets. Sorting on assets alone ranks dust against
        // conviction.
        const page = await listRegisteredTools({
            transport: transportOf([
                atom("0xaa", "dusty.example", 0, "1000000"),
                atom("0xbb", "backed.example", 2, "500000000000000"),
                atom("0xcc", "single.example", 1, "900000000000000"),
            ]).transport,
        });
        expect(page.tools.map((tool: {label: string | null}) => tool.label)).toEqual([
            "backed.example",
            "single.example",
            "dusty.example",
        ]);
    });

    it("carries the url as a pointer and normalises the literal string \"null\"", async () => {
        const rows = [atom("0xaa", "a.example", 1, "1"), atom("0xbb", "b.example", 1, "1")];
        (rows[1] as {value: {thing: {url: string}}}).value.thing.url = "null";
        const page = await listRegisteredTools({transport: transportOf(rows).transport});
        expect(page.tools[0]?.url).toBe("https://a.example");
        expect(page.tools.find((tool: {label: string | null}) => tool.label === "b.example")?.url).toBeNull();
    });

    it("reports a missing vault as zero rather than throwing", async () => {
        // An atom read off a curve it has no vault on. `tool-usage.ts` has the same shape and the
        // same reason: 89% of mainnet `uses`-edge TRUST is on curve 2, so a curve-1 read legitimately
        // finds nothing.
        const page = await listRegisteredTools({
            transport: transportOf([atom("0xaa", "offcurve.example", null, null)]).transport,
        });
        expect(page.tools[0]?.positionCount).toBe(0);
        expect(page.tools[0]?.assets).toBe(0n);
    });

    it("counts the uses edges pointing at a registered tool", async () => {
        // Registered and declared are different facts: a person registers the atom, an agent writes
        // `(agent, uses, tool)` onto it. A tool can have either, both or neither.
        const page = await listRegisteredTools({
            transport: transportOf([atom("0xaa", "used.example", 1, "1", 4)]).transport,
            order: "declarations",
        });
        expect(page.tools[0]?.declarations).toBe(4);
    });
});

/** A transport that pages: each request returns the slice `offset` asks for. */
function pagingTransportOf(all: unknown[]): {transport: GraphqlTransport; requests: number} {
    const state = {requests: 0};
    return {
        get requests() {
            return state.requests;
        },
        transport: {
            async request(_query: string, variables?: Record<string, unknown>) {
                state.requests += 1;
                const limit = Number(variables?.["limit"] ?? INTUITION_MAX_PAGE);
                const offset = Number(variables?.["offset"] ?? 0);
                return {atoms: all.slice(offset, offset + limit)};
            },
        },
    };
}

describe("listRegisteredTools, paging", () => {
    // The defect: the indexer caps this query at 250 rows whatever `limit` asks for, so one request
    // read 250 of the 716 atoms carrying the description on testnet — and then SORTED them under a
    // heading that says "by conviction". A prefix sorted is not a ranking.
    const many = Array.from({length: 716}, (_, i) =>
        atom(`0x${String(i).padStart(64, "0")}`, `example.com/t${i}`, i, String(i)),
    );

    it("reads every page, not the first one", async () => {
        const paging = pagingTransportOf(many);
        const page = await listRegisteredTools({transport: paging.transport});
        expect(page.tools).toHaveLength(716);
        expect(page.truncated).toBe(false);
        // 716 at the 250 cap: three full pages and a short one that ends the walk.
        expect(paging.requests).toBe(3);
    });

    it("ranks over the whole set rather than over the first page", async () => {
        const page = await listRegisteredTools({transport: pagingTransportOf(many).transport});
        // The highest position count is in the last page, so a single-page read could not find it.
        expect(page.tools[0]?.positionCount).toBe(715);
    });

    it("stops at maxRows and says so", async () => {
        const page = await listRegisteredTools({
            transport: pagingTransportOf(many).transport,
            maxRows: 300,
        });
        expect(page.truncated).toBe(true);
        expect(page.tools.length).toBeLessThan(716);
    });

    it("asks for an offset on every request", async () => {
        const paging = pagingTransportOf(many);
        await listRegisteredTools({transport: paging.transport, limit: 100});
        expect(paging.requests).toBe(8);
    });
});
