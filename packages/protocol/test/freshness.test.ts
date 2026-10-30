import {describe, expect, it} from "vitest";

import {assessFreshness} from "../src/freshness.js";
import {fixture} from "./helpers.js";

function documentWith(freshness: unknown, lastUpdated?: string): unknown {
    return {
        assessment: {
            score: 50,
            ...(lastUpdated === undefined ? {} : {lastUpdated}),
            ...(freshness === undefined ? {} : {freshness}),
        },
    };
}

describe("assessFreshness", () => {
    it("reports fresh inside the declared window", () => {
        const verdict = assessFreshness(
            documentWith({validUntil: "2026-09-16T12:00:00Z"}, "2026-09-16T10:00:00Z"),
            new Date("2026-09-16T11:00:00Z"),
        );
        expect(verdict).toEqual({
            status: "fresh",
            validUntil: "2026-09-16T12:00:00Z",
            lastUpdated: "2026-09-16T10:00:00Z",
            ageSeconds: 3600,
            secondsRemaining: 3600,
        });
    });

    it("reports stale past it, with the overshoot", () => {
        const verdict = assessFreshness(
            documentWith({validUntil: "2026-09-16T12:00:00Z"}, "2026-09-16T10:00:00Z"),
            new Date("2026-09-16T12:00:30Z"),
        );
        expect(verdict).toEqual({
            status: "stale",
            validUntil: "2026-09-16T12:00:00Z",
            lastUpdated: "2026-09-16T10:00:00Z",
            ageSeconds: 7230,
            secondsStale: 30,
        });
    });

    it("treats the instant of expiry as still fresh", () => {
        const verdict = assessFreshness(
            documentWith({validUntil: "2026-09-16T12:00:00Z"}),
            new Date("2026-09-16T12:00:00Z"),
        );
        expect(verdict.status).toBe("fresh");
        if (verdict.status !== "fresh") return;
        expect(verdict.secondsRemaining).toBe(0);
        expect(verdict.ageSeconds).toBeNull();
    });

    it("says unknown — never fresh — when no window is declared", () => {
        expect(assessFreshness(documentWith(undefined))).toEqual({
            status: "unknown",
            reason: "assessment declares no freshness window",
        });
        expect(assessFreshness(documentWith({refreshIntervalSeconds: 60}))).toEqual({
            status: "unknown",
            reason: "freshness declares no validUntil",
        });
        expect(assessFreshness({})).toEqual({
            status: "unknown",
            reason: "document has no assessment object",
        });
    });

    it("says unknown when validUntil is not a parsable instant", () => {
        const verdict = assessFreshness(documentWith({validUntil: "tomorrow"}));
        expect(verdict.status).toBe("unknown");
        if (verdict.status !== "unknown") return;
        expect(verdict.reason).toContain("tomorrow");
    });

    it("holds a live provider to its own window", () => {
        // Deep3 declared validUntil 2026-09-12 on this document; read a day later
        // it is stale, and the connector says so rather than serving the score.
        const verdict = assessFreshness(
            fixture("deep3-2340.assessment.json"),
            new Date("2026-09-13T00:00:00Z"),
        );
        expect(verdict.status).toBe("stale");

        const earlier = assessFreshness(
            fixture("deep3-2340.assessment.json"),
            new Date("2026-09-11T00:00:00Z"),
        );
        expect(earlier.status).toBe("fresh");
    });
});
