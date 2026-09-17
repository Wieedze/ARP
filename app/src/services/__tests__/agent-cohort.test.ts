import {describe, expect, it} from "vitest";
import {HttpError, ListAgentsFailedError, NoListingSourceError} from "@arp-protocol/erc8004";
import type {AgentListing, AgentPage} from "@arp-protocol/erc8004";

import {
    buildCohortView,
    COHORT_ORDERS,
    describeCohortFailure,
    orderLabel,
    toCohortRow,
} from "../agent-cohort";

const REGISTRY = "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432" as const;

function listing(overrides: Partial<AgentListing> = {}): AgentListing {
    return {
        sourceHandle: "0xatom",
        ref: {chainId: 8453, tokenId: "1380", registry: REGISTRY},
        identities: [{chainId: 8453, tokenId: "1380", registry: REGISTRY}],
        identityEdgeCount: 1,
        isIdentityAmbiguous: false,
        metadata: {
            name: "Captain Dackie",
            description: null,
            image: "https://blob.example/dackie.jpg",
            url: null,
            isFallback: false,
        },
        statementCount: 41,
        market: {totalMarketCap: 6_336_930_209_822_752_561n, positionCount: 1, vaultCount: 2},
        provenance: {sourceId: "intuition", kind: "claim", origin: "0xatom"},
        ...overrides,
    };
}

function page(overrides: Partial<AgentPage> = {}): AgentPage {
    return {
        sourceId: "intuition",
        order: "evidence-quantity",
        limit: 25,
        offset: 0,
        total: 28_648,
        agents: Array.from({length: 25}, () => listing()),
        ...overrides,
    };
}

describe("COHORT_ORDERS", () => {
    it("offers exactly the two orders that measure what something cost", () => {
        expect(COHORT_ORDERS.map((entry) => entry.id)).toEqual([
            "evidence-quantity",
            "economic-conviction",
        ]);
    });

    it("labels what is counted rather than implying quality", () => {
        // "Most statements" is a count. "Top agents" would be a claim about
        // quality that nothing on this page is entitled to make.
        for (const entry of COHORT_ORDERS) {
            expect(entry.label).not.toMatch(/best|top|rank|score|trust(ed|worthy)/i);
            expect(entry.note.length).toBeGreaterThan(40);
        }
    });
});

describe("toCohortRow", () => {
    it("links by the identity from the same-as edge", () => {
        const row = toCohortRow(listing(), 0);
        expect(row.href).toBe("/agent/8453/1380");
        expect(row.identity).toBe("1380 · Base 8453");
        expect(row.identityProblem).toBeNull();
    });

    it("shows the market cap with its position count beside it, always", () => {
        const row = toCohortRow(listing(), 0);
        expect(row.marketCap).toBe("6.3369302 TRUST");
        expect(row.positions).toBe("1 position · 2 curves");
    });

    it("says the position count is missing rather than printing a bare cap", () => {
        const row = toCohortRow(
            listing({
                market: {totalMarketCap: 1_000_000n, positionCount: null, vaultCount: 1},
            }),
            0,
        );
        expect(row.marketCap).toBe("<0.00000001 TRUST");
        expect(row.positions).toBe("position count not reported");
    });

    it("distinguishes no market data from a market of zero", () => {
        expect(toCohortRow(listing({market: null}), 0)).toMatchObject({
            marketCap: null,
            positions: "no market data",
        });
        expect(
            toCohortRow(
                listing({
                    market: {totalMarketCap: 0n, positionCount: 0, vaultCount: 1},
                }),
                0,
            ),
        ).toMatchObject({marketCap: "0 TRUST", positions: "0 positions · 1 curve"});
    });

    it("marks the indexer's stand-in metadata as a fallback", () => {
        const row = toCohortRow(
            listing({
                metadata: {
                    name: "Agent 8453:6649",
                    description: null,
                    image: "",
                    url: null,
                    isFallback: true,
                },
            }),
            0,
        );
        expect(row.isFallbackMetadata).toBe(true);
        expect(row.name).toBe("Agent 8453:6649");
    });

    it("treats an empty image string as no image, not as a broken one", () => {
        // The graph stores "" for an agent with no image, and <img src=""> is a
        // request for the page itself.
        expect(
            toCohortRow(listing({metadata: {...listing().metadata, image: ""}}), 0).imageUrl,
        ).toBe(null);
        expect(
            toCohortRow(listing({metadata: {...listing().metadata, image: "   "}}), 0).imageUrl,
        ).toBe(null);
        expect(toCohortRow(listing(), 0).imageUrl).toBe("https://blob.example/dackie.jpg");
    });

    it("refuses to link an atom that claims several identities, and says why", () => {
        const row = toCohortRow(
            listing({
                ref: null,
                isIdentityAmbiguous: true,
                identityEdgeCount: 16,
                metadata: {...listing().metadata, name: "Ouro Proof-of-Compute Oracle"},
            }),
            0,
        );
        expect(row.href).toBeNull();
        expect(row.identityProblem).toBe("claims 16 identities — no single agent to open");
    });

    it("says when an agent has no ERC-8004 identity edge at all", () => {
        const row = toCohortRow(
            listing({ref: null, identities: [], identityEdgeCount: 0, isIdentityAmbiguous: false}),
            0,
        );
        expect(row.href).toBeNull();
        expect(row.identityProblem).toBe("no ERC-8004 identity edge in the graph");
    });

    it("never derives a token id from the display name", () => {
        // The name reads `Agent 8453:6649`; the edge says 42. The edge wins.
        const row = toCohortRow(
            listing({
                ref: {chainId: 8453, tokenId: "42", registry: REGISTRY},
                metadata: {
                    name: "Agent 8453:6649",
                    description: null,
                    image: null,
                    url: null,
                    isFallback: true,
                },
            }),
            0,
        );
        expect(row.href).toBe("/agent/8453/42");
    });
});

