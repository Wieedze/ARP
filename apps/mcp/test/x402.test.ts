import {mkdtempSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";

import {x402Client} from "@x402/core/client";
import {x402HTTPClient} from "@x402/core/http";
import type {FacilitatorClient} from "@x402/core/server";
import type {PaymentPayload, PaymentRequirements, SettleResponse, VerifyResponse} from "@x402/core/types";
import {ExactEvmScheme} from "@x402/evm/exact/client";
import {generatePrivateKey, privateKeyToAccount} from "viem/accounts";
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";

import {payerOf, X402_TESTNET} from "@arp-protocol/core/x402";

import {isRpcFailure, type McpX402, paidRouteOf, withX402, x402FromEnv} from "../src/x402.ts";

const SETTLED = `0x${"5e".repeat(32)}`;
const PAY_TO = "0x00000000000000000000000000000000000000aa";

/** The facilitator, in memory. Nothing in this file reaches x402.org or any chain. */
class FakeFacilitator implements FacilitatorClient {
    settles = 0;
    async verify(payload: PaymentPayload): Promise<VerifyResponse> {
        return {isValid: true, payer: payerOf(payload) ?? undefined};
    }
    async settle(_payload: PaymentPayload, requirements: PaymentRequirements): Promise<SettleResponse> {
        this.settles += 1;
        return {success: true, transaction: SETTLED, network: requirements.network};
    }
    async getSupported() {
        return {
            kinds: [{x402Version: 2, scheme: "exact", network: X402_TESTNET.network}],
            extensions: [],
            signers: {},
        } as Awaited<ReturnType<FacilitatorClient["getSupported"]>>; // Its named type is not exported.
    }
}

const rpc = (method: string, params?: unknown) =>
    new Request("http://arp/mcp", {
        method: "POST",
        headers: {"content-type": "application/json"},
        body: JSON.stringify({jsonrpc: "2.0", id: 1, method, params}),
    });

describe("paidRouteOf", () => {
    it("prices a content fetch and a tool call, labelled by tool", async () => {
        expect(await paidRouteOf(new Request(`http://arp/content/0x${"01".repeat(32)}?by=0x1`))).toBe(
            "GET /content/:atomId",
        );
        expect(await paidRouteOf(rpc("tools/call", {name: "arp_find_tools"}))).toBe("tools/call arp_find_tools");
        expect(await paidRouteOf(rpc("tools/call", {name: "Not A Tool!"}))).toBe("tools/call (unnamed)");
        expect(await paidRouteOf(rpc("tools/call"))).toBe("tools/call (unnamed)");
    });

    it.each(["initialize", "tools/list", "ping", "notifications/initialized"])("leaves %s free", async (method) => {
        expect(await paidRouteOf(rpc(method))).toBeNull();
    });

    it("leaves the info document, other methods and a non-JSON body free", async () => {
        expect(await paidRouteOf(new Request("http://arp/"))).toBeNull();
        expect(await paidRouteOf(new Request("http://arp/content/a/b"))).toBeNull();
        expect(await paidRouteOf(new Request("http://arp/", {method: "PUT", body: "x"}))).toBeNull();
        expect(await paidRouteOf(new Request("http://arp/", {method: "POST", body: "not json"}))).toBeNull();
        expect(await paidRouteOf(new Request("http://arp/", {method: "POST", body: "null"}))).toBeNull();
    });

    it("leaves the body unread for the dispatch", async () => {
        const request = rpc("tools/call", {name: "arp_identity"});
        await paidRouteOf(request);
        expect(await request.json()).toMatchObject({method: "tools/call"});
    });
});

describe("isRpcFailure", () => {
    it("tells a served answer from an error", () => {
        expect(isRpcFailure(JSON.stringify({jsonrpc: "2.0", id: 1, result: {content: []}}))).toBe(false);
        expect(isRpcFailure(JSON.stringify({jsonrpc: "2.0", id: 1, error: {code: -32602}}))).toBe(true);
        expect(isRpcFailure(JSON.stringify({jsonrpc: "2.0", id: 1, result: {isError: true}}))).toBe(true);
        expect(isRpcFailure("null")).toBe(true);
        expect(isRpcFailure("<html>")).toBe(true);
    });
});

describe("x402FromEnv", () => {
    it("is null when nothing is priced, which is the default", async () => {
        expect(await x402FromEnv({})).toBeNull();
    });

    it("throws on a pay-to without a price", async () => {
        await expect(x402FromEnv({ARP_X402_PAY_TO: PAY_TO})).rejects.toThrow(/ARP_X402_PRICE is required/);
    });
});

describe("withX402", () => {
    let facilitator: FakeFacilitator;
    let x402: McpX402;
    const dispatch = vi.fn(async (request: Request) => {
        if (request.method === "GET") return new Response("skill bytes", {headers: {"x-arp-digest": "d"}});
        const body = (await request.json()) as {method: string; params?: {name?: string}};
        if (body.params?.name === "arp_unknown") {
            return Response.json({jsonrpc: "2.0", id: 1, error: {code: -32602, message: "unknown tool"}});
        }
        return Response.json({jsonrpc: "2.0", id: 1, result: {method: body.method}});
    });

    beforeEach(async () => {
        dispatch.mockClear();
        facilitator = new FakeFacilitator();
        vi.stubGlobal("fetch", () => Promise.reject(new Error("no network in tests")));
        const found = await x402FromEnv(
            {
                ARP_X402_PAY_TO: PAY_TO,
                ARP_X402_PRICE: "$0.001",
                ARP_X402_CALLS: join(mkdtempSync(join(tmpdir(), "mcp-x402-")), "calls.jsonl"),
            },
            facilitator,
        );
        if (found === null) throw new Error("expected a gate");
        x402 = found;
    });
    afterEach(() => vi.unstubAllGlobals());

    async function paid(request: () => Request): Promise<Request> {
        const client = new x402HTTPClient(
            new x402Client().register("eip155:*", new ExactEvmScheme(privateKeyToAccount(generatePrivateKey()))),
        );
        const unpaid = await withX402(x402.gate, dispatch)(request());
        expect(unpaid.status).toBe(402);
        const required = client.getPaymentRequiredResponse((name) => unpaid.headers.get(name), await unpaid.json());
        const headers = client.encodePaymentSignatureHeader(await client.createPaymentPayload(required));
        const base = request();
        const merged = new Headers(base.headers);
        for (const [name, value] of Object.entries(headers)) merged.set(name, value);
        return new Request(base, {headers: merged});
    }

    it("is the dispatch itself when nothing is priced", () => {
        expect(withX402(null, dispatch)).toBe(dispatch);
    });

    it("keeps the handshake free", async () => {
        const answer = await withX402(x402.gate, dispatch)(rpc("tools/list"));
        expect(answer.status).toBe(200);
        expect(dispatch).toHaveBeenCalledTimes(1);
    });

    it("answers an unpaid tool call with 402 and does not dispatch it", async () => {
        const answer = await withX402(x402.gate, dispatch)(rpc("tools/call", {name: "arp_find_tools"}));
        expect(answer.status).toBe(402);
        expect(answer.headers.get("payment-required")).not.toBeNull();
        expect(dispatch).not.toHaveBeenCalled();
    });

    it("serves a paid tool call, settles it and counts it under the tool's name", async () => {
        const request = await paid(() => rpc("tools/call", {name: "arp_find_tools"}));
        const answer = await withX402(x402.gate, dispatch)(request);
        expect(answer.status).toBe(200);
        expect(await answer.json()).toMatchObject({result: {method: "tools/call"}});
        expect(answer.headers.get("payment-response")).not.toBeNull();
        expect(facilitator.settles).toBe(1);
        expect(Object.values(x402.counter.counts())).toEqual([{"tools/call arp_find_tools": 1}]);
    });

    it("does not charge a tool call that answered a JSON-RPC error", async () => {
        const request = await paid(() => rpc("tools/call", {name: "arp_unknown"}));
        const answer = await withX402(x402.gate, dispatch)(request);
        expect(answer.status).toBe(200);
        expect(await answer.json()).toMatchObject({error: {message: "unknown tool"}});
        expect(facilitator.settles).toBe(0);
        expect(x402.counter.total()).toBe(0);
    });

    it("serves a paid content fetch with its bytes and headers unchanged", async () => {
        const url = `http://arp/content/0x${"01".repeat(32)}`;
        const answer = await withX402(x402.gate, dispatch)(await paid(() => new Request(url)));
        expect(await answer.text()).toBe("skill bytes");
        expect(answer.headers.get("x-arp-digest")).toBe("d");
        expect(Object.values(x402.counter.counts())).toEqual([{"GET /content/:atomId": 1}]);
    });

    it("does not charge a content fetch the route refused", async () => {
        const refusing = vi.fn(async () => Response.json({error: "unknown-atom"}, {status: 404}));
        const url = `http://arp/content/0x${"02".repeat(32)}`;
        const request = await paid(() => new Request(url));
        expect((await withX402(x402.gate, refusing)(request)).status).toBe(404);
        expect(facilitator.settles).toBe(0);
    });
});
