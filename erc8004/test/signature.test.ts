import {describe, expect, it} from "vitest";

import {isRecord, readPath} from "../src/json.js";
import {
    DEFAULT_SIGNATURE_STRATEGIES,
    isConfirmedForProvider,
    providerIdCaip19LowercaseStrategy,
    providerIdCaip19Strategy,
    providerNameCaip19Strategy,
    providerUrlCaip19Strategy,
    verifyAssessmentSignature,
} from "../src/signature.js";
import {fixture} from "./helpers.js";

/** The signer Deep3 Labs declares on every assessment document it publishes. */
const DEEP3_SIGNER = "0x27A6265e6daf8d9935A3031f2E7cDC4bDFbe2Ebe";

const SIGNED_DOCUMENTS = [
    "deep3-2340.assessment.json",
    "deep3-6649.assessment.json",
    "deep3-1380.assessment.json",
] as const;

function clone(name: string): Record<string, unknown> {
    const document = fixture(name);
    if (!isRecord(document)) throw new Error(`fixture ${name} is not an object`);
    return structuredClone(document);
}

describe("verifyAssessmentSignature — verified", () => {
    for (const name of SIGNED_DOCUMENTS) {
        it(`recovers the declared signer from the live ${name}`, async () => {
            const verdict = await verifyAssessmentSignature(fixture(name));
            expect(verdict.status).toBe("verified");
            if (verdict.status !== "verified") return;
            expect(verdict.recovered).toBe(DEEP3_SIGNER);
            expect(verdict.declaredSigner).toBe(DEEP3_SIGNER);
            expect(verdict.strategyId).toBe(providerIdCaip19Strategy.id);
        });
    }

    it("is reached by the strategy confirmed against this very provider", () => {
        expect(providerIdCaip19Strategy.confirmedProviderIds).toEqual(["deep3-labs"]);
        expect(isConfirmedForProvider(providerIdCaip19Strategy, fixture(SIGNED_DOCUMENTS[0]))).toBe(
            true,
        );
        const unconfirmed = DEFAULT_SIGNATURE_STRATEGIES.filter(
            (strategy) => strategy.confirmedProviderIds.length === 0,
        );
        expect(unconfirmed.length).toBeGreaterThan(0);
    });

    it("is available to a provider we have confirmed nothing about, when the signature is simply correct", async () => {
        // Vouching for a correct signature costs nobody anything, so `verified`
        // is not gated on confirmation the way `mismatch` is.
        const document = clone("deep3-2340.assessment.json");
        const verdict = await verifyAssessmentSignature(document, {
            strategies: [{...providerIdCaip19Strategy, confirmedProviderIds: []}],
        });
        expect(verdict.status).toBe("verified");
    });
});

describe("verifyAssessmentSignature — mismatch", () => {
    it("flags a tampered score", async () => {
        const document = clone("deep3-2340.assessment.json");
        const assessment = readPath(document, ["assessment"]);
        if (!isRecord(assessment)) throw new Error("no assessment object");
        assessment["score"] = 99;

        const verdict = await verifyAssessmentSignature(document);
        expect(verdict.status).toBe("mismatch");
        if (verdict.status !== "mismatch") return;
        expect(verdict.declaredSigner).toBe(DEEP3_SIGNER);
        expect(verdict.recovered).not.toBe(DEEP3_SIGNER);
        expect(verdict.strategyId).toBe(providerIdCaip19Strategy.id);
    });

    it("flags a swapped signer", async () => {
        const document = clone("deep3-2340.assessment.json");
        const signature = readPath(document, ["assessment", "signature"]);
        if (!isRecord(signature)) throw new Error("no signature block");
        signature["signer"] = "0x000000000000000000000000000000000000dEaD";

        const verdict = await verifyAssessmentSignature(document);
        expect(verdict.status).toBe("mismatch");
        if (verdict.status !== "mismatch") return;
        expect(verdict.recovered).toBe(DEEP3_SIGNER);
    });

    it("flags a tampered field the signature never covered being added", async () => {
        const document = clone("deep3-2340.assessment.json");
        document["injected"] = "not signed";
        const verdict = await verifyAssessmentSignature(document);
        expect(verdict.status).toBe("mismatch");
    });

    it("is unreachable for a provider whose signing scheme was never confirmed", async () => {
        // The regression test for the false-accusation bug. This document has
        // the same three field names as Deep3's, so the confirmed strategy
        // builds cleanly and recovery returns *some* address — but nothing has
        // ever been established about how this provider encodes `agent`, so the
        // recovered address is meaningless and `mismatch` would be a public
        // accusation against someone who may have done nothing wrong.
        const document = clone("deep3-2340.assessment.json");
        const provider = readPath(document, ["provider"]);
        if (!isRecord(provider)) throw new Error("no provider block");
        provider["id"] = "some-other-provider";

        const verdict = await verifyAssessmentSignature(document);
        expect(verdict.status).toBe("unverified");
        if (verdict.status !== "unverified") return;
        expect(verdict.reason).toContain("no strategy is confirmed for provider");
        expect(verdict.reason).toContain("some-other-provider");
        // The evidence is still recorded: every strategy applied and recovered
        // an address. We simply decline to draw a conclusion from it.
        expect(verdict.attempts.every((attempt) => attempt.recovered !== null)).toBe(true);
        expect(verdict.attempts.every((attempt) => !attempt.confirmedForProvider)).toBe(true);
    });

    it("names the missing provider.id rather than accusing an anonymous document", async () => {
        const document = clone("deep3-2340.assessment.json");
        const provider = readPath(document, ["provider"]);
        if (!isRecord(provider)) throw new Error("no provider block");
        delete provider["id"];

        const verdict = await verifyAssessmentSignature(document);
        expect(verdict.status).toBe("unverified");
        if (verdict.status !== "unverified") return;
        expect(verdict.reason).toContain("declares no provider.id");
    });
});

