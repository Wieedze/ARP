import {describe, expect, it} from "vitest";

import {getAtomStanding} from "../src/atom-standing.js";
import type {GraphqlTransport} from "../src/sources/intuition/graphql.js";

/**
 * Shapes recorded from Intuition mainnet on 2026-10-27 by probing a real tag atom, trimmed.
 *
 * The fixture is not tidy on purpose. That atom is the object of edges whose **predicates** are
 * `prefers`, `is better than` and `has tag` — and elsewhere in the same read, of predicates named
 * `Ethereum` and `Bitcoin`. Anybody may use any atom as a predicate, so the grouping has to cope
 * with arbitrary labels rather than a shortlist of nine, and a fixture of only canonical predicates
 * would have tested a graph this one is not.
 *
 * It also carries the dust case, which is the one that matters: `has tag` came back with exactly
 * `1000000` assets and `0` positions, because every term is born with `minShare` (ADR `0042`).
 */
const TAG_ATOM = "0x01336b4575066059d515b932d274c2e90a4d47aaef02e5e4c606700a33e93edd";

const side = (assets: string, positions: number | null) => ({
    total_market_cap: assets,
    total_assets: assets,
    vaults:
        positions === null
            ? []
            : [
                  {
                      market_cap: assets,
                      total_assets: assets,
                      total_shares: "1000",
                      current_share_price: "1",
                      position_count: positions,
                  },
              ],
});

const RECORDED = {
    atom: [
        {
            term_id: TAG_ATOM,
            label: "AI",
            data: "ipfs://bafkreiexample",
            type: "Thing",
            term: side("147470299949236919744", 4305),
        },
    ],
    triples: [
        {
            term_id: "0xe1",
            predicate: {term_id: "0xp-prefers", label: "prefers"},
            subject: {term_id: "0xs1", label: "I", type: "Person"},
            term: side("44902590221278750712", 4126),
            counter_term: side("0", null),
        },
        {
            term_id: "0xe2",
            predicate: {term_id: "0xp-better", label: "is better than"},
            subject: {term_id: "0xs2", label: "Claude", type: "Thing"},
            term: side("12842526627087657496", 0),
            counter_term: side("500", 2),
        },
        {
            term_id: "0xe3",
            predicate: {term_id: "0xp-prefers", label: "prefers"},
            subject: {term_id: "0xs3", label: "Grok", type: "Thing"},
            term: side("1000000000", 1),
            counter_term: side("0", null),
        },
        {
            term_id: "0xe4",
            predicate: {term_id: "0xp-tag", label: "has tag"},
            subject: {term_id: "0xs4", label: null, type: "Thing"},
            term: side("1000000", 0),
            counter_term: side("1000000", 0),
        },
    ],
};

function transport(data: Record<string, unknown>, seen?: {query: string; variables: unknown}[]) {
    return {
        async request(query: string, variables: Record<string, unknown>) {
            seen?.push({query, variables});
            return data;
        },
    } as unknown as GraphqlTransport;
}

