import {describe, expect, it, vi} from "vitest";
import type {TermShape} from "@arp-protocol/core";

import {termShapeQueryKey, termShapeQueryOptions} from "../use-term-shape";

const TERM = `0x${"ab".repeat(32)}`;

const shape = (curveId: number): TermShape => ({
    termId: TERM,
    curveId,
    positionCount: 3,
    totalShares: 1000n,
    largestShareBps: 3120,
    topThreeShareBps: 6980,
    firstPosition: "2025-11-01T18:56:57+00:00",
    lastPosition: "2026-10-06T08:17:36+00:00",
    medianBackerBreadth: 12,
    backersRead: 3,
    backersSampled: false,
});

const reads = () => ({
    shape: vi.fn(async (_termId: string, config?: {curveId?: number}) =>
        shape(config?.curveId ?? 1),
    ),
    activity: vi.fn(async () => [
        {bucket: "2026-10-12T00:00:00+00:00", signals: 34, volume: 1n},
        {bucket: "2026-10-19T00:00:00+00:00", signals: 27, volume: 2n},
    ]),
});

describe("termShapeQueryKey", () => {
    it("keys on the term and the curve", () => {
        expect(termShapeQueryKey(TERM, 1)).not.toEqual(termShapeQueryKey(TERM, 2));
        expect(termShapeQueryKey(TERM, 1)).not.toEqual(termShapeQueryKey("0xdead", 1));
    });
});

describe("termShapeQueryOptions", () => {
    it("does not read before the term is known", () => {
        // The caller passes `null` until the stake session resolves the curve: a figure that
        // silently redraws with different numbers is worse than one that arrives late.
        expect(termShapeQueryOptions(null, 1, reads() as never).enabled).toBe(false);
        expect(termShapeQueryOptions(TERM, 1, reads() as never).enabled).toBe(true);
    });

    it("reads both halves at the curve it was asked for, and carries it into the view", async () => {
        const read = reads();
        const options = termShapeQueryOptions(TERM, 2, read as never);
        const insight = await options.queryFn();

        expect(read.shape).toHaveBeenCalledWith(TERM, expect.objectContaining({curveId: 2}));
        expect(read.activity).toHaveBeenCalledWith(
            TERM,
            expect.objectContaining({curveId: 2, grain: "week"}),
        );
        // Every reading is curve-scoped, so the view carries the curve for the panel to name.
        expect(insight.shape.curveId).toBe(2);
    });

    it("maps the shape rather than handing the raw read to the page", async () => {
        const insight = await termShapeQueryOptions(TERM, 1, reads() as never).queryFn();
        expect(insight.shape.concentration).toBe("31.2% held by one account");
        expect(insight.curve).toHaveLength(2);
    });
});
