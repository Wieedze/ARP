import {describe, expect, it} from "vitest";
import {INTUITION_URL} from "./helpers.js";

import {getRecentDeclarations, getRecentStakes} from "../src/recent.js";
import {SAME_AS, USES} from "../src/sources/intuition/terms.js";

/** One `uses` edge, shaped the way the indexer returns it. */
function edge(params: {
    id: string;
    at: string;
    subject?: string | null;
    object?: string | null;
    assets?: string;
    positions?: number;
    tx?: string | null;
}) {
    return {
        term_id: params.id,
        created_at: params.at,
        transaction_hash: params.tx === undefined ? `0x${"ab".repeat(32)}` : params.tx,
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
        await getRecentDeclarations({graphqlUrl: INTUITION_URL, transport, limit: 5});

        // The filter is the whole point of this read: without it the newest `uses` edges on
        // mainnet are `Optimism uses …`, `Arbitrum uses …` — prose, not agent declarations. It
        // lives in the query so a caller cannot forget it.
        expect(seen[0]).toMatchObject({uses: USES, sameAs: SAME_AS, limit: 5});
    });

    it("sends `curveId` as a string, because the variable is declared `numeric`", async () => {
        const {seen, transport} = transportOf([]);
        await getRecentDeclarations({graphqlUrl: INTUITION_URL, transport, curveId: 2});

        // Declaring it `String!` is rejected at validation time and takes the whole query down —
        // the bug that broke the trust surface on 2026-09-16.
        expect(seen[0]?.["curveId"]).toBe("2");
    });

    it("reports assets only when a position stands behind the claim", async () => {
        const {transport} = transportOf([
            edge({id: "backed", at: "2026-10-20T10:00:00Z", positions: 1, assets: "5000000"}),
            edge({id: "bare", at: "2026-10-19T10:00:00Z", positions: 0, assets: "1000000"}),
        ]);
        const rows = await getRecentDeclarations({graphqlUrl: INTUITION_URL, transport});

        // Every term is born holding `minShare`, so a non-zero figure is not evidence of a stake.
        // The position count is the test, never the amount (ADR `0042`).
        expect(rows[0]).toMatchObject({tripleId: "backed", assets: 5000000n, positions: 1});
        expect(rows[1]).toMatchObject({tripleId: "bare", assets: null, positions: 0});
    });

    it("carries the transaction that wrote the triple, and null when the indexer has none", async () => {
        const {transport} = transportOf([
            edge({id: "with", at: "2026-10-20T10:00:00Z", tx: `0x${"12".repeat(32)}`}),
            edge({id: "without", at: "2026-10-19T10:00:00Z", tx: null}),
        ]);
        const rows = await getRecentDeclarations({graphqlUrl: INTUITION_URL, transport});
        expect(rows[0]?.txHash).toBe(`0x${"12".repeat(32)}`);
        expect(rows[1]?.txHash).toBeNull();
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
        const rows = await getRecentDeclarations({graphqlUrl: INTUITION_URL, transport});

        // A declaration without a subject, an object or a date is not one anybody can act on, and
        // guessing at the gap would put a half-row on the front page.
        expect(rows).toHaveLength(1);
        expect(rows[0]?.tripleId).toBe("whole");
    });

    it("returns an empty list rather than throwing when nothing qualifies", async () => {
        // Mainnet returns zero and that is the honest answer, not a failure — a caller renders it
        // as "nothing yet" and never falls back to a sample.
        const {transport} = transportOf([]);
        await expect(
            getRecentDeclarations({graphqlUrl: INTUITION_URL, transport}),
        ).resolves.toEqual([]);
    });
});

function stake(params: {at: string; triple?: string | null; tx?: string; assets?: string}) {
    return {
        id: `${params.tx ?? `0x${"cd".repeat(32)}`}-${params.at}`,
        created_at: params.at,
        transaction_hash: params.tx ?? `0x${"cd".repeat(32)}`,
        assets_after_fees: params.assets ?? "990000000000000",
        assets: params.assets ?? "990000000000000",
        sender_id: "0xB86F5f4E338eCEEC5DD095f48acF764465587FCF",
        receiver_id: "0xB86F5f4E338eCEEC5DD095f48acF764465587FCF",
        term: {
            triple:
                params.triple === null
                    ? null
                    : {
                          term_id: params.triple ?? "claim-1",
                          subject: {term_id: "agent-1", label: "Agent 13579:8"},
                          object: {term_id: "tool-1", label: "writing-plans"},
                      },
        },
    };
}

