import {describe, expect, it} from "vitest";

import {CAPABILITY_PREDICATES, findAgents} from "../src/hire/find.js";
import {HAS_CATEGORY, HAS_TYPE, SAME_AS} from "../src/sources/intuition/terms.js";

type Row = {
    predicate_id: string;
    object: {label: string | null};
    subject: {
        term_id: string;
        label: string | null;
        term: {vaults: {position_count: number; total_assets: string}[]};
    };
};

function agent(
    id: string,
    label: string,
    over: {positions?: number; assets?: string; predicate?: string; matched?: string} = {},
): Row {
    return {
        predicate_id: over.predicate ?? HAS_TYPE,
        object: {label: over.matched ?? "MCP Server"},
        subject: {
            term_id: id,
            label,
            term: {
                vaults: [
                    {
                        position_count: over.positions ?? 0,
                        // The `minShare` every atom is seeded with. The default on purpose: it is
                        // what the real graph returns for an agent nobody has backed.
                        total_assets: over.assets ?? "1000000",
                    },
                ],
            },
        },
    };
}

function stub(rows: Row[], capture?: {variables?: Record<string, unknown>}) {
    return {
        async request(_query: string, variables: Record<string, unknown>) {
            if (capture !== undefined) capture.variables = variables;
            return {triples: rows} as Record<string, unknown>;
        },
    };
}

describe("findAgents", () => {
    it("asks only for agents the graph can prove are agents", async () => {
        const capture: {variables?: Record<string, unknown>} = {};
        await findAgents("defi", {transport: stub([], capture)});
        expect(capture.variables?.["sameAs"]).toBe(SAME_AS);
        expect(capture.variables?.["predicates"]).toEqual(CAPABILITY_PREDICATES);
        expect(capture.variables?.["domain"]).toBe("defi");
    });

    /**
     * The `same as` edge is the only proof on the graph that a subject is a real ERC-8004 agent —
     * there is no flag (`docs/07`, ADR `0015`). Without the filter the list fills with sentences
     * anyone wrote on a shared public predicate, which is the state `listTools` documents.
     */
    it("narrows to one predicate when asked", async () => {
        const capture: {variables?: Record<string, unknown>} = {};
        await findAgents("defi", {transport: stub([], capture), predicates: [HAS_CATEGORY]});
        expect(capture.variables?.["predicates"]).toEqual([HAS_CATEGORY]);
    });

    /**
     * Every atom's vault is seeded with `minShare`, so an unbacked agent reports 1,000,000 wei.
     * Reporting that as an amount puts `<0.00000001 TRUST` beside a real figure — capital that does
     * not exist (ADR `0042`). Observed across the live `MCP Server` candidates on 2026-10-22.
     */
    it("reports dust as no backing, and a real position as an amount", async () => {
        const page = await findAgents("MCP Server", {
            transport: stub([
                agent("0xa1", "Unbacked"),
                agent("0xa2", "Backed", {positions: 1, assets: "5783166937505507778"}),
            ]),
        });
        const [first, second] = page.agents;
        expect(first?.label).toBe("Backed");
        expect(first?.backingAssets).toBe(5_783_166_937_505_507_778n);
        expect(second?.backingAssets).toBeNull();
        expect(second?.backers).toBe(0);
    });

    /**
     * An agent declaring three matching tags returns three rows. Listing it three times would make
     * a candidate's place in the list a function of how verbose it was about itself.
     */
    it("returns one row per agent, however many of its edges matched", async () => {
        const page = await findAgents("defi", {
            transport: stub([
                agent("0xa1", "Chatty", {matched: "defi"}),
                agent("0xa1", "Chatty", {matched: "defi tools", predicate: HAS_CATEGORY}),
                agent("0xA1", "Chatty", {matched: "defi agent"}),
            ]),
        });
        expect(page.agents).toHaveLength(1);
        expect(page.agents[0]?.matched.label).toBe("defi");
    });

    it("says why each candidate is in the list", async () => {
        const page = await findAgents("defi", {
            transport: stub([agent("0xa1", "One", {predicate: HAS_CATEGORY, matched: "defi"})]),
        });
        expect(page.agents[0]?.matched).toEqual({predicateId: HAS_CATEGORY, label: "defi"});
    });

    it("says when the answer is a prefix rather than the whole of it", async () => {
        const rows = Array.from({length: 5}, (_, i) => agent(`0xa${i}`, `A${i}`));
        expect((await findAgents("x", {transport: stub(rows), limit: 5})).truncated).toBe(true);
        expect((await findAgents("x", {transport: stub(rows), limit: 6})).truncated).toBe(false);
    });

    it("refuses an empty search rather than returning the whole graph", async () => {
        await expect(findAgents("   ", {transport: stub([])})).rejects.toThrow(/must not be empty/);
    });

    it("survives a row the indexer returned without a subject", async () => {
        const page = await findAgents("defi", {
            transport: stub([{predicate_id: HAS_TYPE, object: {label: "defi"}} as unknown as Row]),
        });
        expect(page.agents).toEqual([]);
    });
});
