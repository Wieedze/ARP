import {describe, expect, it} from "vitest";

import {
    AGENT_TAB_SLUG,
    ARP_TAB_SLUG,
    buildPanelTabs,
    buildTrustPanel,
    evidenceWeight,
    groupCapabilities,
    joinProviderRows,
    readReviewerBasis,
    selectPanelTab,
    shouldUseTabs,
    type PanelTab,
    type PanelTabs,
} from "../agent-trust";

import {
    ASTERPAY_TRIPLE,
    assessmentDocument,
    assessmentEdge,
    claimMarket,
    DEEP3_TRIPLE,
    identity,
    MISMATCH,
    notFoundFetch,
    okFetch,
    profile,
    providerEdge,
    richProfile,
    UNVERIFIED,
    VERIFIED,
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

describe("shouldUseTabs", () => {
    it("takes two providers before a strip earns its place", () => {
        const rows = joinProviderRows(richProfile().assessments, richProfile().markets);
        expect(shouldUseTabs(rows)).toBe(true);
        expect(shouldUseTabs(rows.slice(0, 1))).toBe(false);
        expect(shouldUseTabs([])).toBe(false);
    });
});

describe("buildPanelTabs", () => {
    function tabsFor(profileValue = richProfile()) {
        return buildPanelTabs(joinProviderRows(profileValue.assessments, profileValue.markets));
    }

    /** The provider tabs in strip order, without pinning where they start. */
    function providerTabs(model: PanelTabs) {
        return model.tabs.filter(
            (tab): tab is Extract<PanelTab, {kind: "provider"}> => tab.kind === "provider",
        );
    }

    it("opens one tab per provider, then ARP, then the agent", () => {
        const model = tabsFor();

        expect(model.tabs.map((tab) => tab.slug)).toEqual([
            "deep3-labs",
            "asterpay-kya",
            ARP_TAB_SLUG,
            AGENT_TAB_SLUG,
        ]);
        expect(model.tabs.map((tab) => tab.kind)).toEqual(["provider", "provider", "arp", "agent"]);
        expect(model.tabs.map((tab) => tab.label)).toEqual([
            "Deep3 Labs",
            "AsterPay KYA",
            "ARP",
            "Agent",
        ]);
    });

    it("summarises each provider by its signature verdict, never by score", () => {
        const model = tabsFor();
        const [deep3, asterpay] = providerTabs(model);

        // The whole point of the strip: one provider signs its document and the
        // other does not, and that is legible from either tab without the
        // scores being repeated up here.
        expect(deep3.summary).toEqual({signature: {status: "verified", label: "verified"}});
        expect(asterpay.summary).toEqual({
            signature: {status: "unverified", label: "not verified"},
        });
        expect(deep3.summary).not.toHaveProperty("score");
    });

    it("relays a mismatch as a mismatch and never upgrades an unverified", () => {
        const market = claimMarket(DEEP3_TRIPLE);
        const model = buildPanelTabs(
            joinProviderRows(
                [
                    providerEdge({handle: DEEP3_TRIPLE, providerName: "Deep3 Labs", market}),
                    assessmentEdge({
                        handle: `${DEEP3_TRIPLE}-doc`,
                        providerName: "Deep3 Labs",
                        fetch: okFetch(
                            "https://api.deep3.example/assessment.json",
                            assessmentDocument({
                                providerName: "Deep3 Labs",
                                providerId: "deep3-labs",
                                score: 55.35,
                                numReviewers: 26,
                            }),
                        ),
                        signature: MISMATCH,
                    }),
                ],
                [market],
            ),
        );

        expect(providerTabs(model)[0].summary.signature).toEqual({
            status: "mismatch",
            label: "mismatch",
        });
    });

    it("calls a provider edge with no assessment absent, not unverified", () => {
        const market = claimMarket(DEEP3_TRIPLE);
        const model = buildPanelTabs(
            joinProviderRows(
                [providerEdge({handle: DEEP3_TRIPLE, providerName: "Deep3 Labs", market})],
                [market],
            ),
        );

        expect(providerTabs(model)[0].summary.signature).toEqual({
            status: "absent",
            label: "no document",
        });
    });

    it("opens on the best-evidenced provider, not the highest score", () => {
        const thin = claimMarket(ASTERPAY_TRIPLE);
        const deep = claimMarket(DEEP3_TRIPLE);
        const model = buildPanelTabs(
            joinProviderRows(
                [
                    providerEdge({
                        handle: ASTERPAY_TRIPLE,
                        providerName: "Loud Scores",
                        market: thin,
                    }),
                    assessmentEdge({
                        handle: `${ASTERPAY_TRIPLE}-doc`,
                        providerName: "Loud Scores",
                        fetch: okFetch(
                            "https://api.example/loud.json",
                            assessmentDocument({
                                providerName: "Loud Scores",
                                providerId: "loud",
                                score: 99,
                                numReviewers: 2,
                            }),
                        ),
                        signature: UNVERIFIED,
                    }),
                    providerEdge({handle: DEEP3_TRIPLE, providerName: "Deep3 Labs", market: deep}),
                    assessmentEdge({
                        handle: `${DEEP3_TRIPLE}-doc`,
                        providerName: "Deep3 Labs",
                        fetch: okFetch(
                            "https://api.deep3.example/assessment.json",
                            assessmentDocument({
                                providerName: "Deep3 Labs",
                                providerId: "deep3-labs",
                                score: 41,
                                numReviewers: 1445,
                            }),
                        ),
                        signature: VERIFIED,
                    }),
                ],
                [thin, deep],
            ),
        );

        expect(model.defaultSlug).toBe("deep3-labs");
    });

    it("opens on the agent when no provider publishes a reviewer count", () => {
        const market = claimMarket(ASTERPAY_TRIPLE);
        const model = buildPanelTabs(
            joinProviderRows(
                [
                    providerEdge({
                        handle: ASTERPAY_TRIPLE,
                        providerName: "AsterPay KYA",
                        market,
                    }),
                    assessmentEdge({
                        handle: `${ASTERPAY_TRIPLE}-doc`,
                        providerName: "AsterPay KYA",
                        fetch: okFetch(
                            "https://api.asterpay.example/assessment.json",
                            assessmentDocument({
                                providerName: "AsterPay KYA",
                                providerId: "asterpay-kya",
                                score: 66,
                            }),
                        ),
                    }),
                ],
                [market],
            ),
        );

        expect(model.defaultSlug).toBe(AGENT_TAB_SLUG);
    });

    it("keeps every slug distinct, including against the reserved two", () => {
        const model = buildPanelTabs(
            joinProviderRows(
                [
                    providerEdge({handle: DEEP3_TRIPLE, providerName: "Agent", market: null}),
                    providerEdge({handle: ASTERPAY_TRIPLE, providerName: "ARP", market: null}),
                    providerEdge({handle: "0xthird", providerName: "Agent", market: null}),
                    providerEdge({handle: "0xfourth", providerName: "!!!", market: null}),
                ],
                [],
            ),
        );

        const slugs = model.tabs.map((tab) => tab.slug);
        expect(new Set(slugs).size).toBe(slugs.length);
        expect(slugs).toEqual([
            "agent-2",
            "arp-2",
            "agent-3",
            "provider-4",
            ARP_TAB_SLUG,
            AGENT_TAB_SLUG,
        ]);
    });
});

describe("selectPanelTab", () => {
    it("honours the tab the URL names", () => {
        const model = buildPanelTabs(
            joinProviderRows(richProfile().assessments, richProfile().markets),
        );

        expect(selectPanelTab(model, "asterpay-kya").slug).toBe("asterpay-kya");
        expect(selectPanelTab(model, ARP_TAB_SLUG).kind).toBe("arp");
        expect(selectPanelTab(model, AGENT_TAB_SLUG).kind).toBe("agent");
    });

    it("falls back silently when the URL names nothing this agent has", () => {
        const model = buildPanelTabs(
            joinProviderRows(richProfile().assessments, richProfile().markets),
        );

        // A shared link to a provider that has since stopped writing edges is a
        // stale link, not an error page.
        expect(selectPanelTab(model, "some-departed-provider").slug).toBe(model.defaultSlug);
        expect(selectPanelTab(model, null).slug).toBe(model.defaultSlug);
        expect(selectPanelTab(model, "").slug).toBe(model.defaultSlug);
    });
});
