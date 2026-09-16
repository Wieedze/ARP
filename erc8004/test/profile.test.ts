import {custom} from "viem";
import {describe, expect, it} from "vitest";

import {createErc8004Client, type Erc8004Client} from "../src/client.js";
import {isRecord} from "../src/json.js";
import {
    getAgentProfile,
    getAssessments,
    getCapabilities,
    getMarkets,
    marketCapableSources,
    resolveAgent,
} from "../src/profile.js";
import {erc8004RegistrySource} from "../src/sources/erc8004-registry/index.js";
import {intuitionSource} from "../src/sources/intuition/index.js";
import type {TrustSource} from "../src/sources/source.js";
import {fixture, fixtureFetch, INTUITION_URL, recordedEthCall} from "./helpers.js";

/**
 * The clock the recorded documents are read against. Pinned so freshness
 * verdicts stay deterministic as the fixtures age.
 */
const NOW = new Date("2026-09-16T10:00:00Z");

function registrySource(): TrustSource {
    const recorded = fixture("registry-base.json");
    if (!isRecord(recorded)) throw new Error("registry fixture is not an object");
    const calls: Record<string, {ownerOf: unknown; tokenURI: unknown}> = {};
    for (const [key, value] of Object.entries(recorded)) {
        if (!isRecord(value)) continue;
        calls[key] = {ownerOf: value["ownerOf"], tokenURI: value["tokenURI"]};
    }
    return erc8004RegistrySource({
        transports: {8453: custom({request: recordedEthCall(calls)})},
    });
}

function client(): Erc8004Client {
    const fetchImpl = fixtureFetch();
    return createErc8004Client({
        fetch: fetchImpl,
        sources: [intuitionSource({fetch: fetchImpl, graphqlUrl: INTUITION_URL}), registrySource()],
    });
}

describe("getAgentProfile — the rich fixture (Clawnch, Base #2340)", () => {
    it("merges identity, assessments, capabilities and markets", async () => {
        const profile = await getAgentProfile(
            client(),
            {chainId: 8453, tokenId: "2340"},
            {now: NOW},
        );

        expect(profile.caip19).toBe(
            "eip155:8453/erc721:0x8004A169FB4a3325136EB29fA0ceB6D2e539a432/2340",
        );
        expect(profile.identity?.metadata.name).toBe("🦞 Clawnch 🦞");
        expect(profile.identity?.metadata.isFallback).toBe(false);
        expect(profile.sourcesConsulted).toEqual(["intuition", "erc8004-registry"]);
        expect(profile.marketCapableSources).toEqual(["intuition"]);
        expect(profile.sourceErrors).toEqual([]);
        expect(profile.assessments).toHaveLength(4);
        expect(profile.markets).toHaveLength(4);
    });

    it("carries a source id on every field it returns", async () => {
        const profile = await getAgentProfile(
            client(),
            {chainId: 8453, tokenId: "2340"},
            {now: NOW},
        );

        for (const identity of profile.identities) {
            expect(identity.provenance.sourceId).toBeTruthy();
        }
        for (const entry of profile.assessments) {
            expect(entry.claim.provenance.sourceId).toBe("intuition");
            expect(entry.market?.provenance.sourceId ?? "intuition").toBe("intuition");
        }
        for (const capabilities of profile.capabilities) {
            expect(capabilities.provenance.sourceId).toBeTruthy();
        }
        for (const market of profile.markets) {
            expect(market.provenance.sourceId).toBe("intuition");
        }
    });

    it("verifies the Deep3 signature and reports the unsigned AsterPay document honestly", async () => {
        const profile = await getAgentProfile(
            client(),
            {chainId: 8453, tokenId: "2340"},
            {now: NOW},
        );

        const deep3 = profile.assessments.find(
            (entry) => entry.claim.provider.name === "Deep3 Labs — 🦞 Clawnch 🦞 assessment",
        );
        expect(deep3?.signature.status).toBe("verified");
        if (deep3?.signature.status === "verified") {
            expect(deep3.signature.recovered).toBe("0x27A6265e6daf8d9935A3031f2E7cDC4bDFbe2Ebe");
        }

        const asterpay = profile.assessments.find(
            (entry) => entry.claim.provider.name === "AsterPay KYA — Clawnch trust assessment",
        );
        expect(asterpay?.signature.status).toBe("unverified");
        if (asterpay?.signature.status === "unverified") {
            expect(asterpay.signature.reason).toContain("no signature block");
        }
    });

    it("marks both documents stale against their own declared windows", async () => {
        const profile = await getAgentProfile(
            client(),
            {chainId: 8453, tokenId: "2340"},
            {now: NOW},
        );
        const fetched = profile.assessments.filter((entry) => entry.fetch.status === "ok");
        expect(fetched).toHaveLength(2);
        for (const entry of fetched) {
            expect(entry.freshness.status).toBe("stale");
        }
    });

    it("attaches the live market to each claim that has one", async () => {
        const profile = await getAgentProfile(
            client(),
            {chainId: 8453, tokenId: "2340"},
            {now: NOW},
        );
        for (const entry of profile.assessments) {
            expect(entry.market?.claimHandle).toBe(entry.claim.sourceHandle);
        }
        const deep3 = profile.assessments.find(
            (entry) => entry.claim.provider.name === "Deep3 Labs",
        );
        expect(deep3?.market?.support.totalAssets).toBe(987500001000000n);
        expect(deep3?.market?.opposition.totalAssets).toBe(1000000n);
    });

    it("reports a provider claim whose resolver URL is not an assessment document", async () => {
        const profile = await getAgentProfile(
            client(),
            {chainId: 8453, tokenId: "2340"},
            {now: NOW},
        );
        // The `has trust provider` edges point at the provider's homepage, not a
        // document. That is a fetch error, reported, not swallowed.
        const homepage = profile.assessments.find(
            (entry) => entry.claim.resolverUrl === "https://deep3.ai",
        );
        expect(homepage?.fetch.status).toBe("error");
        expect(homepage?.signature.status).toBe("unverified");
        expect(homepage?.freshness.status).toBe("unknown");
    });
});

