import {describe, expect, it, vi} from "vitest";
import type {AgentProfile} from "@arp-protocol/erc8004";

import {
    ASTERPAY_TRIPLE,
    assessmentEdge,
    claimMarket,
    DEEP3_TRIPLE,
    notFoundFetch,
    profile,
    providerEdge,
    richProfile,
} from "../../services/__tests__/trust-fixtures";
import {agentProfileQueryKey, agentProfileQueryOptions} from "../use-agent-profile";

const REF = {chainId: 8453, tokenId: "2340"};

function optionsOver(value: AgentProfile | Error) {
    const fetchProfile = vi.fn(async () => {
        if (value instanceof Error) throw value;
        return value;
    });
    return {options: agentProfileQueryOptions(REF, undefined, fetchProfile), fetchProfile};
}

describe("agentProfileQueryOptions", () => {
    it("keys on the ERC-8004 identity, not on a source handle", () => {
        expect(agentProfileQueryKey(REF)).toEqual([
            "erc8004",
            "agent-profile",
            8453,
            "2340",
            "default",
        ]);
        expect(agentProfileQueryKey(null)).toEqual([
            "erc8004",
            "agent-profile",
            null,
            null,
            "default",
        ]);

        // The curve is part of the key: a market read for one curve must not be
        // served from cache when a stake would land in another.
        expect(agentProfileQueryKey(REF, 7n)).toEqual([
            "erc8004",
            "agent-profile",
            8453,
            "2340",
            "7",
        ]);
    });

    it("stays disabled without a reference, and refuses to invent one", async () => {
        const options = agentProfileQueryOptions(null, undefined, vi.fn());
        expect(options.enabled).toBe(false);
        await expect(options.queryFn()).rejects.toThrow("No agent reference");
    });

    it("passes the curve it was given to the fetcher, so the market matches the vault", async () => {
        const fetchProfile = vi.fn(async () => richProfile());
        const options = agentProfileQueryOptions(REF, 7n, fetchProfile);
        await options.queryFn();
        expect(fetchProfile).toHaveBeenCalledWith(REF, 7n);
    });

    it("never retries — every retry is another round of provider fetches", () => {
        expect(agentProfileQueryOptions(REF).retry).toBe(0);
    });

    it("maps a rich profile into the panel view", async () => {
        const {options, fetchProfile} = optionsOver(richProfile());
        const view = await options.queryFn();

        expect(fetchProfile).toHaveBeenCalledWith(REF, undefined);
        expect(view.found).toBe(true);
        expect(view.rows).toHaveLength(2);
        expect(view.rows[0].score).toBe(55.35);
        expect(view.rows[0].weight).toBe("moderate");
        expect(view.rows[0].assessment?.signature.status).toBe("verified");
        expect(view.rows[1].assessment?.signature.status).toBe("unverified");
    });

    it("renders a provider whose resolver is down, with what is still known", async () => {
        const market = claimMarket(ASTERPAY_TRIPLE);
        const {options} = optionsOver(
            profile({
                assessments: [
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
                markets: [market],
            }),
        );

        const view = await options.queryFn();
        expect(view.rows).toHaveLength(1);
        expect(view.rows[0].documentError).toEqual({
            kind: "http",
            status: 404,
            statusText: "Not Found",
        });
        expect(view.rows[0].score).toBeNull();
        expect(view.rows[0].market?.support.positionCount).toBe(1);
        expect(view.rows[0].tripleId).toBe(ASTERPAY_TRIPLE);
    });

    it("says a partial source failure happened instead of hiding it", async () => {
        const source = richProfile();
        const {options} = optionsOver({
            ...source,
            sourceErrors: [
                {sourceId: "erc8004-registry", step: "resolveAgent", message: "RPC timeout"},
            ],
        });

        const view = await options.queryFn();
        expect(view.found).toBe(true);
        expect(view.rows).toHaveLength(2);
        expect(view.sourceErrors[0].message).toBe("RPC timeout");
    });

    it("returns an empty assessment list when no provider has written an edge", async () => {
        const {options} = optionsOver(profile());
        const view = await options.queryFn();

        expect(view.found).toBe(true);
        expect(view.rows).toEqual([]);
        expect(view.capabilityCount).toBe(0);
        // Markets are readable here, so "no markets" means "nobody staked".
        expect(view.marketCapableSources).toEqual(["intuition"]);
    });

    it("distinguishes an agent that is not there from a read that failed", async () => {
        const {options} = optionsOver(profile({identity: null, identities: []}));
        const view = await options.queryFn();
        expect(view.found).toBe(false);

        const failing = optionsOver(new Error("every source failed at resolveAgent"));
        await expect(failing.options.queryFn()).rejects.toThrow("every source failed");
    });

    it("keeps the triple id the market is priced on", async () => {
        const {options} = optionsOver(richProfile());
        const view = await options.queryFn();
        expect(view.rows[0].tripleId).toBe(DEEP3_TRIPLE);
    });
});