describe("getAtomStanding", () => {
    it("reads the atom's own market, which is never an edge's", async () => {
        const standing = await getAtomStanding(TAG_ATOM, {transport: transport(RECORDED)});
        expect(standing.exists).toBe(true);
        expect(standing.label).toBe("AI");
        expect(standing.type).toBe("Thing");
        expect(standing.pinnedUri).toBe("ipfs://bafkreiexample");
        expect(standing.market?.totalAssets).toBe(147_470_299_949_236_919_744n);
        expect(standing.market?.positionCount).toBe(4305);
    });

    it("groups by predicate and keeps the graph's own order", async () => {
        const standing = await getAtomStanding(TAG_ATOM, {transport: transport(RECORDED)});
        // The query orders rows by `total_assets desc`, so the first predicate seen leads. Nothing
        // in the mapper re-sorts: the busiest predicate first is the useful order and the graph has
        // just computed it.
        expect(standing.groups.map((group) => group.predicate.label)).toEqual([
            "prefers",
            "is better than",
            "has tag",
        ]);
        expect(standing.edgeCount).toBe(4);
    });

    it("sums within a group and not across them", async () => {
        const standing = await getAtomStanding(TAG_ATOM, {transport: transport(RECORDED)});
        const prefers = standing.groups.find((group) => group.predicate.label === "prefers");
        expect(prefers?.edges).toHaveLength(2);
        expect(prefers?.assets).toBe(44_902_590_221_278_750_712n + 1_000_000_000n);
        expect(prefers?.positions).toBe(4127);
        // The atom's own 147 TRUST is not in any group, and no group's total is in it.
        expect(standing.market?.totalAssets).not.toBe(prefers?.assets);
    });

    it("carries the dust so the caller can refuse to print it", async () => {
        // ADR `0042`: `minShare` means an unbacked term still reports assets. The mapper does not
        // decide — it reports `1000000` with `0` positions, and the view layer is where the figure
        // is suppressed. Keeping the judgement out of here is the point: a different caller may
        // legitimately want to see the dust.
        const standing = await getAtomStanding(TAG_ATOM, {transport: transport(RECORDED)});
        const tag = standing.groups.find((group) => group.predicate.label === "has tag");
        expect(tag?.assets).toBe(1_000_000n);
        expect(tag?.positions).toBe(0);
    });

    it("keeps a subject with no label, because its id still identifies it", async () => {
        const standing = await getAtomStanding(TAG_ATOM, {transport: transport(RECORDED)});
        const tag = standing.groups.find((group) => group.predicate.label === "has tag");
        expect(tag?.edges[0]?.subject).toEqual({atomId: "0xs4", label: null, type: "Thing"});
    });

    it("reads the counter side, which is almost always empty and sometimes not", async () => {
        const standing = await getAtomStanding(TAG_ATOM, {transport: transport(RECORDED)});
        const better = standing.groups.find((group) => group.predicate.label === "is better than");
        expect(better?.edges[0]?.oppose.positionCount).toBe(2);
        const prefers = standing.groups.find((group) => group.predicate.label === "prefers");
        // An empty `vaults` array is "no vault on this curve", which is not zero positions.
        expect(prefers?.edges[0]?.oppose.positionCount).toBeNull();
    });

    it("drops a row missing its predicate or subject rather than guessing", async () => {
        // The subject is who makes the claim and the predicate is what it says. Neither has a
        // default, so a malformed row is dropped — the alternative is inventing an author.
        const standing = await getAtomStanding(TAG_ATOM, {
            transport: transport({
                atom: RECORDED.atom,
                triples: [
                    {term_id: "0xbad1", subject: {term_id: "0xs"}, term: side("0", 0)},
                    {term_id: "0xbad2", predicate: {term_id: "0xp"}, term: side("0", 0)},
                    {predicate: {term_id: "0xp"}, subject: {term_id: "0xs"}, term: side("0", 0)},
                    ...RECORDED.triples.slice(0, 1),
                ],
            }),
        });
        expect(standing.edgeCount).toBe(1);
        expect(standing.groups).toHaveLength(1);
    });

    it("says the id resolved to nothing, rather than reporting an empty atom", async () => {
        // `exists: false` is a different claim from "nobody points at it", and a caller needs both:
        // one is a typo, the other is the ordinary state of most atoms.
        const standing = await getAtomStanding(TAG_ATOM, {
            transport: transport({atom: [], triples: []}),
        });
        expect(standing.exists).toBe(false);
        expect(standing.market).toBeNull();
        expect(standing.groups).toEqual([]);
    });

    it("reports truncation rather than letting a prefix read as a total", async () => {
        const seen: {query: string; variables: unknown}[] = [];
        const full = await getAtomStanding(TAG_ATOM, {
            transport: transport(RECORDED, seen),
            limit: 4,
        });
        expect(full.truncated).toBe(true);
        expect(seen[0]?.variables).toMatchObject({limit: 4});

        const room = await getAtomStanding(TAG_ATOM, {transport: transport(RECORDED), limit: 50});
        expect(room.truncated).toBe(false);
    });

    it("clamps the limit to the indexer's own page cap", async () => {
        // The indexer returns at most 250 rows however large `limit` is, silently. Asking for 1000
        // and reporting `truncated: false` off a 250-row answer is how a short read reports itself
        // complete — the latent bug `tool-listing.ts` carried with `DEFAULT_EDGE_LIMIT = 500`.
        const seen: {query: string; variables: unknown}[] = [];
        await getAtomStanding(TAG_ATOM, {transport: transport(RECORDED, seen), limit: 1000});
        expect(seen[0]?.variables).toMatchObject({limit: 250});
    });

    it("declares the curve as numeric, which is what the indexer validates", async () => {
        // `$curveId: String!` is rejected at validation time and takes the whole query down — the
        // bug that broke the trust surface on 2026-09-16. A mocked transport cannot catch it, so
        // the declaration itself is asserted.
        const seen: {query: string; variables: unknown}[] = [];
        await getAtomStanding(TAG_ATOM, {transport: transport(RECORDED, seen), curveId: 2});
        expect(seen[0]?.query).toContain("$curveId: numeric!");
        expect(seen[0]?.variables).toMatchObject({curveId: "2"});
    });

    it("filters on the object, so the edges point AT the atom", async () => {
        const seen: {query: string; variables: unknown}[] = [];
        await getAtomStanding(TAG_ATOM, {transport: transport(RECORDED, seen)});
        expect(seen[0]?.query).toContain("object_id: {_eq: $atomId}");
        // And on no predicate, which is the whole reason this reader exists beside `getToolUsage`.
        expect(seen[0]?.query).not.toContain("predicate_id");
    });
});
