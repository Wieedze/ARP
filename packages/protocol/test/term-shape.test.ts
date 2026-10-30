import {describe, expect, it} from "vitest";

import {
    INTUITION_MAX_POSITIONS_PAGE,
    getAccountActivity,
    getAccountHoldings,
    getTermActivity,
    getTermShape,
} from "../src/term-shape.js";
import type {GraphqlTransport} from "@arp-protocol/graphql";

const TERM = `0x${"ab".repeat(32)}`;
const ACCOUNT = "0x606B24eb3F814ea5D7117a9bBc1431252f32245A";

/**
 * A transport that answers by query name, so one fake serves every read and the test says which
 * query it is standing in for.
 */
function transportOf(byQuery: Record<string, unknown>): {
    transport: GraphqlTransport;
    seen: {name: string; variables: Record<string, unknown>}[];
} {
    const seen: {name: string; variables: Record<string, unknown>}[] = [];
    return {
        seen,
        transport: {
            async request(query: string, variables?: Record<string, unknown>) {
                const name = /query (\w+)/.exec(query)?.[1] ?? "anonymous";
                seen.push({name, variables: variables ?? {}});
                return (byQuery[name] ?? {}) as Record<string, unknown>;
            },
        },
    };
}

const position = (account: string, shares: string) => ({account_id: account, shares});

describe("getTermShape", () => {
    const shapeData = (backers: {account_id: string; shares: string}[], total: string) => ({
        TermShape: {
            agg: {aggregate: {count: backers.length, sum: {shares: total}}},
            first: [{created_at: "2025-11-01T18:56:57+00:00"}],
            last: [{created_at: "2026-10-06T08:17:36+00:00"}],
            backers,
        },
        // Each backer holds this term plus N others; the reader subtracts the one.
        BackerBreadth: {a0: {aggregate: {count: 25}}, a1: {aggregate: {count: 3}}, a2: {aggregate: {count: 1}}},
    });

    it("computes the largest share exactly, despite the page cap", async () => {
        /**
         * The number that makes a count readable. Measured on mainnet 2026-10-21: the busiest term
         * has 34,421 positions and its largest single one holds **31.2%** of the weight, its top
         * three **69.8%**. A count says a crowd; this says three accounts.
         *
         * Exact rather than sampled: the largest comes from an ordered read of one row and the
         * denominator from an aggregate, so the 100-row page cap does not touch either.
         */
        const {transport} = transportOf(
            shapeData([position("0xa", "500"), position("0xb", "300"), position("0xc", "200")], "1000"),
        );
        const shape = await getTermShape(TERM, {transport});
        expect(shape.largestShareBps).toBe(5000);
        expect(shape.topThreeShareBps).toBe(10_000);
        expect(shape.positionCount).toBe(3);
        expect(shape.totalShares).toBe(1000n);
    });

    it("reports a share of nothing as null, not as zero", async () => {
        // A term exists with `minShare` in its vault and nobody behind it (ADR `0042`). "0% held by
        // the largest" would read as "no concentration", which is a claim about a market that has
        // no participants.
        const {transport} = transportOf(shapeData([], "0"));
        const shape = await getTermShape(TERM, {transport});
        expect(shape.largestShareBps).toBeNull();
        expect(shape.topThreeShareBps).toBeNull();
    });

    it("counts a backer's OTHER positions, not all of them", async () => {
        // Every backer holds this term by definition, so the raw count is always at least one. An
        // earlier draft said "no position" where it meant "no other position".
        const {transport} = transportOf(
            shapeData([position("0xa", "3"), position("0xb", "2"), position("0xc", "1")], "6"),
        );
        const shape = await getTermShape(TERM, {transport});
        // 25, 3 and 1 held → 24, 2 and 0 others → median 2.
        expect(shape.medianBackerBreadth).toBe(2);
    });

    it("says when the breadth figure is a sample", async () => {
        // The indexer caps `positions` at 100 — lower than `atoms` and `triples` at 250. A median
        // over the hundred largest skews high, so the caller is told rather than left to assume.
        const many = Array.from({length: 3}, (_, index) => position(`0x${index}`, "1"));
        const {transport} = transportOf(shapeData(many, "3"));
        const sampled = await getTermShape(TERM, {transport, backerLimit: 3});
        expect(sampled.backersSampled).toBe(true);
        const whole = await getTermShape(TERM, {transport, backerLimit: 10});
        expect(whole.backersSampled).toBe(false);
    });

    it("clamps the backer limit at the positions cap, which is not the atoms cap", async () => {
        const {transport, seen} = transportOf(shapeData([], "0"));
        await getTermShape(TERM, {transport, backerLimit: 10_000});
        expect(seen[0]?.variables["limit"]).toBe(INTUITION_MAX_POSITIONS_PAGE);
        expect(INTUITION_MAX_POSITIONS_PAGE).toBe(100);
    });
});

