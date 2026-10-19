import {describe, expect, it} from "vitest";

import {createErc8004Client} from "../src/client.js";
import {listAgents} from "../src/listing.js";
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

    /**
     * A client with deadlines far past anything observed, so the cohort tests
     * below assert what came back rather than how fast it came.
     */
    const patient = () =>
        createErc8004Client({
            sources: [intuitionSource({timeoutMs: 120_000, listTimeoutMs: 120_000})],
            timeoutMs: 120_000,
        });

    it("resolves the bare fixture against real mainnet", async () => {
        const profile = await getAgentProfile(client(), {chainId: 8453, tokenId: "6649"});
        expect(profile.identity?.sourceHandle).toBe(
            "0x0ea137804fd2180aca6c35474e7db6e3c2fb0f7990dd798452ed5b412610765e",
        );
        expect(profile.sourceErrors).toEqual([]);
        expect(profile.assessments.length).toBeGreaterThan(0);
    }, 60_000);

    /**
     * Correctness of both orders, on a budget generous enough that the assertion
     * is about our code.
     *
     * The first version of this test ran on the default deadline and failed on
     * the endpoint's p95 — which teaches a reader to ignore it, the worst thing
     * a live test can do. Latency is observed separately, below, where it
     * cannot fail the suite.
     */
    it("reads a page of the real cohort in both orders", async () => {
        const evidence = await listAgents(patient(), {order: "evidence-quantity", limit: 5});
        expect(evidence.total).toBeGreaterThan(20_000);
        expect(evidence.agents).toHaveLength(5);
        expect(evidence.agents[0]?.statementCount).toBeGreaterThan(5);
        // The identity has to come off the `same as` edge, not the label.
        expect(evidence.agents.some((agent) => agent.ref !== null)).toBe(true);

        const economic = await listAgents(patient(), {order: "economic-conviction", limit: 5});
        expect(economic.agents).toHaveLength(5);
        expect(economic.agents[0]?.market?.totalMarketCap).toBeGreaterThan(0n);
        // Both figures are read at one scope, so a cap never arrives without a count.
        for (const agent of economic.agents) {
            if (agent.market?.totalMarketCap != null) {
                expect(agent.market.positionCount).not.toBeNull();
            }
        }
    }, 300_000);

    /**
     * An observation, not an assertion.
     *
     * This endpoint's cohort latency has been measured at 0.78s, at 9.1s and
     * not returning inside 25s — on the same query, within an hour. Turning
     * that into a pass/fail threshold would test the indexer's mood. This
     * prints what it saw, and fails only if a read comes back *wrong*.
     */
    it("observes cohort latency without failing on it", async () => {
        const source = patient();
        const observations: string[] = [];
        for (const order of ["evidence-quantity", "economic-conviction"] as const) {
            const started = Date.now();
            try {
                const page = await listAgents(source, {order, limit: 25});
                expect(page.agents).toHaveLength(25);
                observations.push(`${order}: ${((Date.now() - started) / 1000).toFixed(2)}s`);
            } catch (error) {
                const elapsed = ((Date.now() - started) / 1000).toFixed(2);
                const reason = error instanceof Error ? error.message : String(error);
                observations.push(`${order}: did not return after ${elapsed}s — ${reason}`);
            }
        }
        console.info(`cohort latency — ${observations.join(" | ")}`);
    }, 300_000);

    it("still verifies a live Deep3 signature end to end", async () => {
        const profile = await getAgentProfile(client(), {chainId: 8453, tokenId: "2340"});
        const deep3 = profile.assessments.find(
            (entry) => entry.fetch.status === "ok" && entry.claim.resolverUrl?.includes("deep3.ai"),
        );
        expect(deep3?.signature.status).toBe("verified");
    }, 60_000);
});
