import {getAddress, hashTypedData, keccak256, stringToBytes, type Address, type Hex} from "viem";
import {privateKeyToAccount} from "viem/accounts";
import {describe, expect, it} from "vitest";

import {
    HIRE_RECEIPT_VERSION,
    hireDigest,
    hireReceiptIsFor,
    hireReceiptMatches,
    hireReceiptTypedData,
    hireReceiptV1TypedData,
    signHireReceipt,
    verifyHireReceipt,
    type HireReceipt,
    type HireReceiptV1,
    type SignedHireReceipt,
    type SignedHireReceiptV1,
} from "../src/hire-receipt.js";

const AGENT = privateKeyToAccount(`0x${"11".repeat(32)}`);
const OTHER = privateKeyToAccount(`0x${"22".repeat(32)}`);
const signer = (account: typeof AGENT) => ({
    address: account.address,
    signTypedData: (data: ReturnType<typeof hireReceiptTypedData>) => account.signTypedData(data),
});

/** Two verifiers: an enforcer deployment and the sponsoring service's own address. */
const ENFORCER: Address = getAddress("0x00000000000000000000000000000000000e4f04");
const SERVICE: Address = getAddress("0x5000000000000000000000000000000000000005");

const payload = {job: "translate", text: "bonjour"};
const result = {text: "hello", tokens: 2};

const receipt: HireReceipt = {
    version: 2,
    agentRegistry: "eip155:13579:0xC165A2ADc0000000000000000000000000000001",
    agentId: "2",
    requester: OTHER.address,
    payment: `0x${"ab".repeat(32)}`,
    paid: "1000000000000000",
    requestHash: hireDigest(payload),
    resultHash: hireDigest(result),
    issuedAt: 1_793_000_000,
    termId: `0x${"7e".repeat(32)}`,
    expiresAt: 1_793_086_400,
};

async function signed(
    over: Partial<HireReceipt> = {},
    chainId = 13579,
    verifyingContract: Address = ENFORCER,
): Promise<SignedHireReceipt> {
    return signHireReceipt({...receipt, ...over}, {chainId, verifyingContract}, signer(AGENT));
}

