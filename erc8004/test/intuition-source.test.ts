import {describe, expect, it} from "vitest";

import {resolveRef} from "../src/caip.js";
import {isRecord} from "../src/json.js";
import {intuitionSource} from "../src/sources/intuition/index.js";
import {
    CAPABILITIES_QUERY,
    RESOLVE_AGENT_QUERY,
    TRUST_SURFACE_QUERY,
} from "../src/sources/intuition/queries.js";
import {
    CAPABILITY_PREDICATE_IDS,
    HAS_TRUST_ASSESSMENT,
    HAS_TRUST_PROVIDER,
    SAME_AS,
    TRUST_PREDICATE_IDS,
} from "../src/sources/intuition/terms.js";
import {fixtureFetch, INTUITION_URL} from "./helpers.js";

const source = () => intuitionSource({fetch: fixtureFetch(), graphqlUrl: INTUITION_URL});

const CLAWNCH = resolveRef({chainId: 8453, tokenId: "2340"});
const BARE = resolveRef({chainId: 8453, tokenId: "6649"});
const DACKIE = resolveRef({chainId: 8453, tokenId: "1380"});
const ABSENT = resolveRef({chainId: 8453, tokenId: "999999999"});

describe("intuitionSource.resolveAgent — preflight", () => {
    it("resolves an indexed agent through the canonical same-as edge", async () => {
        const identity = await source().resolveAgent(CLAWNCH);
        expect(identity?.sourceHandle).toBe(
            "0x20dd3a62fee16233e1747a597291dd8faa10a1eb6783afe2bc52eab62df89028",
        );
        expect(identity?.caip19).toBe(
            "eip155:8453/erc721:0x8004A169FB4a3325136EB29fA0ceB6D2e539a432/2340",
        );
        expect(identity?.metadata.url).toBe("https://clawn.ch");
        expect(identity?.metadata.isFallback).toBe(false);
        expect(identity?.provenance.sourceId).toBe("intuition");
    });

    it("returns null — not an error — for an identity that is not in the graph", async () => {
        await expect(source().resolveAgent(ABSENT)).resolves.toBeNull();
    });

    it("marks indexer-synthesised metadata as a fallback", async () => {
        const identity = await source().resolveAgent(BARE);
        expect(identity?.metadata.name).toBe("Agent 8453:6649");
        expect(identity?.metadata.isFallback).toBe(true);
    });

    it("filters on the canonical same-as term id", async () => {
        const bodies: string[] = [];
        const recording = intuitionSource({
            graphqlUrl: INTUITION_URL,
            fetch: async (input, init) => {
                bodies.push(String(init?.body ?? ""));
                return fixtureFetch()(input, init);
            },
        });
        await recording.resolveAgent(CLAWNCH);
        expect(bodies[0]).toContain(SAME_AS);
    });
});

