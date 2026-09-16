import {describe, expect, it} from "vitest";

import {fetchAssessment, narrowAssessmentDocument} from "../src/assessment.js";
import type {FetchLike} from "../src/http.js";
import {fixture} from "./helpers.js";

const URL_OK = "https://provider.example/assessment.json";

function serving(body: string, init: ResponseInit = {}): FetchLike {
    return async () => new Response(body, {status: 200, ...init});
}

describe("fetchAssessment — success", () => {
    it("parses a live provider document", async () => {
        const result = await fetchAssessment(
            {resolverUrl: URL_OK},
            {fetch: serving(JSON.stringify(fixture("deep3-2340.assessment.json")))},
        );
        expect(result.status).toBe("ok");
        if (result.status !== "ok") return;
        expect(result.httpStatus).toBe(200);
        expect(result.document.provider?.id).toBe("deep3-labs");
        expect(result.document.score).toBeCloseTo(55.35);
        expect(result.document.signature?.signer).toBe(
            "0x27A6265e6daf8d9935A3031f2E7cDC4bDFbe2Ebe",
        );
        expect(result.document.freshness?.validUntil).toBe("2026-09-12T09:26:26.384Z");
        expect(result.document.evidence[0]?.type).toBe("feedback-summary");
    });

    it("keeps the raw document so the signature check hashes the served bytes", async () => {
        const raw = fixture("deep3-2340.assessment.json");
        const result = await fetchAssessment(
            {resolverUrl: URL_OK},
            {fetch: serving(JSON.stringify(raw))},
        );
        expect(result.status).toBe("ok");
        if (result.status !== "ok") return;
        expect(result.document.raw).toEqual(raw);
    });

    it("parses an unsigned document without inventing a signature", async () => {
        const result = await fetchAssessment(
            {resolverUrl: URL_OK},
            {fetch: serving(JSON.stringify(fixture("asterpay-2340.assessment.json")))},
        );
        expect(result.status).toBe("ok");
        if (result.status !== "ok") return;
        expect(result.document.signature).toBeNull();
        expect(result.document.riskLevel).toBe("low");
    });
});

describe("fetchAssessment — failures are typed results, never exceptions", () => {
    it("reports a claim with no resolver URL", async () => {
        await expect(fetchAssessment({resolverUrl: null})).resolves.toEqual({
            status: "error",
            url: null,
            error: {kind: "no-resolver-url"},
        });
    });

    it("reports an HTTP error", async () => {
        const result = await fetchAssessment(
            {resolverUrl: URL_OK},
            {
                fetch: async () =>
                    new Response("not found", {status: 404, statusText: "Not Found"}),
            },
        );
        expect(result).toEqual({
            status: "error",
            url: URL_OK,
            error: {kind: "http", status: 404, statusText: "Not Found"},
        });
    });

    it("reports a resolver serving HTML instead of JSON, with an excerpt", async () => {
        const html = "<!doctype html><html><body>Sign in to continue</body></html>";
        const result = await fetchAssessment(
            {resolverUrl: URL_OK},
            {fetch: serving(html, {headers: {"content-type": "text/html"}})},
        );
        expect(result.status).toBe("error");
        if (result.status !== "error" || result.error.kind !== "not-json") {
            throw new Error(`expected not-json, got ${JSON.stringify(result)}`);
        }
        expect(result.error.contentType).toBe("text/html");
        expect(result.error.excerpt).toContain("Sign in to continue");
    });

    it("reports malformed JSON", async () => {
        const result = await fetchAssessment({resolverUrl: URL_OK}, {fetch: serving("{oops")});
        expect(result.status).toBe("error");
        if (result.status !== "error") return;
        expect(result.error.kind).toBe("malformed");
    });

    it("reports a JSON body that is not an object", async () => {
        const result = await fetchAssessment({resolverUrl: URL_OK}, {fetch: serving("[1,2,3]")});
        expect(result.status).toBe("error");
        if (result.status !== "error" || result.error.kind !== "malformed") {
            throw new Error("expected malformed");
        }
        expect(result.error.message).toContain("not a JSON object");
    });

    it("reports a network failure", async () => {
        const result = await fetchAssessment(
            {resolverUrl: URL_OK},
            {
                fetch: async () => {
                    throw new Error("ECONNREFUSED");
                },
            },
        );
        expect(result).toEqual({
            status: "error",
            url: URL_OK,
            error: {kind: "network", message: "ECONNREFUSED"},
        });
    });

    it("bounds a hanging provider with the configured timeout", async () => {
        const hangingFetch: FetchLike = (_input, init) =>
            new Promise((_resolve, reject) => {
                init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
            });
        const result = await fetchAssessment(
            {resolverUrl: URL_OK},
            {fetch: hangingFetch, timeoutMs: 10},
        );
        expect(result).toEqual({
            status: "error",
            url: URL_OK,
            error: {kind: "timeout", timeoutMs: 10},
        });
    });
});

describe("narrowAssessmentDocument", () => {
    it("returns nulls rather than guesses for an empty document", () => {
        const narrowed = narrowAssessmentDocument({});
        expect(narrowed.agent).toBeNull();
        expect(narrowed.provider).toBeNull();
        expect(narrowed.score).toBeNull();
        expect(narrowed.dimensions).toBeNull();
        expect(narrowed.signature).toBeNull();
        expect(narrowed.evidence).toEqual([]);
    });

    it("accepts a numeric tokenId and normalises it to a string", () => {
        const narrowed = narrowAssessmentDocument({agent: {chainId: 8453, tokenId: 2340}});
        expect(narrowed.agent).toEqual({chainId: 8453, tokenId: "2340", registry: null});
    });

    it("drops non-numeric dimensions rather than coercing them", () => {
        const narrowed = narrowAssessmentDocument({
            assessment: {dimensions: {trust: 59.28, note: "high"}},
        });
        expect(narrowed.dimensions).toEqual({trust: 59.28});
    });
});