/** A v1 receipt, signed the way the node signed before task 44. */
async function signedV1(): Promise<SignedHireReceiptV1> {
    const {termId: _termId, expiresAt: _expiresAt, ...fields} = receipt;
    const v1: HireReceiptV1 = {...fields, version: 1};
    return {
        format: "eip712",
        receipt: v1,
        chainId: 13579,
        agent: AGENT.address,
        signature: await AGENT.signTypedData(hireReceiptV1TypedData(v1, 13579)),
    };
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

/**
 * The cross-implementation vectors. `contracts/test/enforcers/ReceiptEnforcer.t.sol` checks the
 * same digests and signatures in Solidity, so a drift in the struct, its field order or the domain
 * fails on both sides, not only on the contract's. Anvil's publicly documented account #0, a test
 * key that holds nothing.
 */
describe("the vector ReceiptEnforcer.t.sol holds", () => {
    const ANVIL_0 = privateKeyToAccount(
        "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
    );
    const fields = {
        agentRegistry: "eip155:13579:0x8004a169fb4a3325136eb29fa0ceb6d2e539a432",
        agentId: "42",
        requester: getAddress("0x00000000000000000000000000000000000006ee"),
        payment: `0x${"11".repeat(32)}` as Hex,
        paid: "1000000000000000",
        requestHash: `0x${"22".repeat(32)}` as Hex,
        resultHash: `0x${"33".repeat(32)}` as Hex,
        issuedAt: 1_700_000_000,
    };

    it("v2: test_viemVector_digestAndSignatureVerify, verifier 0x…5Ec044", async () => {
        const v2: HireReceipt = {
            ...fields,
            version: 2,
            termId: `0x${"0".repeat(60)}7e57`,
            expiresAt: 1_700_086_400,
        };
        const verifyingContract = getAddress("0x00000000000000000000000000000000005ec044");
        expect(hashTypedData(hireReceiptTypedData(v2, 13579, verifyingContract))).toBe(
            "0xa97f63e546c51ff2f0511bf52aa6c0ccebef42c44b27205cf82f8d569ece4bb7",
        );
        const signedV2 = await signHireReceipt(
            v2,
            {chainId: 13579, verifyingContract},
            {
                address: ANVIL_0.address,
                signTypedData: (data) => ANVIL_0.signTypedData(data),
            },
        );
        expect(signedV2.signature).toBe(
            "0x9a7c21cedbb7b308fb4df76670bc25437d20da12993aa29345689b8779f3d9772c8f99fdc3233217a8337015e79211c37548c1d3a4faca819ea1755ae138cc021c",
        );
        expect(await verifyHireReceipt(signedV2)).toEqual({
            status: "valid",
            signer: ANVIL_0.address,
        });
    });

    it("v1: the vector the enforcer held before task 44 still verifies here", async () => {
        const v1: HireReceiptV1 = {...fields, version: 1};
        expect(hashTypedData(hireReceiptV1TypedData(v1, 13579))).toBe(
            "0x7a6e04dc344728a8cbc0c140683be24a30e7ac6e506c480d87f0c49cbdfc0b1c",
        );
        const verdict = await verifyHireReceipt({
            format: "eip712",
            receipt: v1,
            chainId: 13579,
            agent: ANVIL_0.address,
            signature:
                "0x342d5bb04c5db29deef638eef8ee3486bb6398d83af377d669a23913bdc3e88d556a671b16ce604f793e75032873d621b861b9ed90f07c50c93c1fc2cab6f7031b",
        });
        expect(verdict).toEqual({status: "valid", signer: ANVIL_0.address});
    });
});

describe("signHireReceipt", () => {
    it("signs v2, and names the verifier it was asked for", async () => {
        const out = await signed({}, 13579, SERVICE);
        expect(HIRE_RECEIPT_VERSION).toBe(2);
        expect(out.receipt.version).toBe(2);
        expect(out.verifyingContract).toBe(SERVICE);
        expect(out.agent).toBe(AGENT.address);
    });
});

describe("verifyHireReceipt", () => {
    it("recovers the agent that signed", async () => {
        expect(await verifyHireReceipt(await signed())).toEqual({
            status: "valid",
            signer: AGENT.address,
        });
    });

    it("reads a v1 receipt issued before task 44", async () => {
        expect(await verifyHireReceipt(await signedV1())).toEqual({
            status: "valid",
            signer: AGENT.address,
        });
    });

    it("a v1 receipt relabelled v2 does not verify", async () => {
        const old = await signedV1();
        const relabelled = {
            ...old,
            receipt: {
                ...old.receipt,
                version: 2,
                termId: receipt.termId,
                expiresAt: receipt.expiresAt,
            },
            verifyingContract: ENFORCER,
        } as SignedHireReceipt; // The point is a forged envelope; its shape is v2's.
        expect((await verifyHireReceipt(relabelled)).status).toBe("mismatch");
    });

    it("an unregistered agent signs with an empty registry and id 0", async () => {
        const verdict = await verifyHireReceipt(await signed({agentRegistry: "", agentId: "0"}));
        expect(verdict.status).toBe("valid");
    });

    it("a receipt moved to another chain no longer recovers the agent", async () => {
        const moved = {...(await signed()), chainId: 1155};
        expect((await verifyHireReceipt(moved)).status).toBe("mismatch");
    });

    it("a receipt moved to another verifier no longer recovers the agent", async () => {
        const moved = {...(await signed({}, 13579, ENFORCER)), verifyingContract: SERVICE};
        expect((await verifyHireReceipt(moved)).status).toBe("mismatch");
    });

    it.each([
        ["payment", {payment: `0x${"cd".repeat(32)}` as Hex}],
        ["paid", {paid: "2000000000000000"}],
        ["requester", {requester: AGENT.address}],
        ["agentId", {agentId: "3"}],
        ["result", {resultHash: hireDigest({text: "goodbye"})}],
        ["issuedAt", {issuedAt: 1_793_000_001}],
        ["termId", {termId: `0x${"0d".repeat(32)}` as Hex}],
        ["expiresAt", {expiresAt: 1_793_086_401}],
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
        ["an unknown version", {version: 3}, /version/],
        ["a registry that is not ERC-8004's form", {agentRegistry: "13579:0xabc"}, /agentRegistry/],
        ["an id without a registry", {agentRegistry: "", agentId: "5"}, /without an agentRegistry/],
        ["a short payment hash", {payment: "0xab" as Hex}, /payment/],
        ["a paid amount that is not decimal", {paid: "1e18"}, /paid/],
        ["a short termId", {termId: "0x7e" as Hex}, /termId/],
        ["an expiry before issuance", {expiresAt: 1_792_999_999}, /expiresAt/],
    ])("%s is malformed, with the reason", async (_name, change, reason) => {
        const original = await signed();
        const verdict = await verifyHireReceipt({
            ...original,
            receipt: {...original.receipt, ...change} as HireReceipt, // Deliberately out of type: a stranger's JSON.
        });
        expect(verdict.status).toBe("malformed");
        expect(verdict.status === "malformed" && verdict.reason).toMatch(reason);
    });

    it("a v2 envelope without a verifier is malformed", async () => {
        const original = await signed();
        const verdict = await verifyHireReceipt({
            ...original,
            verifyingContract: "0x1234" as Address,
        });
        expect(verdict.status === "malformed" && verdict.reason).toMatch(/verifyingContract/);
    });
});

describe("hireReceiptIsFor", () => {
    const now = receipt.issuedAt + 60;

    it("accepts a live v2 receipt naming this verifier, in any address case", async () => {
        const out = await signed({}, 13579, SERVICE);
        expect(hireReceiptIsFor(out, SERVICE.toLowerCase() as Address, now)).toEqual({ok: true});
    });

    it("refuses a receipt naming another verifier: the cross-verifier case", async () => {
        const forEnforcer = await signed({}, 13579, ENFORCER);
        const verdict = hireReceiptIsFor(forEnforcer, SERVICE, now);
        expect(verdict.ok).toBe(false);
        expect(!verdict.ok && verdict.reason).toMatch(/is for verifier/);
        const forService = await signed({}, 13579, SERVICE);
        expect(hireReceiptIsFor(forService, ENFORCER, now).ok).toBe(false);
    });

    it("refuses a v1 receipt, which names no verifier", async () => {
        const verdict = hireReceiptIsFor(await signedV1(), SERVICE, now);
        expect(!verdict.ok && verdict.reason).toMatch(/v1/);
    });

    it("accepts at expiresAt and refuses one second after", async () => {
        const out = await signed({}, 13579, SERVICE);
        expect(hireReceiptIsFor(out, SERVICE, receipt.expiresAt).ok).toBe(true);
        const late = hireReceiptIsFor(out, SERVICE, receipt.expiresAt + 1);
        expect(!late.ok && late.reason).toMatch(/expired/);
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
