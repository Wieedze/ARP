import {describe, expect, it} from "vitest";

import {createErc8004Client} from "../src/client.js";
import {
    listAgents,
    ListAgentsFailedError,
    listingCapableSources,
    MAX_PAGE_SIZE,
    NoListingSourceError,
    resolveListOptions,
} from "../src/listing.js";
import {erc8004RegistrySource} from "../src/sources/erc8004-registry/index.js";
import {intuitionSource} from "../src/sources/intuition/index.js";
import {
    COHORT_ORDER_BY,
    COHORT_QUERY,
    IDENTITY_SAMPLE_LIMIT,
} from "../src/sources/intuition/queries.js";
import {ERC8004, IMPLEMENT, SAME_AS} from "../src/sources/intuition/terms.js";
import type {AgentPage} from "../src/types.js";
import {fixtureFetch, INTUITION_URL} from "./helpers.js";

const source = () => intuitionSource({fetch: fixtureFetch(), graphqlUrl: INTUITION_URL});
const client = () => createErc8004Client({sources: [source()], fetch: fixtureFetch()});

async function page(overrides: Parameters<typeof listAgents>[1] = {}): Promise<AgentPage> {
    return listAgents(client(), overrides);
}

describe("resolveListOptions", () => {
    it("defaults to the evidence order and a 25-row page", () => {
        expect(resolveListOptions()).toEqual({order: "evidence-quantity", limit: 25, offset: 0});
    });

    it("clamps rather than throws, because these come from a control, not a programmer", () => {
        expect(resolveListOptions({limit: 0}).limit).toBe(1);
        expect(resolveListOptions({limit: 5_000}).limit).toBe(MAX_PAGE_SIZE);
        expect(resolveListOptions({offset: -40}).offset).toBe(0);
        expect(resolveListOptions({limit: 25.9}).limit).toBe(25);
        expect(resolveListOptions({limit: Number.NaN}).limit).toBe(25);
        expect(resolveListOptions({offset: Number.POSITIVE_INFINITY}).offset).toBe(0);
    });
});

describe("listAgents — which sources can answer", () => {
    it("names Intuition as listing-capable and the registry as not", () => {
        expect(listingCapableSources(createErc8004Client({sources: [source()]}))).toEqual([
            "intuition",
        ]);
        expect(
            listingCapableSources(createErc8004Client({sources: [erc8004RegistrySource()]})),
        ).toEqual([]);
    });

    it("raises rather than returning an empty page when nothing can enumerate", async () => {
        const registryOnly = createErc8004Client({sources: [erc8004RegistrySource()]});
        await expect(listAgents(registryOnly)).rejects.toBeInstanceOf(NoListingSourceError);
    });

    it("raises when every listing source failed, so a failure never reads as an empty cohort", async () => {
        const failing = createErc8004Client({
            sources: [
                intuitionSource({
                    graphqlUrl: INTUITION_URL,
                    fetch: async () => new Response("down", {status: 503, statusText: "Down"}),
                }),
            ],
        });
        await expect(listAgents(failing)).rejects.toBeInstanceOf(ListAgentsFailedError);
    });
});

describe("listAgents — the cohort page", () => {
    it("reports the graph's own total, not the page length", async () => {
        const result = await page();
        expect(result.total).toBe(28_648);
        expect(result.agents).toHaveLength(25);
        expect(result.sourceId).toBe("intuition");
        expect(result.order).toBe("evidence-quantity");
    });

    it("returns the rows in the order the indexer produced them", async () => {
        const result = await page();
        expect(result.agents.slice(0, 4).map((agent) => agent.metadata.name)).toEqual([
            "Captain Dackie",
            "Ouro Proof-of-Compute Oracle",
            "Jeed",
            "Meerkat James",
        ]);
        // The two 35s are a tie the indexer broke on subject_id, which is what
        // keeps the same agent from appearing on two pages.
        expect(result.agents.slice(0, 4).map((agent) => agent.statementCount)).toEqual([
            41, 35, 35, 30,
        ]);
    });

    it("reads the economic order when asked for it", async () => {
        const result = await page({order: "economic-conviction"});
        expect(result.order).toBe("economic-conviction");
        expect(result.agents[0]?.metadata.name).toBe(
            "AsterPay — EUR Settlement for AI Agent Commerce",
        );
        expect(result.agents[0]?.market?.totalMarketCap).toBe(13_022_234_723_543_239_323n);
    });

    it("keeps the market cap and the position count at the same scope", async () => {
        const result = await page();
        const dackie = result.agents.find((agent) => agent.metadata.name === "Captain Dackie");
        // Two curve vaults, one position between them, and a market cap that
        // sums both. Reading the position count off curve 1 alone would have
        // printed 6.33 TRUST beside zero positions.
        expect(dackie?.market).toEqual({
            totalMarketCap: 6_336_930_209_822_752_561n,
            positionCount: 1,
            vaultCount: 2,
        });
    });

    it("marks the indexer's stand-in metadata as a fallback", async () => {
        // Deep in the cohort every agent sits on the uniform five-statement
        // shell and roughly half carry a synthesised `Agent 8453:NNNN` name.
        const result = await page({offset: 20_000});
        expect(result.offset).toBe(20_000);
        expect(result.agents.map((agent) => agent.statementCount)).toEqual(
            Array.from({length: 25}, () => 5),
        );

        const fallbacks = result.agents.filter((agent) => agent.metadata.isFallback);
        expect(fallbacks).toHaveLength(13);
        for (const agent of fallbacks) {
            expect(agent.metadata.name).toMatch(/^Agent \d+:\d+$/);
        }
        for (const agent of result.agents.filter((entry) => !entry.metadata.isFallback)) {
            expect(agent.metadata.name).not.toMatch(/^Agent \d+:\d+$/);
        }
    });
});

