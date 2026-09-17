import {describe, expect, it} from "vitest";
import {parseEther} from "viem";

import {
    agentRegistryExplorerUrl,
    describeFetchError,
    describeFreshness,
    describeSignature,
    describeStakers,
    formatDuration,
    formatTrust,
    truncateMiddle,
} from "../trust-format";

import {marketSide, MISMATCH, UNVERIFIED, VERIFIED, STALE, FRESH} from "./trust-fixtures";

describe("formatTrust", () => {
    it("keeps whole and fractional amounts readable", () => {
        expect(formatTrust(0n)).toBe("0");
        expect(formatTrust(parseEther("1"))).toBe("1");
        expect(formatTrust(parseEther("0.05"))).toBe("0.05");
        expect(formatTrust(987_500_001_000_000n)).toBe("0.0009875");
    });

    it("never rounds a live dust position down to zero", () => {
        expect(formatTrust(1_000_000n)).toBe("<0.00000001");
    });
});

describe("truncateMiddle", () => {
    it("leaves short values alone and elides long ones", () => {
        expect(truncateMiddle("0x1234", 10, 6)).toBe("0x1234");
        expect(truncateMiddle(`0x${"ab".repeat(32)}`, 10, 6)).toBe("0xabababab…ababab");
    });
});

describe("formatDuration", () => {
    it("picks the largest unit that fits and gets the plural right", () => {
        expect(formatDuration(345_600)).toBe("4 days");
        expect(formatDuration(86_400)).toBe("1 day");
        expect(formatDuration(3_600)).toBe("1 hour");
        expect(formatDuration(7_200)).toBe("2 hours");
        expect(formatDuration(90)).toBe("1 minute");
        expect(formatDuration(30)).toBe("30 seconds");
        expect(formatDuration(1)).toBe("1 second");
        expect(formatDuration(-5)).toBe("0 seconds");
    });
});

describe("describeFreshness", () => {
    it("says how far past its own declared window a stale document is", () => {
        const copy = describeFreshness(STALE);
        expect(copy.tone).toBe("stale");
        expect(copy.label).toBe("Stale");
        expect(copy.detail).toContain("4 days past the window it declared");
        expect(copy.detail).toContain("2026-09-12T09:26:26.384Z");
    });

    it("says how much of the window is left when a document is fresh", () => {
        const copy = describeFreshness(FRESH);
        expect(copy.tone).toBe("fresh");
        expect(copy.detail).toContain("3 minutes left");
    });

    it("relays the reason when there is no window to enforce", () => {
        const copy = describeFreshness({status: "unknown", reason: "no document to check"});
        expect(copy.tone).toBe("unknown");
        expect(copy.detail).toBe("no document to check");
    });
});

describe("describeSignature", () => {
    it("never upgrades an unverified verdict", () => {
        const copy = describeSignature(UNVERIFIED);
        expect(copy.tone).toBe("unverified");
        expect(copy.label).toBe("Not verified");
        expect(copy.detail).toBe("no signature block at assessment.signature");
    });

    it("names both addresses on a mismatch", () => {
        const copy = describeSignature(MISMATCH);
        expect(copy.tone).toBe("mismatch");
        expect(copy.label).toBe("Signature mismatch");
        expect(copy.detail).toContain("0x27A626");
        expect(copy.detail).toContain("00dEaD");
    });

    it("says exactly what verified means and nothing more", () => {
        const copy = describeSignature(VERIFIED);
        expect(copy.tone).toBe("verified");
        expect(copy.detail).toContain("recovers to the signer the document names");
    });
});

describe("describeStakers", () => {
    it("always pairs the position count with the distinct-staker count", () => {
        expect(describeStakers(marketSide({positionCount: null}))).toBe(
            "position count not reported by the indexer",
        );
        expect(describeStakers(marketSide({positionCount: 0}))).toBe(
            "no positions · no distinct stakers",
        );
        expect(describeStakers(marketSide({positionCount: 1}))).toBe(
            "1 position · 1 distinct staker",
        );
        expect(describeStakers(marketSide({positionCount: 4}))).toBe(
            "4 positions · 4 distinct stakers",
        );
    });
});

describe("agentRegistryExplorerUrl", () => {
    it("links the chains it knows and refuses to guess the others", () => {
        expect(agentRegistryExplorerUrl(8453, "0xabc", "2340")).toBe(
            "https://basescan.org/token/0xabc?a=2340",
        );
        expect(agentRegistryExplorerUrl(56, "0xabc", "17")).toBe(
            "https://bscscan.com/token/0xabc?a=17",
        );
        expect(agentRegistryExplorerUrl(1337, "0xabc", "1")).toBeNull();
    });
});

describe("describeFetchError", () => {
    it("turns each failure kind into something a reader can act on", () => {
        expect(describeFetchError({kind: "http", status: 404, statusText: "Not Found"})).toContain(
            "HTTP 404 Not Found",
        );
        expect(
            describeFetchError({kind: "not-json", contentType: "text/html", excerpt: "<html>"}),
        ).toContain("text/html");
        expect(describeFetchError({kind: "not-json", contentType: null, excerpt: ""})).toContain(
            "an unknown content type",
        );
        expect(describeFetchError({kind: "timeout", timeoutMs: 8000})).toContain("8000 ms");
        expect(describeFetchError({kind: "no-resolver-url"})).toContain("no resolver URL");
        expect(describeFetchError({kind: "network", message: "fetch failed"})).toContain(
            "fetch failed",
        );
        expect(describeFetchError({kind: "malformed", message: "not an object"})).toContain(
            "not an object",
        );
        expect(describeFetchError({kind: "skipped"})).toContain("not fetched");
    });
});