describe("getTermActivity", () => {
    it("counts signals — deposits and redemptions — and reads the string the indexer sends", async () => {
        /**
         * Two findings in one assertion. `signal_stats_*.count` comes back as `"5"`, not `5` — a
         * reader accepting only `number` returned 0 for every bucket while `volume` read correctly,
         * the same class as the `market.totalAssets` defect `STATE.md` records. And it counts
         * **signals**, which are deposits *and* redemptions: 11 of them against 1 deposit on one
         * measured day. The field was called `deposits`, which was a second wrong name on the same
         * row.
         */
        const {transport} = transportOf({
            TermActivity: {
                rows: [
                    {bucket: "2026-10-19T00:00:00+00:00", count: "27", volume: "2483320164514511588177"},
                    {bucket: "2026-10-12T00:00:00+00:00", count: "34", volume: "41811101000000000000000"},
                ],
            },
        });
        const buckets = await getTermActivity(TERM, {transport, grain: "week"});
        expect(buckets.map((bucket) => bucket.signals)).toEqual([34, 27]);
    });

    it("returns oldest first, because a curve is read left to right", async () => {
        // The query orders descending so `limit` takes the most recent buckets rather than the first
        // ninety days of history; the reversal is what makes it a series.
        const {transport} = transportOf({
            TermActivity: {
                rows: [
                    {bucket: "2026-10-19T00:00:00+00:00", count: "1", volume: "1"},
                    {bucket: "2026-10-12T00:00:00+00:00", count: "1", volume: "1"},
                ],
            },
        });
        const buckets = await getTermActivity(TERM, {transport});
        expect(buckets.map((bucket) => bucket.bucket.slice(0, 10))).toEqual([
            "2026-10-12",
            "2026-10-19",
        ]);
    });
});

describe("getAccountHoldings", () => {
    it("reports deposits minus redemptions, and keeps the two markets apart", async () => {
        /**
         * Deposits alone would show 10 TRUST to somebody who has since taken 8 back out, and
         * `vault_type` separates pricing a **tool** from backing a **claim** about it (ADR `0039`).
         * A profile summing them would report one number covering two different things.
         */
        const {transport} = transportOf({
            AccountHoldings: {
                held: {aggregate: {count: 352, sum: {shares: "900"}}},
                deposited: {aggregate: {sum: {assets_after_fees: "1000"}}},
                redeemed: {aggregate: {sum: {assets: "250"}}},
                onAtoms: {aggregate: {count: 235}},
                onTriples: {aggregate: {count: 150}},
            },
        });
        const holdings = await getAccountHoldings(ACCOUNT, {transport});
        expect(holdings.netAssets).toBe(750n);
        expect(holdings.atomDeposits).toBe(235);
        expect(holdings.tripleDeposits).toBe(150);
    });
});

describe("getAccountActivity", () => {
    const activity = (rows: {deposits: unknown[]; redemptions: unknown[]; all: string; back: string}) => ({
        AccountActivity: {
            deposits: rows.deposits,
            redemptions: rows.redemptions,
            allDeposited: {aggregate: {sum: {assets_after_fees: rows.all}}},
            allRedeemed: {aggregate: {sum: {assets: rows.back}}},
        },
    });

    it("ends on the account's real net, not on a partial sum", async () => {
        /**
         * The correctness of the whole curve. The first draft folded the most recent rows and ran
         * the total from **zero**, so an account with more history than the window got a curve that
         * looked like it began at its hundredth-last deposit. `openingNet` is the all-time net minus
         * the window's, both from aggregates, so the last point is the account's actual position.
         *
         * Verified against mainnet 2026-10-21: last point 388,535.64 TRUST, `netAssets` 388,535.64.
         */
        const {transport} = transportOf(
            activity({
                deposits: [{created_at: "2026-10-18T00:54:54+00:00", assets_after_fees: "100"}],
                redemptions: [],
                all: "1000",
                back: "0",
            }),
        );
        const curve = await getAccountActivity(ACCOUNT, {transport});
        expect(curve.openingNet).toBe(900n);
        expect(curve.buckets.at(-1)?.cumulativeNet).toBe(1000n);
    });

    it("folds a day's deposits and redemptions into one bucket", async () => {
        const {transport} = transportOf(
            activity({
                deposits: [
                    {created_at: "2026-10-18T01:00:00+00:00", assets_after_fees: "100"},
                    {created_at: "2026-10-18T09:00:00+00:00", assets_after_fees: "50"},
                ],
                redemptions: [{created_at: "2026-10-18T12:00:00+00:00", assets: "30"}],
                all: "150",
                back: "30",
            }),
        );
        const curve = await getAccountActivity(ACCOUNT, {transport});
        expect(curve.buckets).toHaveLength(1);
        expect(curve.buckets[0]).toMatchObject({deposited: 150n, redeemed: 30n, cumulativeNet: 120n});
        expect(curve.openingNet).toBe(0n);
    });

    it("says when the window is a prefix of the history", async () => {
        const {transport} = transportOf(
            activity({
                deposits: [{created_at: "2026-10-18T00:00:00+00:00", assets_after_fees: "1"}],
                redemptions: [],
                all: "1",
                back: "0",
            }),
        );
        expect((await getAccountActivity(ACCOUNT, {transport, limit: 1})).truncated).toBe(true);
        expect((await getAccountActivity(ACCOUNT, {transport, limit: 5})).truncated).toBe(false);
    });
});
