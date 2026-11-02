import {mkdtempSync, readFileSync, writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";

import {x402Client} from "@x402/core/client";
import {x402HTTPClient} from "@x402/core/http";
import type {FacilitatorClient} from "@x402/core/server";
import type {PaymentPayload, PaymentRequirements, SettleResponse, VerifyResponse} from "@x402/core/types";
import {ExactEvmScheme} from "@x402/evm/exact/client";
import {generatePrivateKey, privateKeyToAccount} from "viem/accounts";
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";

import {
    createX402Gate,
    PaidCallCounter,
    payerOf,
    requestAdapter,
    responseOf,
    X402_TESTNET,
    x402ConfigFrom,
    x402PaymentKey,
    type X402Config,
} from "../src/x402/index.js";

const PAY_TO = "0x00000000000000000000000000000000000000aa";
const SETTLE_TX = `0x${"ab".repeat(32)}`;

const CONFIG: X402Config = {
    network: X402_TESTNET.network,
    payTo: "0x00000000000000000000000000000000000000AA",
    price: "$0.001",
    facilitatorUrl: X402_TESTNET.facilitatorUrl,
    maxTimeoutSeconds: 300,
};

/** A facilitator that answers from memory. The real one is never reached by these tests. */
class FakeFacilitator implements FacilitatorClient {
    verified: PaymentRequirements[] = [];
    settled: PaymentRequirements[] = [];
    verifyAnswer: (payload: PaymentPayload) => VerifyResponse = (payload) => ({
        isValid: true,
        payer: payerOf(payload) ?? undefined,
    });
    settleAnswer: (payload: PaymentPayload, requirements: PaymentRequirements) => SettleResponse = (
        payload,
        requirements,
    ) => ({
        success: true,
        transaction: SETTLE_TX,
        network: requirements.network,
        payer: payerOf(payload) ?? undefined,
    });

    async verify(payload: PaymentPayload, requirements: PaymentRequirements): Promise<VerifyResponse> {
        this.verified.push(requirements);
        return this.verifyAnswer(payload);
    }

    async settle(payload: PaymentPayload, requirements: PaymentRequirements): Promise<SettleResponse> {
        this.settled.push(requirements);
        return this.settleAnswer(payload, requirements);
    }

    async getSupported() {
        return {
            kinds: [{x402Version: 2, scheme: "exact", network: X402_TESTNET.network}],
            extensions: [],
            signers: {},
        } as Awaited<ReturnType<FacilitatorClient["getSupported"]>>; // The response type is not exported under a stable name.
    }
}

const ROUTE = {pattern: "GET /content/*", description: "a skill file", mimeType: "text/plain"};
const URL_ = "http://arp.test/content/0x01";

/** A payer with a key made for this test: it signs an offline authorisation and holds nothing. */
function payer() {
    const account = privateKeyToAccount(generatePrivateKey());
    const client = new x402HTTPClient(new x402Client().register("eip155:*", new ExactEvmScheme(account)));
    return {account, client};
}

async function paidRequest(unpaid: Response, client: x402HTTPClient): Promise<Request> {
    const required = client.getPaymentRequiredResponse((name) => unpaid.headers.get(name), await unpaid.json());
    const payload = await client.createPaymentPayload(required);
    return new Request(URL_, {headers: client.encodePaymentSignatureHeader(payload)});
}

describe("x402ConfigFrom", () => {
    it("is off without a pay-to address", () => {
        expect(x402ConfigFrom({}, "ARP_X402")).toBeNull();
        expect(x402ConfigFrom({ARP_X402_PAY_TO: "  "}, "ARP_X402")).toBeNull();
    });

    it("reads the address and price, and defaults to Base Sepolia through x402.org", () => {
        expect(x402ConfigFrom({ARP_X402_PAY_TO: PAY_TO, ARP_X402_PRICE: "$0.001"}, "ARP_X402")).toEqual(CONFIG);
    });

    it("reads under the prefix it is given, and only that one", () => {
        const env = {ARP_X402_PAY_TO: PAY_TO, ARP_X402_PRICE: "$1"};
        expect(x402ConfigFrom(env, "AGENT_NODE_X402")).toBeNull();
    });

    it("refuses a pay-to without a price, rather than inventing one", () => {
        const answer = x402ConfigFrom({ARP_X402_PAY_TO: PAY_TO}, "ARP_X402");
        expect(answer).toBeInstanceOf(Error);
        expect(String(answer)).toMatch(/ARP_X402_PRICE is required/);
    });

    it.each(["0.001", "$0", "$0.0000001", "$-1", "$1e3", "$ 1"])("refuses the price %s", (price) => {
        expect(x402ConfigFrom({ARP_X402_PAY_TO: PAY_TO, ARP_X402_PRICE: price}, "ARP_X402")).toBeInstanceOf(Error);
    });

    it("refuses a malformed address", () => {
        expect(String(x402ConfigFrom({ARP_X402_PAY_TO: "0x12", ARP_X402_PRICE: "$1"}, "ARP_X402"))).toMatch(
            /must be an address/,
        );
    });

    it("refuses any network but Base Sepolia, mainnet Base included", () => {
        const answer = x402ConfigFrom(
            {ARP_X402_PAY_TO: PAY_TO, ARP_X402_PRICE: "$1", ARP_X402_NETWORK: "eip155:8453"},
            "ARP_X402",
        );
        expect(String(answer)).toMatch(/only eip155:84532/);
    });

    it("takes a facilitator URL and a timeout, and refuses bad ones", () => {
        const base = {ARP_X402_PAY_TO: PAY_TO, ARP_X402_PRICE: "$1"};
        const ok = x402ConfigFrom(
            {...base, ARP_X402_FACILITATOR_URL: "http://localhost:4022", ARP_X402_TIMEOUT_SECONDS: "60"},
            "ARP_X402",
        );
        expect(ok).toMatchObject({facilitatorUrl: "http://localhost:4022", maxTimeoutSeconds: 60});
        expect(x402ConfigFrom({...base, ARP_X402_FACILITATOR_URL: "ftp://x"}, "ARP_X402")).toBeInstanceOf(Error);
        expect(x402ConfigFrom({...base, ARP_X402_TIMEOUT_SECONDS: "0"}, "ARP_X402")).toBeInstanceOf(Error);
    });
});

describe("PaidCallCounter", () => {
    const call = {route: "GET /content/:atomId", payer: "0x1", transaction: SETTLE_TX, network: "eip155:84532", amount: "1000"};

    it("counts per UTC day and per route", () => {
        const counter = new PaidCallCounter(null);
        counter.record(call, new Date("2026-11-02T23:59:59Z"));
        counter.record({...call, route: "tools/call arp_find_tools"}, new Date("2026-11-02T10:00:00Z"));
        counter.record(call, new Date("2026-11-03T00:00:00Z"));
        counter.record(call, new Date("2026-11-03T08:00:00Z"));
        expect(counter.counts()).toEqual({
            "2026-11-02": {"GET /content/:atomId": 1, "tools/call arp_find_tools": 1},
            "2026-11-03": {"GET /content/:atomId": 2},
        });
        expect(counter.total()).toBe(4);
    });

    it("survives a restart, and skips a half-written last line", () => {
        const path = join(mkdtempSync(join(tmpdir(), "x402-")), "nested", "paid.jsonl");
        new PaidCallCounter(path).record(call, new Date("2026-11-02T12:00:00Z"));
        writeFileSync(path, `${readFileSync(path, "utf8")}{"day":"2026-11-0`);
        const reopened = new PaidCallCounter(path);
        expect(reopened.counts()).toEqual({"2026-11-02": {"GET /content/:atomId": 1}});
        expect(JSON.parse(readFileSync(path, "utf8").split("\n")[0] ?? "")).toMatchObject({
            transaction: SETTLE_TX,
            at: "2026-11-02T12:00:00.000Z",
        });
    });
});

describe("requestAdapter and responseOf", () => {
    it("reads a WHATWG request the way x402HTTPResourceServer asks", () => {
        const adapter = requestAdapter(
            new Request("http://h/content/0x01?by=0x2", {headers: {accept: "application/json", "user-agent": "t"}}),
        );
        expect(adapter.getPath()).toBe("/content/0x01");
        expect(adapter.getMethod()).toBe("GET");
        expect(adapter.getAcceptHeader()).toBe("application/json");
        expect(adapter.getUserAgent()).toBe("t");
        expect(adapter.getQueryParam?.("by")).toBe("0x2");
        expect(adapter.getQueryParams?.()).toEqual({by: "0x2"});
        expect(adapter.getHeader("payment-signature")).toBeUndefined();
    });

    it("turns instructions into a response: JSON, text, HTML or empty", async () => {
        const json = responseOf({status: 402, headers: {"PAYMENT-REQUIRED": "x"}, body: {a: 1}});
        expect(json.status).toBe(402);
        expect(json.headers.get("payment-required")).toBe("x");
        expect(json.headers.get("content-type")).toBe("application/json");
        expect(await json.json()).toEqual({a: 1});
        expect(responseOf({status: 402, headers: {}, body: "<p>", isHtml: true}).headers.get("content-type")).toMatch(
            /text\/html/,
        );
        expect(await responseOf({status: 402, headers: {}, body: "t"}).text()).toBe("t");
        expect(await responseOf({status: 204, headers: {}}).text()).toBe("");
    });

    it("reads the payer from an EIP-3009 payload, and nothing from another shape", () => {
        const base = {x402Version: 2, accepted: {} as PaymentRequirements};
        expect(payerOf({...base, payload: {authorization: {from: "0xabc"}}})).toBe("0xabc");
        expect(payerOf({...base, payload: {permit2Authorization: {}}})).toBeNull();
        expect(payerOf({...base, payload: {authorization: {from: 1}}})).toBeNull();
    });
});

describe("createX402Gate", () => {
    let facilitator: FakeFacilitator;
    beforeEach(() => {
        facilitator = new FakeFacilitator();
        // Nothing in this suite may reach a network: the facilitator is the fake, the payer signs offline.
        vi.stubGlobal("fetch", () => Promise.reject(new Error("no network in tests")));
    });
    afterEach(() => vi.unstubAllGlobals());

    const gate = (counter: PaidCallCounter | null = null) =>
        createX402Gate({
            config: CONFIG,
            routes: [ROUTE],
            facilitator,
            counter,
            now: () => new Date("2026-11-02T12:00:00Z"),
        });

    it("answers 402 with x402 v2 requirements in USDC on Base Sepolia when unpaid", async () => {
        const served = vi.fn(async () => new Response("bytes"));
        const answer = await (await gate()).handle(new Request(URL_), "GET /content/:atomId", served);
        expect(answer.status).toBe(402);
        expect(served).not.toHaveBeenCalled();
        const {client} = payer();
        const required = client.getPaymentRequiredResponse((name) => answer.headers.get(name), {});
        expect(required.x402Version).toBe(2);
        expect(required.accepts).toEqual([
            expect.objectContaining({
                scheme: "exact",
                network: "eip155:84532",
                asset: X402_TESTNET.usdc,
                amount: "1000",
                payTo: CONFIG.payTo,
                maxTimeoutSeconds: 300,
            }),
        ]);
        expect(await answer.json()).toMatchObject({error: "payment-required"});
    });

    it("lets an unpriced route through untouched", async () => {
        const answer = await (await gate()).handle(new Request("http://arp.test/"), "GET /", async () => new Response("ok"));
        expect(await answer.text()).toBe("ok");
        expect(facilitator.verified).toHaveLength(0);
    });

    it("serves a paid request, settles after the work, and counts it", async () => {
        const counter = new PaidCallCounter(null);
        const instance = await gate(counter);
        const {account, client} = payer();
        const unpaid = await instance.handle(new Request(URL_), "GET /content/:atomId", async () => new Response());
        const paid = await paidRequest(unpaid, client);

        const order: string[] = [];
        const answer = await instance.handle(paid, "GET /content/:atomId", async () => {
            order.push(`work, settled ${facilitator.settled.length}`);
            return new Response("bytes", {headers: {"x-arp-digest": "d"}});
        });
        expect(order).toEqual(["work, settled 0"]);
        expect(answer.status).toBe(200);
        expect(await answer.text()).toBe("bytes");
        expect(answer.headers.get("x-arp-digest")).toBe("d");
        expect(client.getPaymentSettleResponse((name) => answer.headers.get(name))).toMatchObject({
            success: true,
            transaction: SETTLE_TX,
        });
        expect(counter.counts()).toEqual({"2026-11-02": {"GET /content/:atomId": 1}});

        const verdict = await instance.check(paid, "r");
        expect(verdict.kind === "verified" ? verdict.payer?.toLowerCase() : null).toBe(account.address.toLowerCase());
    });

    it("does not settle or count when the work answers an error", async () => {
        const counter = new PaidCallCounter(null);
        const instance = await gate(counter);
        const {client} = payer();
        const paid = await paidRequest(await instance.handle(new Request(URL_), "r", async () => new Response()), client);
        const answer = await instance.handle(paid, "r", async () => new Response("gone", {status: 404}));
        expect(answer.status).toBe(404);
        expect(facilitator.settled).toHaveLength(0);
        expect(counter.total()).toBe(0);
    });

    it("answers 402 and runs nothing when the facilitator refuses the payment", async () => {
        facilitator.verifyAnswer = () => ({isValid: false, invalidReason: "insufficient_funds"});
        const instance = await gate();
        const {client} = payer();
        const paid = await paidRequest(await instance.handle(new Request(URL_), "r", async () => new Response()), client);
        const served = vi.fn(async () => new Response("bytes"));
        const answer = await instance.handle(paid, "r", served);
        expect(answer.status).toBe(402);
        expect(served).not.toHaveBeenCalled();
    });

    it("withholds the answer, and counts nothing, when settlement fails", async () => {
        facilitator.settleAnswer = (_payload, requirements) => ({
            success: false,
            errorReason: "invalid_transaction_state",
            transaction: "",
            network: requirements.network,
        });
        const counter = new PaidCallCounter(null);
        const instance = await gate(counter);
        const {client} = payer();
        const paid = await paidRequest(await instance.handle(new Request(URL_), "r", async () => new Response()), client);
        const answer = await instance.handle(paid, "r", async () => new Response("bytes"));
        expect(answer.status).toBe(402);
        expect(await answer.text()).not.toBe("bytes");
        expect(counter.total()).toBe(0);
    });

    it("refuses a second settle of one verdict", async () => {
        const instance = await gate();
        const {client} = payer();
        const paid = await paidRequest(await instance.handle(new Request(URL_), "r", async () => new Response()), client);
        const verdict = await instance.check(paid, "r");
        if (verdict.kind !== "verified") throw new Error(`expected verified, got ${verdict.kind}`);
        expect(verdict.key).toMatch(/^0x[0-9a-f]{64}$/);
        expect(verdict.amount).toBe("1000");
        await verdict.settle();
        await expect(verdict.settle()).rejects.toThrow(/twice/);
    });

    it("hashes one signed authorisation to one key", async () => {
        const instance = await gate();
        const {client} = payer();
        const paid = await paidRequest(await instance.handle(new Request(URL_), "r", async () => new Response()), client);
        const a = await instance.check(paid.clone(), "r");
        const b = await instance.check(paid.clone(), "r");
        expect(a.kind === "verified" && b.kind === "verified" && a.key === b.key).toBe(true);
        expect(a.kind === "verified" ? a.key : null).toBe(x402PaymentKey(paid));
    });

    it("reads the payment key from either header, and none from a request without one", () => {
        expect(x402PaymentKey(new Request(URL_))).toBeNull();
        const v2 = x402PaymentKey(new Request(URL_, {headers: {"PAYMENT-SIGNATURE": "abc"}}));
        const v1 = x402PaymentKey(new Request(URL_, {headers: {"X-PAYMENT": "abc"}}));
        expect(v2).toMatch(/^0x[0-9a-f]{64}$/);
        expect(v1).toBe(v2);
    });

    it("fails at start when the facilitator does not support exact on Base Sepolia", async () => {
        facilitator.getSupported = async () => ({kinds: [], extensions: [], signers: {}});
        await expect(gate()).rejects.toThrow();
    });

    it("publishes its terms", async () => {
        expect((await gate()).terms).toEqual({
            scheme: "exact",
            network: "eip155:84532",
            payTo: CONFIG.payTo,
            price: "$0.001",
            facilitator: "https://x402.org/facilitator",
            routes: ["GET /content/*"],
        });
    });
});
