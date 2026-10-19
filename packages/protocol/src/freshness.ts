import {isRecord, readPath, readString} from "./json.js";
import type {FreshnessVerdict} from "./types.js";

function parseInstant(value: string | null): number | null {
    if (value === null) return null;
    const millis = Date.parse(value);
    return Number.isNaN(millis) ? null : millis;
}

/**
 * Hold a provider to the validity window it declared for itself.
 *
 * Providers publish `assessment.freshness.validUntil` and consumers cache
 * against it. A document past that instant is `stale` — it is still returned,
 * with the overshoot in seconds, so a caller can decide; it is never relabelled
 * as current. A document that declares no window is `unknown`, which is a
 * different and weaker statement than `fresh`.
 *
 * Pure: takes the parsed document and an optional clock, touches nothing else.
 */
export function assessFreshness(document: unknown, now: Date = new Date()): FreshnessVerdict {
    const assessment = readPath(document, ["assessment"]);
    if (!isRecord(assessment)) {
        return {status: "unknown", reason: "document has no assessment object"};
    }

    const freshness = readPath(assessment, ["freshness"]);
    if (!isRecord(freshness)) {
        return {status: "unknown", reason: "assessment declares no freshness window"};
    }

    const validUntilRaw = readString(freshness, "validUntil");
    if (validUntilRaw === null) {
        return {status: "unknown", reason: "freshness declares no validUntil"};
    }

    const validUntil = parseInstant(validUntilRaw);
    if (validUntil === null) {
        return {
            status: "unknown",
            reason: `validUntil is not a parsable instant: ${validUntilRaw}`,
        };
    }

    const lastUpdated = readString(assessment, "lastUpdated");
    const lastUpdatedAt = parseInstant(lastUpdated);
    const nowMillis = now.getTime();
    const ageSeconds =
        lastUpdatedAt === null ? null : Math.floor((nowMillis - lastUpdatedAt) / 1000);

    const deltaSeconds = Math.floor((validUntil - nowMillis) / 1000);
    if (deltaSeconds >= 0) {
        return {
            status: "fresh",
            validUntil: validUntilRaw,
            lastUpdated,
            ageSeconds,
            secondsRemaining: deltaSeconds,
        };
    }
    return {
        status: "stale",
        validUntil: validUntilRaw,
        lastUpdated,
        ageSeconds,
        secondsStale: -deltaSeconds,
    };
}