describe("verifyAssessmentSignature — unverified", () => {
    it("returns unverified, not an error, for a document with no signature", async () => {
        const verdict = await verifyAssessmentSignature(fixture("asterpay-2340.assessment.json"));
        expect(verdict.status).toBe("unverified");
        if (verdict.status !== "unverified") return;
        expect(verdict.reason).toContain("no signature block");
        expect(verdict.declaredSigner).toBeNull();
    });

    it("rejects an unsupported algorithm without attempting recovery", async () => {
        const document = clone("deep3-2340.assessment.json");
        const signature = readPath(document, ["assessment", "signature"]);
        if (!isRecord(signature)) throw new Error("no signature block");
        signature["alg"] = "ed25519";

        const verdict = await verifyAssessmentSignature(document);
        expect(verdict.status).toBe("unverified");
        if (verdict.status !== "unverified") return;
        expect(verdict.reason).toContain("ed25519");
        expect(verdict.attempts).toHaveLength(0);
    });

    it("rejects an unsupported canonicalisation", async () => {
        const document = clone("deep3-2340.assessment.json");
        const payload = readPath(document, ["assessment", "signature", "payload"]);
        if (!isRecord(payload)) throw new Error("no payload block");
        payload["canonicalization"] = "JSON.stringify";

        const verdict = await verifyAssessmentSignature(document);
        expect(verdict.status).toBe("unverified");
        if (verdict.status !== "unverified") return;
        expect(verdict.reason).toContain("JSON.stringify");
    });

    it("refuses to hash a document whose declared exclusion path is absent", async () => {
        const document = clone("deep3-2340.assessment.json");
        const payload = readPath(document, ["assessment", "signature", "payload"]);
        if (!isRecord(payload)) throw new Error("no payload block");
        payload["excludes"] = ["assessment.signature", "assessment.nonexistent"];

        const verdict = await verifyAssessmentSignature(document);
        expect(verdict.status).toBe("unverified");
        if (verdict.status !== "unverified") return;
        expect(verdict.reason).toContain("could not reconstruct");
    });

    it("says unverified — not mismatch — when no strategy fits the struct shape", async () => {
        const document = clone("deep3-2340.assessment.json");
        const eip712 = readPath(document, ["assessment", "signature", "eip712"]);
        if (!isRecord(eip712)) throw new Error("no eip712 block");
        eip712["types"] = {
            FeedbackTrustAssessment: [
                {name: "somethingElse", type: "string"},
                {name: "contentHash", type: "bytes32"},
            ],
        };

        const verdict = await verifyAssessmentSignature(document);
        expect(verdict.status).toBe("unverified");
        if (verdict.status !== "unverified") return;
        expect(verdict.reason).toContain("no strategy is confirmed for provider");
        expect(verdict.attempts.every((attempt) => attempt.recovered === null)).toBe(true);
        expect(verdict.attempts.map((attempt) => attempt.strategyId)).toEqual(
            DEFAULT_SIGNATURE_STRATEGIES.map((strategy) => strategy.id),
        );
    });

    it("rejects a signature value that is not hex", async () => {
        const document = clone("deep3-2340.assessment.json");
        const signature = readPath(document, ["assessment", "signature"]);
        if (!isRecord(signature)) throw new Error("no signature block");
        signature["value"] = "not-hex";

        const verdict = await verifyAssessmentSignature(document);
        expect(verdict.status).toBe("unverified");
        if (verdict.status !== "unverified") return;
        expect(verdict.reason).toContain("not hex");
    });

    it("rejects a document with no valid signer address", async () => {
        const document = clone("deep3-2340.assessment.json");
        const signature = readPath(document, ["assessment", "signature"]);
        if (!isRecord(signature)) throw new Error("no signature block");
        signature["signer"] = "nonsense";

        const verdict = await verifyAssessmentSignature(document);
        expect(verdict.status).toBe("unverified");
        if (verdict.status !== "unverified") return;
        expect(verdict.reason).toContain("no valid signer");
    });

    it("rejects a malformed eip712 block", async () => {
        const document = clone("deep3-2340.assessment.json");
        const signature = readPath(document, ["assessment", "signature"]);
        if (!isRecord(signature)) throw new Error("no signature block");
        delete signature["eip712"];

        const verdict = await verifyAssessmentSignature(document);
        expect(verdict.status).toBe("unverified");
        if (verdict.status !== "unverified") return;
        expect(verdict.reason).toContain("eip712");
    });

    it("treats a non-object input as unverified rather than throwing", async () => {
        await expect(verifyAssessmentSignature("<html>nope</html>")).resolves.toMatchObject({
            status: "unverified",
        });
        await expect(verifyAssessmentSignature(null)).resolves.toMatchObject({
            status: "unverified",
        });
    });
});