describe("getAgentProfile — the bare fixture (Agent 8453:6649)", () => {
    it("returns a correct profile for a five-triple shell", async () => {
        const profile = await getAgentProfile(
            client(),
            {chainId: 8453, tokenId: "6649"},
            {now: NOW},
        );

        expect(profile.identity?.metadata.name).toBe("Agent 8453:6649");
        expect(profile.identity?.metadata.isFallback).toBe(true);
        expect(profile.assessments).toHaveLength(2);
        expect(profile.capabilities[0]?.tags).toEqual([]);

        const signed = profile.assessments.find((entry) => entry.fetch.status === "ok");
        expect(signed?.signature.status).toBe("verified");
    });
});

describe("getAgentProfile — the multi-provider fixture (Captain Dackie, Base #1380)", () => {
    it("keeps both providers and reports the one with a dead resolver", async () => {
        const profile = await getAgentProfile(
            client(),
            {chainId: 8453, tokenId: "1380"},
            {now: NOW},
        );

        const assessmentEdges = profile.assessments.filter(
            (entry) => entry.claim.relation === "has-trust-assessment",
        );
        expect(assessmentEdges).toHaveLength(2);

        const deep3 = assessmentEdges.find((entry) =>
            entry.claim.resolverUrl?.includes("deep3.ai"),
        );
        expect(deep3?.signature.status).toBe("verified");

        // AsterPay advertises a resolver URL for this agent that 404s. The claim
        // stays in the profile; what cannot be checked is reported, not hidden.
        const asterpay = assessmentEdges.find((entry) =>
            entry.claim.resolverUrl?.includes("asterpay.io"),
        );
        expect(asterpay?.fetch.status).toBe("error");
        if (asterpay?.fetch.status === "error") {
            expect(asterpay.fetch.error).toEqual({
                kind: "http",
                status: 404,
                statusText: "Not Found",
            });
        }
        expect(asterpay?.signature.status).toBe("unverified");
    });

    it("returns the full capability set", async () => {
        const profile = await getAgentProfile(
            client(),
            {chainId: 8453, tokenId: "1380"},
            {now: NOW},
        );
        const capabilities = profile.capabilities[0];
        expect(capabilities?.categories.length).toBe(7);
        expect(capabilities?.tags.length).toBeGreaterThan(10);
    });
});

describe("getAgentProfile — an agent in no source", () => {
    it("returns an empty profile rather than throwing", async () => {
        const profile = await getAgentProfile(
            client(),
            {chainId: 8453, tokenId: "999999999"},
            {now: NOW},
        );
        expect(profile.identity).toBeNull();
        expect(profile.identities).toEqual([]);
        expect(profile.assessments).toEqual([]);
        expect(profile.sourceErrors).toEqual([]);
    });
});

