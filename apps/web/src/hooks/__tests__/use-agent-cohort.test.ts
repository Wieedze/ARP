import {describe, expect, it, vi} from "vitest";
import type {AgentListing, AgentPage, ListAgentsOptions} from "@arp-protocol/core";

import {
    AGENT_SEARCH_LIMIT,
    agentCohortQueryKey,
    agentCohortQueryOptions,
    agentSearchQueryOptions,
    COHORT_PAGE_SIZE,
} from "../use-agent-cohort";

const REGISTRY = "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432" as const;

function listing(tokenId: string): AgentListing {
    return {
        sourceHandle: `0x${tokenId}`,
        capabilities: [],
        ref: {chainId: 8453, tokenId, registry: REGISTRY},
        identities: [{chainId: 8453, tokenId, registry: REGISTRY}],
        identityEdgeCount: 1,
        isIdentityAmbiguous: false,
        metadata: {
            name: `Agent 8453:${tokenId}`,
            description: null,
            image: null,
            url: null,
            isFallback: true,
        },
        statementCount: 5,
        market: {totalMarketCap: 982_500_001_000_000n, positionCount: 1, vaultCount: 1},
        provenance: {sourceId: "intuition", kind: "claim", origin: `0x${tokenId}`},
    };
}

async function pageOver(options: ListAgentsOptions): Promise<AgentPage> {
    return {
        sourceId: "intuition",
        order: options.order ?? "evidence-quantity",
        limit: options.limit ?? COHORT_PAGE_SIZE,
        offset: options.offset ?? 0,
        total: 28_648,
        agents: [listing("6649")],
    };
}

/** Either chain, named so the key assertions stay readable. */
const MAINNET = {
    chainId: 1155,
    graphqlUrl: "https://mainnet.intuition.sh/v1/graphql",
    symbol: "TRUST",
};

describe("agentCohortQueryKey", () => {
    it("keys on the order and the offset", () => {
        expect(agentCohortQueryKey(1155, "evidence-quantity", 0)).toEqual([
            "erc8004",
            1155,
            "agent-cohort",
            "evidence-quantity",
            25,
            0,
        ]);
    });

    it("gives two orders of the same cohort two different keys", () => {
        // They are two sequences, not two views of one, so a page of one must
        // never be served from cache for the other.
        expect(agentCohortQueryKey(1155, "evidence-quantity", 50)).not.toEqual(
            agentCohortQueryKey(1155, "economic-conviction", 50),
        );
    });
});

describe("agentCohortQueryOptions", () => {
    it("asks the source for one page, not for the cohort", async () => {
        const fetchCohort = vi.fn(pageOver);
        await agentCohortQueryOptions(MAINNET, "evidence-quantity", 0, fetchCohort).queryFn();
        expect(fetchCohort).toHaveBeenCalledWith(
            {
                order: "evidence-quantity",
                limit: COHORT_PAGE_SIZE,
                offset: 0,
            },
            "https://mainnet.intuition.sh/v1/graphql",
        );
        expect(COHORT_PAGE_SIZE).toBeLessThanOrEqual(50);
    });

    it("passes the order and the offset straight through", async () => {
        const fetchCohort = vi.fn(pageOver);
        await agentCohortQueryOptions(MAINNET, "economic-conviction", 75, fetchCohort).queryFn();
        expect(fetchCohort).toHaveBeenCalledWith(
            {
                order: "economic-conviction",
                limit: COHORT_PAGE_SIZE,
                offset: 75,
            },
            "https://mainnet.intuition.sh/v1/graphql",
        );
    });

    it("maps the page into the directory view", async () => {
        const view = await agentCohortQueryOptions(
            MAINNET,
            "evidence-quantity",
            0,
            vi.fn(pageOver),
        ).queryFn();
        expect(view.total).toBe(28_648);
        expect(view.rows).toHaveLength(1);
        expect(view.rows[0].href).toBe("/agent/8453/6649");
        expect(view.rows[0].isFallbackMetadata).toBe(true);
        expect(view.rows[0].positions).toBe("1 support");
    });

    it("lets a failed read reach the caller instead of returning an empty cohort", async () => {
        const failing = vi.fn(async () => {
            throw new Error("no configured source can list agents: erc8004-registry");
        });
        await expect(
            agentCohortQueryOptions(MAINNET, "evidence-quantity", 0, failing).queryFn(),
        ).rejects.toThrow("no configured source can list agents");
    });

    it("keeps the previous page on screen while the next one loads", () => {
        const options = agentCohortQueryOptions(MAINNET, "evidence-quantity", 25, vi.fn(pageOver));
        expect(options.placeholderData).toBeTypeOf("function");
    });
});

describe("agentSearchQueryOptions (task 48)", () => {
    it("asks for agents by name, one short page, in the evidence order", async () => {
        const fetchCohort = vi.fn(pageOver);
        await agentSearchQueryOptions(MAINNET, "  dackie ", fetchCohort).queryFn();
        expect(fetchCohort).toHaveBeenCalledWith(
            {order: "evidence-quantity", limit: AGENT_SEARCH_LIMIT, offset: 0, name: "dackie"},
            "https://mainnet.intuition.sh/v1/graphql",
        );
    });

    it("does not read for a blank name, and keys on the name and the chain", () => {
        expect(agentSearchQueryOptions(MAINNET, "   ").enabled).toBe(false);
        const key = agentSearchQueryOptions(MAINNET, "dackie").queryKey;
        expect(key).toContain("dackie");
        expect(key).toContain(MAINNET.chainId);
    });
});
