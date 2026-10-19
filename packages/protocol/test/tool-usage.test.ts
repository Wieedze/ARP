import {describe, expect, it} from "vitest";

import {getToolUsage} from "../src/tool-usage.js";
import {USES} from "../src/sources/intuition/terms.js";
import type {GraphqlTransport} from "../src/sources/intuition/graphql.js";

/**
 * Shapes recorded from Intuition mainnet on 2026-10-16, trimmed. IPFS is the fixture because its
 * seven edges happen to demonstrate the whole evidence ladder at once: three free assertions with no
 * stake, one priced at 0.08 TRUST across 8 positions, and a counter side carrying 0.03 across 3.
 */
const IPFS_ATOM = "0x6cf977f2747822000000000000000000000000000000000000000000000000ab";

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
    tool: [{term_id: IPFS_ATOM, label: "IPFS", data: "ipfs://QmNTokkfsx67gpQRbX76EFAmhNEHLCjggZ"}],
    triples: [
        {
            term_id: "0xaaa1",
            subject: {term_id: "0xs1", label: "Infura", type: "Thing"},
            term: side("0", 0),
            counter_term: side("0", 0),
        },
        {
            term_id: "0xaaa2",
            subject: {term_id: "0xs2", label: "Relics by Intuition", type: "Thing"},
            term: side("80000000000000000", 8),
            counter_term: side("30000000000000000", 3),
        },
        {
            term_id: "0xaaa3",
            subject: {term_id: "0xs3", label: "Fleek", type: "Thing"},
            term: side("20000000000000000", 2),
            counter_term: side("0", null),
        },
    ],
};

function transport(data: Record<string, unknown>, seen?: {query: string; variables: unknown}[]) {
    return {
        async request(query: string, variables: Record<string, unknown>) {
            seen?.push({query, variables});
            return data;
        },
    } satisfies GraphqlTransport;
}

