import {describe, expect, it} from "vitest";

import {
    buildTrustPanel,
    evidenceWeight,
    groupCapabilities,
    joinProviderRows,
    readReviewerBasis,
} from "../agent-trust";

import {
    ASTERPAY_TRIPLE,
    assessmentDocument,
    assessmentEdge,
    claimMarket,
    DEEP3_TRIPLE,
    identity,
    notFoundFetch,
    okFetch,
    profile,
    providerEdge,
    richProfile,
    UNVERIFIED,
} from "./trust-fixtures";

describe("readReviewerBasis", () => {
    it("reads the count out of a provider's own method block", () => {
        const basis = readReviewerBasis({
            method: {numReviewers: 26, comparativeReviewers: 6, nonComparativeReviewers: 20},
        });
        expect(basis).toEqual({
            kind: "reviewers",
            total: 26,
            comparative: 6,
            nonComparative: 20,
        });
    });

    it("reports a document with no method block as not-published, never as zero", () => {
        expect(readReviewerBasis({assessment: {score: 59}})).toEqual({kind: "not-published"});
        expect(readReviewerBasis(null)).toEqual({kind: "not-published"});
        expect(readReviewerBasis("nonsense")).toEqual({kind: "not-published"});
    });

    it("rejects counts that are not finite non-negative numbers", () => {
        expect(readReviewerBasis({method: {numReviewers: -3}})).toEqual({kind: "not-published"});
        expect(readReviewerBasis({method: {numReviewers: "26"}})).toEqual({
            kind: "not-published",
        });
        expect(readReviewerBasis({method: {numReviewers: Number.NaN}})).toEqual({
            kind: "not-published",
        });
    });

    it("keeps the sub-counts optional", () => {
        expect(readReviewerBasis({method: {numReviewers: 2}})).toEqual({
            kind: "reviewers",
            total: 2,
            comparative: null,
            nonComparative: null,
        });
    });
});

describe("evidenceWeight", () => {
    it("separates a score with no published basis from one with zero reviewers", () => {
        expect(evidenceWeight({kind: "not-published"})).toBe("unknown");
        expect(
            evidenceWeight({kind: "reviewers", total: 0, comparative: null, nonComparative: null}),
        ).toBe("none");
    });

    it("bands the live fixtures apart", () => {
        const at = (total: number) =>
            evidenceWeight({kind: "reviewers", total, comparative: null, nonComparative: null});
        expect(at(1)).toBe("single");
        expect(at(2)).toBe("thin");
        expect(at(9)).toBe("thin");
        expect(at(10)).toBe("moderate");
        expect(at(26)).toBe("moderate");
        expect(at(100)).toBe("substantial");
        expect(at(1445)).toBe("deep");
    });
});

describe("joinProviderRows", () => {
    it("pairs each provider edge with the assessment its document names", () => {
        const source = richProfile();
        const rows = joinProviderRows(source.assessments, source.markets);

        expect(rows).toHaveLength(2);
        expect(rows.map((row) => row.providerName)).toEqual(["Deep3 Labs", "AsterPay KYA"]);
        expect(rows.map((row) => row.providerMatch)).toEqual(["document", "document"]);
        expect(rows[0].score).toBe(55.35);
        expect(rows[0].weight).toBe("moderate");
        expect(rows[1].weight).toBe("unknown");
    });

    it("carries the triple id and market of the has-trust-provider edge", () => {
        const source = richProfile();
        const rows = joinProviderRows(source.assessments, source.markets);

        expect(rows[0].tripleId).toBe(DEEP3_TRIPLE);
        expect(rows[0].market?.claimHandle).toBe(DEEP3_TRIPLE);
        expect(rows[1].tripleId).toBe(ASTERPAY_TRIPLE);
        expect(rows[1].market?.support.positionCount).toBe(2);
    });

    it("never reports the provider homepage fetch as the document's failure", () => {
        const source = richProfile();
        const rows = joinProviderRows(source.assessments, source.markets);

        // Both provider edges "failed" to fetch — they point at a homepage, not
        // a document. Only the assessment edge's fetch is the document's.
        expect(rows[0].documentError).toBeNull();
        expect(rows[0].documentUrl).toBe("https://api.example/assessment.json");
    });

    it("falls back to the label prefix when the document cannot be read", () => {
        const market = claimMarket(ASTERPAY_TRIPLE);
        const rows = joinProviderRows(
            [
                providerEdge({
                    handle: ASTERPAY_TRIPLE,
                    providerName: "AsterPay KYA",
                    market,
                }),
                assessmentEdge({
                    handle: `${ASTERPAY_TRIPLE}-doc`,
                    providerName: "AsterPay KYA",
                    fetch: notFoundFetch("https://api.asterpay.example/assessment.json"),
                }),
            ],
            [market],
        );

        expect(rows).toHaveLength(1);
        expect(rows[0].providerMatch).toBe("label-prefix");
        expect(rows[0].documentError).toEqual({
            kind: "http",
            status: 404,
            statusText: "Not Found",
        });
        expect(rows[0].score).toBeNull();
        expect(rows[0].reviewers).toEqual({kind: "not-published"});
        // The market survives an unreachable document — the claim is still priced.
        expect(rows[0].market?.claimHandle).toBe(ASTERPAY_TRIPLE);
    });

    it("renders a provider edge with no assessment edge behind it", () => {
        const market = claimMarket(DEEP3_TRIPLE);
        const rows = joinProviderRows(
            [providerEdge({handle: DEEP3_TRIPLE, providerName: "Deep3 Labs", market})],
            [market],
        );

        expect(rows).toHaveLength(1);
        expect(rows[0].assessment).toBeNull();
        expect(rows[0].providerMatch).toBe("none");
        expect(rows[0].tripleId).toBe(DEEP3_TRIPLE);
    });

    it("keeps an orphan assessment with no triple to stake on", () => {
        const rows = joinProviderRows(
            [
                assessmentEdge({
                    handle: "0xorphan",
                    providerName: "Nobody",
                    fetch: okFetch(
                        "https://api.example/a.json",
                        assessmentDocument({
                            providerName: "Nobody",
                            providerId: "nobody",
                            score: 10,
                            numReviewers: 1,
                        }),
                    ),
                    signature: UNVERIFIED,
                }),
            ],
            [],
        );

        expect(rows).toHaveLength(1);
        expect(rows[0].tripleId).toBeNull();
        expect(rows[0].market).toBeNull();
        expect(rows[0].weight).toBe("single");
    });

    it("refuses a source handle that is not a 32-byte term id", () => {
        // `sourceHandle` is source-scoped: the registry source emits
        // `chainId:registry:tokenId`, which is not a vault key. Asserting it into
        // `Hex` would hand a malformed `bytes32` to `deposit`, which reverts with
        // no message.
        const rows = joinProviderRows(
            [
                providerEdge({
                    handle: "8453:0x8004A169FB4a3325136EB29fA0ceB6D2e539a432:2340",
                    providerName: "Some source",
                    market: null,
                }),
            ],
            [],
        );

        expect(rows).toHaveLength(1);
        expect(rows[0].providerClaim).not.toBeNull();
        expect(rows[0].tripleId).toBeNull();
    });

    it("returns nothing when no provider has written an edge", () => {
        expect(joinProviderRows([], [])).toEqual([]);
    });
});