describe("the speculative strategies", () => {
    const input = () => {
        const document = fixture("deep3-2340.assessment.json");
        return {
            document,
            contentHash: `0x${"11".repeat(32)}` as const,
            fields: [
                {name: "provider", type: "string"},
                {name: "agent", type: "string"},
                {name: "contentHash", type: "bytes32"},
            ],
        };
    };

    it("build the near variants they are named for", () => {
        expect(providerIdCaip19LowercaseStrategy.build(input())).toMatchObject({
            provider: "deep3-labs",
            agent: "eip155:8453/erc721:0x8004a169fb4a3325136eb29fa0ceb6d2e539a432/2340",
        });
        expect(providerNameCaip19Strategy.build(input())).toMatchObject({provider: "Deep3 Labs"});
        expect(providerUrlCaip19Strategy.build(input())).toMatchObject({
            provider: "https://deep3.ai",
        });
    });

    it("do not apply when the struct shape is different", () => {
        const wrongShape = {...input(), fields: [{name: "digest", type: "bytes32"}]};
        for (const strategy of DEFAULT_SIGNATURE_STRATEGIES) {
            expect(strategy.build(wrongShape)).toBeNull();
        }
    });

    it("do not apply when the document carries no agent or provider block", () => {
        const bare = {...input(), document: {}};
        for (const strategy of DEFAULT_SIGNATURE_STRATEGIES) {
            expect(strategy.build(bare)).toBeNull();
        }
    });

    it("are confirmed against nobody, so none of them can produce a mismatch", () => {
        for (const strategy of [
            providerIdCaip19LowercaseStrategy,
            providerNameCaip19Strategy,
            providerUrlCaip19Strategy,
        ]) {
            expect(strategy.confirmedProviderIds).toEqual([]);
            expect(isConfirmedForProvider(strategy, fixture(SIGNED_DOCUMENTS[0]))).toBe(false);
        }
    });
});

describe("verifyAssessmentSignature — strategies are swappable", () => {
    it("reports unverified when the caller supplies only strategies that cannot apply", async () => {
        const verdict = await verifyAssessmentSignature(fixture("deep3-2340.assessment.json"), {
            strategies: [{id: "never-applies", confirmedProviderIds: [], build: () => null}],
        });
        expect(verdict.status).toBe("unverified");
        if (verdict.status !== "unverified") return;
        expect(verdict.attempts).toEqual([
            {
                strategyId: "never-applies",
                confirmedForProvider: false,
                recovered: null,
                error: "strategy does not apply to this document shape",
            },
        ]);
    });

    it("records a recovery error against the strategy that produced it", async () => {
        const verdict = await verifyAssessmentSignature(fixture("deep3-2340.assessment.json"), {
            strategies: [
                {
                    id: "bad-values",
                    confirmedProviderIds: [],
                    build: () => ({provider: "x", agent: "y", contentHash: "not-a-hash"}),
                },
            ],
        });
        expect(verdict.status).toBe("unverified");
        if (verdict.status !== "unverified") return;
        expect(verdict.attempts[0]?.error).toBeTruthy();
    });
});