describe("getToolUsage", () => {
    it("reads every incoming edge with both sides of its market", async () => {
        const usage = await getToolUsage(IPFS_ATOM, {transport: transport(RECORDED)});
        expect(usage.label).toBe("IPFS");
        expect(usage.pinnedUri).toContain("ipfs://Qm");
        expect(usage.edges).toHaveLength(3);
        expect(usage.edges.map((e) => e.agent.label)).toEqual([
            "Infura",
            "Relics by Intuition",
            "Fleek",
        ]);
        expect(usage.edges[1].support.totalAssets).toBe(80_000_000_000_000_000n);
        expect(usage.edges[1].oppose.totalAssets).toBe(30_000_000_000_000_000n);
    });

    it("sums both sides, and the positions alongside them", async () => {
        const usage = await getToolUsage(IPFS_ATOM, {transport: transport(RECORDED)});
        expect(usage.totals.supportAssets).toBe(100_000_000_000_000_000n);
        expect(usage.totals.opposeAssets).toBe(30_000_000_000_000_000n);
        // Positions are returned beside the amounts, never left to the caller to find. Live example:
        // GitHub shows 22.59 TRUST across 6 positions, of which ONE position is 22.44 — the figure
        // alone would read as a market when it is one person's conviction. ADR 0023.
        expect(usage.totals.supportPositions).toBe(10);
        expect(usage.totals.opposePositions).toBe(3);
    });

    it("keeps a free assertion distinguishable from a priced one", async () => {
        // `docs/14`'s bottom rung: an edge with no stake is not weak evidence, it is none. A caller
        // must be able to tell it apart without arithmetic, so the zero survives as a zero rather
        // than being folded into the total and lost.
        const usage = await getToolUsage(IPFS_ATOM, {transport: transport(RECORDED)});
        const free = usage.edges.filter((e) => (e.support.totalAssets ?? 0n) === 0n);
        expect(free.map((e) => e.agent.label)).toEqual(["Infura"]);
        expect(free[0].support.positionCount).toBe(0);
    });

    it("declares $curveId so the query validates, and passes the shared predicate", async () => {
        // `$curveId: numeric!` — declaring it `String!` is rejected at validation time and takes the
        // whole query down. That bug shipped on 2026-09-16 and a mocked transport could not catch
        // it, so this asserts the declaration text itself rather than only the variable.
        const seen: {query: string; variables: unknown}[] = [];
        await getToolUsage(IPFS_ATOM, {transport: transport(RECORDED, seen)});
        expect(seen[0].query).toContain("$curveId: numeric!");
        expect(seen[0].query).not.toContain("$curveId: String!");
        expect(seen[0].variables).toMatchObject({toolId: IPFS_ATOM, uses: USES, curveId: "1"});
    });

    it("accepts a bigint curveId without the caller converting it", async () => {
        const seen: {query: string; variables: unknown}[] = [];
        await getToolUsage(IPFS_ATOM, {transport: transport(RECORDED, seen), curveId: 4n});
        expect(seen[0].variables).toMatchObject({curveId: "4"});
    });

    it("returns an empty edge list rather than an error for an unused tool", async () => {
        // 84 atoms are the object of a `uses` edge and 64 carry a position, so almost everything is
        // simply not yet used. That is an empty state, not a failure.
        const usage = await getToolUsage(IPFS_ATOM, {
            transport: transport({tool: RECORDED.tool, triples: []}),
        });
        expect(usage.edges).toEqual([]);
        expect(usage.totals.supportAssets).toBe(0n);
        expect(usage.totals.supportPositions).toBe(0);
        expect(usage.label).toBe("IPFS");
    });

    it("survives an atom that is not in the graph at all", async () => {
        const usage = await getToolUsage(IPFS_ATOM, {
            transport: transport({tool: [], triples: []}),
        });
        expect(usage.label).toBeNull();
        expect(usage.pinnedUri).toBeNull();
        expect(usage.edges).toEqual([]);
    });

    it("drops a row with no subject rather than inventing an agent for it", async () => {
        const usage = await getToolUsage(IPFS_ATOM, {
            transport: transport({
                tool: RECORDED.tool,
                triples: [
                    {
                        term_id: "0xbad",
                        subject: null,
                        term: side("1", 1),
                        counter_term: side("0", 0),
                    },
                    RECORDED.triples[1],
                ],
            }),
        });
        expect(usage.edges).toHaveLength(1);
        expect(usage.edges[0].agent.label).toBe("Relics by Intuition");
    });

    it("narrows to one attestor's edges, and says so in the provenance", async () => {
        // ADR 0034: a triple's subject carries no authorisation, so an edge of unknown origin is
        // unusable however readable it is. A deposit is recorded against the depositor's address,
        // so filtering by account is filtering by who stands behind the edge.
        const seen: {query: string; variables: unknown}[] = [];
        const usage = await getToolUsage(IPFS_ATOM, {
            attestedBy: "0x077B59A3751Cd6682534C8203aAb29113876aF01",
            transport: transport(RECORDED, seen),
        });
        expect(seen[0].query).toContain("AttestedToolUsage");
        expect(seen[0].query).toContain("positions: {account_id: {_eq: $attestor}}");
        // Lower-cased: `account_id` is stored lower-case, and a checksummed address matches nothing.
        expect(seen[0].variables).toMatchObject({
            attestor: "0x077b59a3751cd6682534c8203aab29113876af01",
        });
        expect(usage.provenance.note).toContain("attested by 0x077b59a3");
    });

    it("does not send the attestor clause when nobody is named", async () => {
        // The unfiltered read must stay unfiltered: an empty `attestor` variable would match no
        // position and silently return zero edges, which reads identically to an unused tool.
        const seen: {query: string; variables: unknown}[] = [];
        await getToolUsage(IPFS_ATOM, {transport: transport(RECORDED, seen)});
        expect(seen[0].query).not.toContain("AttestedToolUsage");
        expect(seen[0].variables).not.toHaveProperty("attestor");
    });

    it("marks the provenance a claim, not something ARP derived", async () => {
        // Each edge is an assertion somebody wrote; the market only prices it. Calling the totals
        // `derived` would suggest ARP computed the standing rather than read it.
        const usage = await getToolUsage(IPFS_ATOM, {transport: transport(RECORDED)});
        expect(usage.provenance.kind).toBe("claim");
        expect(usage.provenance.origin).toBe(IPFS_ATOM);
        expect(usage.provenance.note).toContain("3 incoming");
    });
});
