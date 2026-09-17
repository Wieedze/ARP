import {describe, expect, it} from "vitest";

import {createErc8004Client} from "../src/client.js";
import {getAgentProfile} from "../src/profile.js";
import {intuitionSource} from "../src/sources/intuition/index.js";

/**
 * One opt-in test against real mainnet.
 *
 * CI stays hermetic by default. Run it with `ERC8004_LIVE=1 bun run test` when
 * you want to know whether the indexer's schema has moved under the queries —
 * schema drift is the failure mode most likely to break this package, and
 * recorded fixtures cannot catch it by construction.
 */
const live = process.env["ERC8004_LIVE"] === "1" ? describe : describe.skip;

live("live smoke (ERC8004_LIVE=1)", () => {
    const client = () => createErc8004Client({sources: [intuitionSource()], timeoutMs: 30_000});

    it("resolves the bare fixture against real mainnet", async () => {
        const profile = await getAgentProfile(client(), {chainId: 8453, tokenId: "6649"});
        expect(profile.identity?.sourceHandle).toBe(
            "0x0ea137804fd2180aca6c35474e7db6e3c2fb0f7990dd798452ed5b412610765e",
        );
        expect(profile.sourceErrors).toEqual([]);
        expect(profile.assessments.length).toBeGreaterThan(0);
    }, 60_000);

    it("still verifies a live Deep3 signature end to end", async () => {
        const profile = await getAgentProfile(client(), {chainId: 8453, tokenId: "2340"});
        const deep3 = profile.assessments.find(
            (entry) => entry.fetch.status === "ok" && entry.claim.resolverUrl?.includes("deep3.ai"),
        );
        expect(deep3?.signature.status).toBe("verified");
    }, 60_000);
});