describe("groupCapabilities", () => {
    it("merges every source and de-duplicates by handle", () => {
        const groups = groupCapabilities(
            profile({
                capabilities: [
                    {
                        types: [
                            {
                                relation: "has-type",
                                label: "AIAgent",
                                name: "AIAgent",
                                url: null,
                                sourceHandle: "0xtype",
                            },
                        ],
                        protocols: [
                            {
                                relation: "uses",
                                label: "MCP",
                                name: "MCP",
                                url: null,
                                sourceHandle: "0xmcp",
                            },
                        ],
                        chains: [],
                        tags: [],
                        categories: [],
                        provenance: {sourceId: "intuition", kind: "claim", origin: null},
                    },
                    {
                        types: [
                            {
                                relation: "has-type",
                                label: "AIAgent",
                                name: "AIAgent",
                                url: null,
                                sourceHandle: "0xtype",
                            },
                        ],
                        protocols: [],
                        chains: [],
                        tags: [],
                        categories: [],
                        provenance: {sourceId: "other", kind: "claim", origin: null},
                    },
                ],
            }),
        );

        expect(groups.map((group) => group.relation)).toEqual(["uses", "has-type"]);
        expect(groups.find((group) => group.relation === "has-type")?.entries).toHaveLength(1);
    });
});

describe("buildTrustPanel", () => {
    it("assembles the rich case", () => {
        const view = buildTrustPanel(richProfile());

        expect(view.found).toBe(true);
        expect(view.name).toBe("Clawnch");
        expect(view.isFallbackMetadata).toBe(false);
        expect(view.rows).toHaveLength(2);
        expect(view.capabilityCount).toBe(0);
        expect(view.marketCapableSources).toEqual(["intuition"]);
    });

    it("reports a missing agent as not found rather than as a failure", () => {
        const view = buildTrustPanel(profile({identity: null, identities: []}));

        expect(view.found).toBe(false);
        expect(view.name).toBeNull();
        expect(view.rows).toEqual([]);
        expect(view.atomTermId).toBeNull();
    });

    it("keeps the indexer's stand-in metadata flagged as a stand-in", () => {
        const fallback = identity({
            metadata: {
                name: "Agent 8453:6649",
                description: "ERC-8004 agent 8453:6649",
                image: null,
                url: "https://8004scan.io/agent/8453/6649",
                isFallback: true,
            },
        });
        const view = buildTrustPanel(profile({identity: fallback, identities: [fallback]}));

        expect(view.isFallbackMetadata).toBe(true);
        expect(view.name).toBe("Agent 8453:6649");
    });

    it("takes owner and registration file from whichever source answered", () => {
        const graph = identity();
        const registry = identity({
            sourceHandle: null,
            owner: "0x729a121c347cd89C14f5FF9CD289cA8c70B1de1d",
            registrationFile: "data:application/json;base64,e30=",
            metadata: {name: null, description: null, image: null, url: null, isFallback: false},
            provenance: {sourceId: "erc8004-registry", kind: "claim", origin: "chain"},
        });
        const view = buildTrustPanel(profile({identity: graph, identities: [graph, registry]}));

        expect(view.owner).toBe("0x729a121c347cd89C14f5FF9CD289cA8c70B1de1d");
        expect(view.registrationFile).toBe("data:application/json;base64,e30=");
        // Identity fields still come from the first source that resolved one.
        expect(view.atomTermId).toBe(graph.sourceHandle);
    });

    it("passes source failures through instead of swallowing them", () => {
        const view = buildTrustPanel(
            profile({
                sourceErrors: [
                    {
                        sourceId: "erc8004-registry",
                        step: "resolveAgent",
                        message: "HTTP request failed",
                    },
                ],
            }),
        );

        expect(view.sourceErrors).toHaveLength(1);
        expect(view.found).toBe(true);
    });
});
