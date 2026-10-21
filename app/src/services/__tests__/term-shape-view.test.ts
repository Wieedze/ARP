import {describe, expect, it} from "vitest";
import type {TermShape} from "@arp-protocol/core";

import {buildTermShapeView} from "../term-shape-view";

const shape = (overrides: Partial<TermShape> = {}): TermShape => ({
    termId: `0x${"ab".repeat(32)}`,
    curveId: 1,
    positionCount: 12,
    totalShares: 1000n,
    largestShareBps: 3120,
    topThreeShareBps: 6980,
    firstPosition: "2025-11-01T18:56:57+00:00",
    lastPosition: "2026-10-06T08:17:36+00:00",
    medianBackerBreadth: 12,
    backersRead: 12,
    backersSampled: false,
    ...overrides,
});

describe("buildTermShapeView", () => {
    it("turns the concentration into the sentence a count cannot say", () => {
        // Measured on mainnet 2026-10-21: the busiest term has 34,421 positions and its largest
        // single one holds 31.2% of the weight. The count reads as a crowd; this says otherwise.
        const view = buildTermShapeView(shape());
        expect(view.concentration).toBe("31.2% held by one account");
        expect(view.isDominated).toBe(false);
    });

    it("flags one account holding more than half", () => {
        // Half, because that is when one account can move the figure alone. `isDominated` and not
        // `isRisky`: the first reads the number, the second is an opinion about it.
        expect(buildTermShapeView(shape({largestShareBps: 5001})).isDominated).toBe(true);
        expect(buildTermShapeView(shape({largestShareBps: 5000})).isDominated).toBe(false);
    });

    it("says nothing about a share of nothing", () => {
        // A term exists with `minShare` in its vault and nobody behind it (ADR `0042`). "0% held by
        // one account" would read as "no concentration" over a market with no participants.
        const empty = buildTermShapeView(
            shape({largestShareBps: null, topThreeShareBps: null, positionCount: 0}),
        );
        expect(empty.concentration).toBeNull();
        expect(empty.isDominated).toBe(false);
    });

    it("reads the span over which BACKERS arrived, at month precision", () => {
        expect(buildTermShapeView(shape()).span).toBe("Nov 2025 → Oct 2026");
    });

    it("flags backers who all opened on the same day", () => {
        /**
         * The cheapest sybil signature there is: one script, one window. Not forbidden, just said.
         *
         * **Backers opening, not deposits landing.** A position's timestamp is when an account
         * opened its holding and does not move when it deposits again — measured 24 days apart on
         * the busiest mainnet term. The copy said "every deposit landed the same day" and could not
         * have known that.
         */
        const sameDay = buildTermShapeView(
            shape({
                firstPosition: "2026-10-18T01:00:00+00:00",
                lastPosition: "2026-10-18T23:00:00+00:00",
            }),
        );
        expect(sameDay.arrivedTogether).toBe(true);
        expect(sameDay.span).toBe("all on 2026-10-18");
    });

    it("does not flag a single backer as arriving together", () => {
        // One backer trivially opens on one day. Calling that a cluster would flag every new claim.
        const one = buildTermShapeView(
            shape({
                positionCount: 1,
                firstPosition: "2026-10-18T01:00:00+00:00",
                lastPosition: "2026-10-18T01:00:00+00:00",
            }),
        );
        expect(one.arrivedTogether).toBe(false);
    });

    it("says 'other' positions, because a backer holds this one by definition", () => {
        expect(buildTermShapeView(shape({medianBackerBreadth: 12})).breadth).toBe(
            "half its backers hold 12+ other positions",
        );
        expect(buildTermShapeView(shape({medianBackerBreadth: 0})).breadth).toBe(
            "half its backers hold nothing else",
        );
    });

    it("carries the sample flag so a skewed median is not read as the whole set", () => {
        // `positions` caps at 100 rows, so for a busier term the median is over the largest hundred
        // and skews high.
        expect(buildTermShapeView(shape({backersSampled: true})).breadthSampled).toBe(true);
    });
});