describe("getRecentStakes", () => {
    it("asks with the same agent filter as the declarations", async () => {
        const seen: Record<string, unknown>[] = [];
        await getRecentStakes({
            graphqlUrl: INTUITION_URL,
            transport: {
                async request(_query, variables) {
                    seen.push(variables);
                    return {deposits: [], redemptions: []};
                },
            },
            limit: 7,
        });
        expect(seen[0]).toMatchObject({uses: USES, sameAs: SAME_AS, limit: 7});
    });

    it("asks the indexer to leave out deposits of zero, so the limit counts real ones", async () => {
        let asked = "";
        await getRecentStakes({
            graphqlUrl: INTUITION_URL,
            transport: {
                async request(query) {
                    asked = query;
                    return {deposits: [], redemptions: []};
                },
            },
        });
        expect(asked).toContain('assets_after_fees: {_gt: "0"}');
        // A counter term's `triple` is the claim it opposes: without this, against reads as for.
        expect(asked.match(/type: \{_eq: "Triple"\}/g)).toHaveLength(2);
    });

    it("keys each row on the indexer's event id", async () => {
        const rows = await getRecentStakes({
            graphqlUrl: INTUITION_URL,
            transport: {
                async request() {
                    return {
                        deposits: [{...stake({at: "2026-10-30T13:00:00+00:00"}), id: "0xab-4"}],
                        redemptions: [],
                    };
                },
            },
        });
        expect(rows[0]?.id).toBe("0xab-4");
    });

    it("reads whose position it is apart from who signed it", async () => {
        // A sponsored deposit: the sponsor signs, the operator holds the position (ADR `0094`).
        const rows = await getRecentStakes({
            graphqlUrl: INTUITION_URL,
            transport: {
                async request() {
                    return {
                        deposits: [
                            {
                                ...stake({at: "2026-10-30T13:00:00+00:00"}),
                                sender_id: "0x5905",
                                receiver_id: "0xB86F",
                            },
                        ],
                        redemptions: [],
                    };
                },
            },
        });
        expect(rows[0]).toMatchObject({account: "0x5905", receiver: "0xB86F"});
    });

    it("asks the indexer for the receiver on both lists", async () => {
        let asked = "";
        await getRecentStakes({
            graphqlUrl: INTUITION_URL,
            transport: {
                async request(query) {
                    asked = query;
                    return {deposits: [], redemptions: []};
                },
            },
        });
        expect(asked.match(/receiver_id/g)).toHaveLength(2);
    });

    it("merges deposits and redemptions newest first, each with its own amount field", async () => {
        const rows = await getRecentStakes({
            graphqlUrl: INTUITION_URL,
            transport: {
                async request() {
                    return {
                        deposits: [stake({at: "2026-10-30T13:17:27+00:00", assets: "5"})],
                        redemptions: [stake({at: "2026-10-30T14:00:00+00:00", assets: "3"})],
                    };
                },
            },
        });
        expect(rows.map((row) => [row.kind, row.assets])).toEqual([
            ["redeem", 3n],
            ["deposit", 5n],
        ]);
        expect(rows[1]).toMatchObject({
            tripleId: "claim-1",
            subject: {label: "Agent 13579:8"},
            object: {label: "writing-plans"},
        });
    });

    it("drops a row whose term is not a triple", async () => {
        const rows = await getRecentStakes({
            graphqlUrl: INTUITION_URL,
            transport: {
                async request() {
                    return {
                        deposits: [stake({at: "2026-10-30T13:00:00+00:00", triple: null})],
                        redemptions: [],
                    };
                },
            },
        });
        expect(rows).toEqual([]);
    });
});