describe("buildCohortView", () => {
    it("carries the graph's own total rather than the page length", () => {
        const view = buildCohortView(page());
        expect(view.total).toBe(28_648);
        expect(view.rows).toHaveLength(25);
        expect(view.rangeLabel).toBe("1–25 of 28,648");
        expect(view.hasPrevious).toBe(false);
        expect(view.hasNext).toBe(true);
    });

    it("numbers a deep page from its offset", () => {
        const view = buildCohortView(page({offset: 20_000}));
        expect(view.rangeLabel).toBe("20,001–20,025 of 28,648");
        expect(view.hasPrevious).toBe(true);
    });

    it("stops paging on a short page, whatever the total claims", () => {
        const view = buildCohortView(
            page({offset: 28_640, agents: Array.from({length: 8}, () => listing())}),
        );
        expect(view.rangeLabel).toBe("28,641–28,648 of 28,648");
        expect(view.hasNext).toBe(false);
    });

    it("still offers a next page, and no total, when the source reported none", () => {
        const view = buildCohortView(page({total: null}));
        expect(view.hasNext).toBe(true);
        expect(view.rangeLabel).toBe("1–25");
    });

    it("says an empty page is empty rather than counting rows it does not have", () => {
        // `0–40,000 of 28,648` is what a range computed from the offset alone
        // prints here, and it is nonsense on its face.
        const view = buildCohortView(page({offset: 40_000, agents: []}));
        expect(view.rows).toEqual([]);
        expect(view.rangeLabel).toBe("no agents on this page");
        expect(view.hasNext).toBe(false);
    });

    it("keeps the rows in the order the source produced them", () => {
        const first = listing({sourceHandle: "0xa", statementCount: 41});
        const second = listing({sourceHandle: "0xb", statementCount: 5});
        const third = listing({sourceHandle: "0xc", statementCount: 30});
        const view = buildCohortView(page({agents: [first, second, third]}));
        // Not 41, 30, 5 — this page is a window onto an order decided over the
        // whole cohort, and sorting it here would be a claim about the cohort.
        expect(view.rows.map((row) => row.statementCount)).toEqual([41, 5, 30]);
    });
});

describe("describeCohortFailure", () => {
    /**
     * Built through the package's own constructor with a real cause, so
     * `timedOut` is computed the way production computes it. Handing the
     * constructor a hand-set flag would assert the flag into existence and
     * prove nothing about the path that sets it.
     */
    const refusal = () =>
        new ListAgentsFailedError(
            [{sourceId: "intuition", step: "listAgents", message: "HTTP 503 Down"}],
            [new Error("HTTP 503 Down")],
        );

    const deadline = () =>
        new ListAgentsFailedError(
            [{sourceId: "intuition", step: "listAgents", message: "timed out after 30000ms"}],
            [new HttpError("timeout", "timed out after 30000ms", 30_000)],
        );

    it("says the indexer ran out of time, and offers the other order", () => {
        const failure = describeCohortFailure(deadline(), "economic-conviction");
        expect(deadline().timedOut).toBe(true);

        expect(failure.headline).toBe("The indexer did not answer in time");
        expect(failure.alternateOrder).toBe("evidence-quantity");
        expect(failure.canRetry).toBe(true);
        // It must not sell the other order as the faster one — the latency swing
        // is the endpoint's and hits both orders alike.
        expect(failure.detail).toContain("fresh read rather than a faster one");
    });

    it("does not offer the other order when the endpoint answered and said no", () => {
        // A GraphQL or HTTP error gets the same answer on either order, so
        // suggesting a switch would be a false remedy.
        expect(refusal().timedOut).toBe(false);
        const failure = describeCohortFailure(refusal(), "evidence-quantity");
        expect(failure.headline).toBe("The cohort could not be read");
        expect(failure.alternateOrder).toBeNull();
        expect(failure.canRetry).toBe(true);
    });

    it("says plainly when nothing configured can enumerate agents", () => {
        const failure = describeCohortFailure(
            new NoListingSourceError(["erc8004-registry"]),
            "evidence-quantity",
        );
        expect(failure.headline).toBe("Nothing configured here can list agents");
        expect(failure.canRetry).toBe(false);
        expect(failure.alternateOrder).toBeNull();
        expect(failure.detail).toContain("lookup form");
    });

    it("never lets a failure read as an empty cohort", () => {
        for (const error of [
            refusal(),
            deadline(),
            new NoListingSourceError([]),
            new Error("boom"),
        ]) {
            const failure = describeCohortFailure(error, "evidence-quantity");
            expect(failure.headline.length).toBeGreaterThan(0);
            expect(failure.detail.length).toBeGreaterThan(40);
            expect(failure.headline).not.toMatch(/no agents|empty/i);
        }
    });

    it("names an order the way the control names it", () => {
        expect(orderLabel("evidence-quantity")).toBe("Most statements");
        expect(orderLabel("economic-conviction")).toBe("Most staked");
    });
});
