import {keccak256, stringToBytes, type Hex} from "viem";
import {privateKeyToAccount} from "viem/accounts";
import {describe, expect, it} from "vitest";

import {
    hireDigest,
    hireReceiptMatches,
    hireReceiptTypedData,
    signHireReceipt,
    verifyHireReceipt,
    type HireReceipt,
    type SignedHireReceipt,
} from "../src/hire-receipt.js";

const AGENT = privateKeyToAccount(`0x${"11".repeat(32)}`);
const OTHER = privateKeyToAccount(`0x${"22".repeat(32)}`);
const signer = (account: typeof AGENT) => ({
    address: account.address,
    signTypedData: (data: ReturnType<typeof hireReceiptTypedData>) => account.signTypedData(data),
});

const payload = {job: "translate", text: "bonjour"};
const result = {text: "hello", tokens: 2};

const receipt: HireReceipt = {
    version: 1,
    agentRegistry: "eip155:13579:0xC165A2ADc0000000000000000000000000000001",
    agentId: "2",
    requester: OTHER.address,
    payment: `0x${"ab".repeat(32)}`,
    paid: "1000000000000000",
    requestHash: hireDigest(payload),
    resultHash: hireDigest(result),
    issuedAt: 1_793_000_000,
};

async function signed(
    over: Partial<HireReceipt> = {},
    chainId = 13579,
): Promise<SignedHireReceipt> {
    return signHireReceipt({...receipt, ...over}, chainId, signer(AGENT));
}

describe("hireDigest", () => {
    it("is keccak256 over RFC 8785, so key order does not change it", () => {
        expect(hireDigest({b: 1, a: 2})).toBe(hireDigest({a: 2, b: 1}));
        expect(hireDigest({a: 2, b: 1})).toBe(keccak256(stringToBytes('{"a":2,"b":1}')));
    });

    it("hashes an absent payload as null", () => {
        expect(hireDigest(undefined)).toBe(hireDigest(null));
    });
});

describe("verifyHireReceipt", () => {
    it("recovers the agent that signed", async () => {
        expect(await verifyHireReceipt(await signed())).toEqual({
            status: "valid",
            signer: AGENT.address,
        });
    });

    it("an unregistered agent signs with an empty registry and id 0", async () => {
        const verdict = await verifyHireReceipt(await signed({agentRegistry: "", agentId: "0"}));
        expect(verdict.status).toBe("valid");
    });

    it("a receipt moved to another chain no longer recovers the agent", async () => {
        const moved = {...(await signed()), chainId: 1155};
        expect((await verifyHireReceipt(moved)).status).toBe("mismatch");
    });

    it.each([
        ["payment", {payment: `0x${"cd".repeat(32)}` as Hex}],
        ["paid", {paid: "2000000000000000"}],
        ["requester", {requester: AGENT.address}],
        ["agentId", {agentId: "3"}],
        ["result", {resultHash: hireDigest({text: "goodbye"})}],
        ["issuedAt", {issuedAt: 1_793_000_001}],
    ])("changing %s after signing breaks it", async (_field, change) => {
        const original = await signed();
        const tampered = {...original, receipt: {...original.receipt, ...change}};
        expect((await verifyHireReceipt(tampered)).status).toBe("mismatch");
    });

    it("an envelope that names another signer is a mismatch, not a valid receipt", async () => {
        const verdict = await verifyHireReceipt({...(await signed()), agent: OTHER.address});
        expect(verdict).toEqual({
            status: "mismatch",
            declared: OTHER.address,
            recovered: AGENT.address,
        });
    });

    it.each([
        ["an unknown version", {version: 2}, /version/],
        ["a registry that is not ERC-8004's form", {agentRegistry: "13579:0xabc"}, /agentRegistry/],
        ["an id without a registry", {agentRegistry: "", agentId: "5"}, /without an agentRegistry/],
        ["a short payment hash", {payment: "0xab" as Hex}, /payment/],
        ["a paid amount that is not decimal", {paid: "1e18"}, /paid/],
    ])("%s is malformed, with the reason", async (_name, change, reason) => {
        const original = await signed();
        const verdict = await verifyHireReceipt({
            ...original,
            receipt: {...original.receipt, ...change},
        });
        expect(verdict.status).toBe("malformed");
        expect(verdict.status === "malformed" && verdict.reason).toMatch(reason);
    });
});

describe("hireReceiptMatches", () => {
    it("is true for the exchange it was signed over, in any key order", () => {
        expect(hireReceiptMatches(receipt, {text: "bonjour", job: "translate"}, result)).toBe(true);
    });

    it("is false for another payload or another result", () => {
        expect(hireReceiptMatches(receipt, {job: "other"}, result)).toBe(false);
        expect(hireReceiptMatches(receipt, payload, {text: "hi"})).toBe(false);
    });
});