describe("intuitionSource — no predicate is ever resolved by label", () => {
    // `label` is fine as a selected field. What is forbidden is `label: {...}` in
    // a `where` clause: on mainnet `use`, `implement`, `has tag` and `Base` each
    // resolve to several atoms, so a label filter silently reads a different
    // graph than the one the ecosystem writes to.
    const LABEL_FILTER = /label\s*:\s*\{/;

    for (const [name, query] of Object.entries({
        RESOLVE_AGENT_QUERY,
        TRUST_SURFACE_QUERY,
        CAPABILITIES_QUERY,
    })) {
        it(`${name} filters by id, not by label`, () => {
            expect(LABEL_FILTER.test(query)).toBe(false);
            expect(query).toContain("predicate_id");
        });
    }

    it("sends only frozen term ids as predicate filters", async () => {
        const bodies: string[] = [];
        const recording = intuitionSource({
            graphqlUrl: INTUITION_URL,
            fetch: async (input, init) => {
                bodies.push(String(init?.body ?? ""));
                return fixtureFetch()(input, init);
            },
        });
        await recording.getCapabilities(CLAWNCH);
        await recording.getAssessments(CLAWNCH);

        const known = new Set<string>([...TRUST_PREDICATE_IDS, ...CAPABILITY_PREDICATE_IDS]);
        for (const body of bodies) {
            const parsed: unknown = JSON.parse(body);
            const variables = isRecord(parsed) ? parsed["variables"] : null;
            const ids = isRecord(variables) ? variables["predicateIds"] : null;
            if (!Array.isArray(ids)) continue;
            for (const id of ids) {
                expect(known.has(String(id))).toBe(true);
            }
        }
    });
});

describe("intuitionSource.getAssessments — the trust surface", () => {
    it("reads the resolver URL from value.thing.url and never from data", async () => {
        const claims = await source().getAssessments(CLAWNCH);
        const deep3 = claims.find((claim) => claim.provider.name?.startsWith("Deep3 Labs"));
        expect(deep3?.resolverUrl).toBe(
            "https://api.deep3.ai/.well-known/intuition/erc8004/agents/8453/2340/erc8004-feedback-trust-assessment.json",
        );
        // `data` is the atom's pinned snapshot. It is carried separately and must
        // never leak into resolverUrl: fetching it would serve a frozen document
        // as the live assessment.
        expect(deep3?.pinnedUri).toBe(
            "ipfs://bafkreiaii5ugpovqbow6satvuik2rgy6zplx54sufnvpys2y26f5t7ym6q",
        );
        for (const claim of claims) {
            expect(claim.resolverUrl?.startsWith("ipfs://")).not.toBe(true);
            expect(claim.resolverUrl).not.toBe(claim.pinnedUri);
        }
    });

    it("returns both providers on a multi-provider agent", async () => {
        const claims = await source().getAssessments(DACKIE);
        const assessments = claims.filter((claim) => claim.relation === "has-trust-assessment");
        const providers = claims.filter((claim) => claim.relation === "has-trust-provider");
        expect(assessments).toHaveLength(2);
        expect(providers).toHaveLength(2);
        expect(providers.map((claim) => claim.provider.name).sort()).toEqual([
            "AsterPay KYA",
            "Deep3 Labs",
        ]);
    });

    it("preserves the market-cap ordering the query asked for", async () => {
        const claims = await source().getAssessments(CLAWNCH);
        expect(claims.map((claim) => claim.provider.name)).toEqual([
            "AsterPay KYA — Clawnch trust assessment",
            "AsterPay KYA",
            "Deep3 Labs — 🦞 Clawnch 🦞 assessment",
            "Deep3 Labs",
        ]);
    });

    it("returns a single provider on the bare agent", async () => {
        const claims = await source().getAssessments(BARE);
        expect(claims).toHaveLength(2);
        expect(new Set(claims.map((claim) => claim.relation))).toEqual(
            new Set(["has-trust-provider", "has-trust-assessment"]),
        );
    });

    it("returns nothing for an agent the graph does not know", async () => {
        await expect(source().getAssessments(ABSENT)).resolves.toEqual([]);
    });

    it("filters on both trust predicate ids", async () => {
        expect(TRUST_PREDICATE_IDS).toEqual([HAS_TRUST_PROVIDER, HAS_TRUST_ASSESSMENT]);
    });
});

describe("intuitionSource.getMarkets", () => {
    it("reads both the support side and the opposition side", async () => {
        const markets = await source().getMarkets?.(CLAWNCH);
        expect(markets).toBeDefined();
        if (markets === undefined) return;
        expect(markets).toHaveLength(4);

        const deep3 = markets.find((market) => market.label?.startsWith("Deep3 Labs —"));
        expect(deep3?.support.totalAssets).toBe(987500001000000n);
        expect(deep3?.support.positionCount).toBe(1);
        // counter_term is a separate vault and is never returned unless selected;
        // reading it is what makes "who disagrees" visible at all.
        expect(deep3?.opposition.totalAssets).toBe(1000000n);
        expect(deep3?.opposition.positionCount).toBe(0);
    });

    it("keeps amounts as bigint so no precision is lost", async () => {
        const markets = (await source().getMarkets?.(CLAWNCH)) ?? [];
        const asterpay = markets.find((market) => market.label === "AsterPay KYA");
        expect(asterpay?.support.totalMarketCap).toBe(993846395273540461n);
    });

    it("ties each market back to its claim by handle", async () => {
        const [claims, markets] = await Promise.all([
            source().getAssessments(CLAWNCH),
            source().getMarkets?.(CLAWNCH) ?? Promise.resolve([]),
        ]);
        const handles = new Set(markets.map((market) => market.claimHandle));
        for (const claim of claims) {
            expect(handles.has(claim.sourceHandle ?? "")).toBe(true);
        }
    });
});

describe("intuitionSource.getCapabilities", () => {
    it("buckets the capability edges of a rich agent", async () => {
        const capabilities = await source().getCapabilities(CLAWNCH);
        expect(capabilities.protocols.map((entry) => entry.label).sort()).toEqual([
            "A2A",
            "ERC-8004",
            "MCP",
            "OASF",
            "x402",
        ]);
        expect(capabilities.types.map((entry) => entry.label).sort()).toEqual([
            "A2A Agent",
            "AIAgent",
            "MCP Server",
            "OASF Agent",
        ]);
        expect(capabilities.chains.map((entry) => entry.label)).toEqual(["Base"]);
        expect(capabilities.tags.map((entry) => entry.label).sort()).toEqual([
            "crypto-economic",
            "reputation",
            "tee-attestation",
            "x402",
        ]);
        expect(capabilities.provenance.sourceId).toBe("intuition");
    });

    it("reads categories on an agent that declares them", async () => {
        const capabilities = await source().getCapabilities(DACKIE);
        expect(capabilities.categories.map((entry) => entry.label).sort()).toEqual([
            "blockchain",
            "crypto_assets",
            "defi",
            "finance_and_business",
            "investment_services",
            "smart_contracts",
            "trading",
        ]);
    });

    it("returns an empty, provenanced result for the bare agent", async () => {
        const capabilities = await source().getCapabilities(BARE);
        expect(capabilities.tags).toEqual([]);
        expect(capabilities.categories).toEqual([]);
        expect(capabilities.types.map((entry) => entry.label)).toEqual(["AIAgent"]);
        expect(capabilities.protocols.map((entry) => entry.label)).toEqual(["ERC-8004"]);
    });

    it("returns an empty result for an agent that is not in the graph", async () => {
        const capabilities = await source().getCapabilities(ABSENT);
        expect(capabilities.types).toEqual([]);
        expect(capabilities.provenance.origin).toBeNull();
    });
});

describe("intuitionSource — transport failures surface", () => {
    it("raises a GraphQL error rather than returning an empty graph", async () => {
        const failing = intuitionSource({
            graphqlUrl: INTUITION_URL,
            fetch: async () =>
                new Response("bad gateway", {status: 502, statusText: "Bad Gateway"}),
        });
        await expect(failing.resolveAgent(CLAWNCH)).rejects.toThrow("502");
    });

    it("raises when the endpoint returns GraphQL errors", async () => {
        const failing = intuitionSource({
            graphqlUrl: INTUITION_URL,
            fetch: async () =>
                new Response(JSON.stringify({errors: [{message: "field not found"}]}), {
                    status: 200,
                    headers: {"content-type": "application/json"},
                }),
        });
        await expect(failing.resolveAgent(CLAWNCH)).rejects.toThrow("field not found");
    });
});

describe("intuitionSource — the bonding curve is a parameter, not an assumption", () => {
    /**
     * A recording transport. It answers the preflight so the surface query runs,
     * then captures the variables that query was sent with.
     */
    function recordingTransport(seen: Record<string, unknown>[]) {
        return {
            async request(query: string, variables: Record<string, unknown>) {
                seen.push({query, ...variables});
                if (
                    query.includes("FindAgentByERC8004Identity") ||
                    query.includes("sameAsPredicateId")
                ) {
                    return {
                        triples: [{subject: {term_id: "0xsubject", label: "x", value: null}}],
                    };
                }
                return {triples: []};
            },
        };
    }

    const ref = {
        chainId: 8453,
        tokenId: "6649",
        registry: "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432" as const,
    };

    it("filters market reads to curve 1 by default", async () => {
        const seen: Record<string, unknown>[] = [];
        const source = intuitionSource({transport: recordingTransport(seen)});
        await source.getAssessments(ref);

        const surface = seen.find((entry) => String(entry["query"]).includes("AgentTrustSurface"));
        expect(surface?.["curveId"]).toBe("1");
    });

    it("sends the curve it was given, so the market shown matches the vault deposited into", async () => {
        const seen: Record<string, unknown>[] = [];
        // A bigint, as getBondingCurveConfig() returns it — no conversion at the call site.
        const source = intuitionSource({transport: recordingTransport(seen), curveId: 7n});
        await source.getAssessments(ref);

        const surface = seen.find((entry) => String(entry["query"]).includes("AgentTrustSurface"));
        expect(surface?.["curveId"]).toBe("7");
    });

    it("never pins a curve in the query text itself", () => {
        // A literal here would silently override the variable for every caller.
        expect(TRUST_SURFACE_QUERY).not.toMatch(/curve_id:\s*\{_eq:\s*"/);
        expect(TRUST_SURFACE_QUERY).toContain("$curveId");
    });
});