describe("listAgents — identity comes from the same-as edge", () => {
    it("derives the token id from the CAIP edge and not from the label", async () => {
        const result = await page();
        const dackie = result.agents.find((agent) => agent.metadata.name === "Captain Dackie");
        expect(dackie?.ref).toEqual({
            chainId: 8453,
            tokenId: "1380",
            registry: "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432",
        });
        expect(dackie?.isIdentityAmbiguous).toBe(false);
    });

    it("ignores a same-as edge that is not an ERC-8004 asset id", async () => {
        // Clawnch declares `did:web:clawn.ch` alongside its CAIP-19 identity.
        // That is a true statement about another namespace, not a second agent.
        const result = await page();
        const clawnch = result.agents.find((agent) => agent.metadata.name?.includes("Clawnch"));
        expect(clawnch?.identityEdgeCount).toBe(2);
        expect(clawnch?.identities).toHaveLength(1);
        expect(clawnch?.ref?.tokenId).toBe("2340");
        expect(clawnch?.isIdentityAmbiguous).toBe(false);
    });

    it("refuses to pick one identity when the atom claims several", async () => {
        const result = await page();
        const ouro = result.agents.filter(
            (agent) => agent.metadata.name === "Ouro Proof-of-Compute Oracle",
        );
        expect(ouro.length).toBeGreaterThan(0);
        for (const agent of ouro) {
            expect(agent.isIdentityAmbiguous).toBe(true);
            expect(agent.ref).toBeNull();
            expect(agent.identities.length).toBeGreaterThan(1);
            expect(agent.identityEdgeCount).toBeGreaterThan(IDENTITY_SAMPLE_LIMIT);
        }
    });

    it("carries source provenance on every row", async () => {
        const result = await page();
        for (const agent of result.agents) {
            expect(agent.provenance.sourceId).toBe("intuition");
            expect(agent.provenance.origin).toBe(agent.sourceHandle);
        }
    });
});

describe("COHORT_QUERY — what it is allowed to contain", () => {
    it("filters the cohort by term id on both ends, never by label", () => {
        expect(COHORT_QUERY).not.toMatch(/label\s*:\s*\{/);
        expect(COHORT_QUERY).toContain("$predicateId");
        expect(COHORT_QUERY).toContain("$objectId");
    });

    it("sends the frozen implement and ERC-8004 term ids", async () => {
        const bodies: string[] = [];
        const recording = intuitionSource({
            graphqlUrl: INTUITION_URL,
            fetch: async (input, init) => {
                bodies.push(String(init?.body ?? ""));
                return fixtureFetch()(input, init);
            },
        });
        await recording.listAgents?.({order: "evidence-quantity", limit: 25, offset: 0});
        expect(bodies[0]).toContain(IMPLEMENT);
        expect(bodies[0]).toContain(ERC8004);
        expect(bodies[0]).toContain(SAME_AS);
    });

    it("pages at the source rather than pulling the cohort", () => {
        expect(COHORT_QUERY).toContain("limit: $limit");
        expect(COHORT_QUERY).toContain("offset: $offset");
    });

    it("offers no order by score, only the two that cost something", () => {
        expect(Object.keys(COHORT_ORDER_BY)).toEqual(["evidence-quantity", "economic-conviction"]);
        expect(JSON.stringify(COHORT_ORDER_BY)).not.toMatch(/score/i);
    });

    it("breaks the tie on every order, so offset pagination is deterministic", () => {
        // The mirrored shell gives thousands of agents the same statement count
        // and the same market cap. Without a second key the indexer is free to
        // return them in any order, and pages would drop and repeat rows.
        for (const clause of Object.values(COHORT_ORDER_BY)) {
            expect(clause.at(-1)).toEqual({subject_id: "asc"});
        }
    });
});