describe("getAgentProfile — a failing source does not take the profile with it", () => {
    it("records the failure and returns what the other sources produced", async () => {
        const fetchImpl = fixtureFetch();
        const broken: TrustSource = {
            id: "broken",
            resolveAgent: async () => {
                throw new Error("upstream down");
            },
            getAssessments: async () => {
                throw new Error("upstream down");
            },
            getCapabilities: async () => {
                throw new Error("upstream down");
            },
        };
        const mixed = createErc8004Client({
            fetch: fetchImpl,
            sources: [intuitionSource({fetch: fetchImpl, graphqlUrl: INTUITION_URL}), broken],
        });

        const profile = await getAgentProfile(mixed, {chainId: 8453, tokenId: "2340"}, {now: NOW});
        expect(profile.identity?.metadata.name).toBe("🦞 Clawnch 🦞");
        expect(profile.sourceErrors.map((entry) => entry.step).sort()).toEqual([
            "getAssessments",
            "getCapabilities",
            "resolveAgent",
        ]);
        expect(profile.sourceErrors.every((entry) => entry.sourceId === "broken")).toBe(true);
    });

    it("throws when every source failed, because that is not an answer", async () => {
        const allBroken = createErc8004Client({
            fetch: async () => {
                throw new Error("no network");
            },
            sources: [
                {
                    id: "broken",
                    resolveAgent: async () => {
                        throw new Error("upstream down");
                    },
                    getAssessments: async () => [],
                    getCapabilities: async () => {
                        throw new Error("upstream down");
                    },
                },
            ],
        });
        await expect(allBroken.sources).toHaveLength(1);
        await expect(resolveAgent(allBroken, {chainId: 8453, tokenId: "2340"})).rejects.toThrow(
            "every source failed at resolveAgent",
        );
    });
});

describe("getAgentProfile — conflicts are kept, not resolved", () => {
    it("records both answers when two sources disagree on a field", async () => {
        const fetchImpl = fixtureFetch();
        const contrarian: TrustSource = {
            id: "contrarian",
            resolveAgent: async (ref) => ({
                chainId: ref.chainId,
                tokenId: ref.tokenId,
                registry: ref.registry,
                caip19: "eip155:8453/erc721:0x8004A169FB4a3325136EB29fA0ceB6D2e539a432/2340",
                sourceHandle: null,
                registrationFile: null,
                owner: null,
                metadata: {
                    name: "Something Else Entirely",
                    description: null,
                    image: null,
                    url: null,
                    isFallback: false,
                },
                provenance: {sourceId: "contrarian", kind: "claim", origin: null},
            }),
            getAssessments: async () => [],
            getCapabilities: async () => ({
                types: [],
                protocols: [],
                chains: [],
                tags: [],
                categories: [],
                provenance: {sourceId: "contrarian", kind: "claim", origin: null},
            }),
        };

        const profile = await getAgentProfile(
            createErc8004Client({
                fetch: fetchImpl,
                sources: [
                    intuitionSource({fetch: fetchImpl, graphqlUrl: INTUITION_URL}),
                    contrarian,
                ],
            }),
            {chainId: 8453, tokenId: "2340"},
            {now: NOW},
        );

        const conflict = profile.conflicts.find((entry) => entry.field === "metadata.name");
        expect(conflict?.entries.map((entry) => entry.value)).toEqual([
            "🦞 Clawnch 🦞",
            "Something Else Entirely",
        ]);
        expect(profile.identities).toHaveLength(2);
    });
});

describe("the composable pieces", () => {
    it("are each usable on their own, keyed by AgentRef", async () => {
        const c = client();
        const ref = {chainId: 8453, tokenId: "2340"};

        expect((await resolveAgent(c, ref))?.metadata.name).toBe("🦞 Clawnch 🦞");
        expect(await getAssessments(c, ref)).toHaveLength(4);
        expect(await getCapabilities(c, ref)).toHaveLength(2);
        expect(await getMarkets(c, ref)).toHaveLength(4);
        expect(marketCapableSources(c)).toEqual(["intuition"]);
    });

    it("skips the resolver fetch when asked, keeping claims and markets", async () => {
        const profile = await getAgentProfile(
            client(),
            {chainId: 8453, tokenId: "2340"},
            {now: NOW, skipResolverFetch: true},
        );
        expect(profile.assessments).toHaveLength(4);
        expect(profile.markets).toHaveLength(4);
        for (const entry of profile.assessments) {
            expect(entry.fetch.status).toBe("error");
            expect(entry.signature.status).toBe("unverified");
        }
    });
});
