/**
 * The 402 answer, on the official x402 packages (task 41a, ADR `0105`).
 *
 * `@x402/core`'s `x402HTTPResourceServer` decides: no payment → 402 with `PAYMENT-REQUIRED`; a
 * `PAYMENT-SIGNATURE` → verified by the facilitator; after the work → settled by it, and the
 * `PAYMENT-RESPONSE` header carries the settlement. `@x402/evm`'s `exact` scheme turns a `$` price into
 * USDC atomic units. **This file decides nothing about the protocol.** It is the adapter between those
 * packages and a WHATWG `Request`/`Response`, which is what both of ARP's servers speak, plus the
 * count of what settled (`counter.ts`).
 *
 * **The facilitator holds the only key involved.** It submits the USDC authorisation the payer
 * signed; the server here signs nothing and sends nothing on any chain (ADR `0038`). A facilitator is
 * injectable so a test never reaches the network.
 *
 * **Settled after the work, never before.** The `exact` scheme's default flow is `authorization`: the
 * payer signs, the server verifies, does the work, and only then asks the facilitator to settle. A
 * route that answers 4xx or 5xx is not settled, so a caller is not charged for a refusal.
 */
import {HTTPFacilitatorClient, x402HTTPResourceServer, x402ResourceServer} from "@x402/core/server";
import type {
    FacilitatorClient,
    HTTPAdapter,
    HTTPResponseInstructions,
    RoutesConfig,
} from "@x402/core/server";
import type {PaymentPayload} from "@x402/core/types";
import {ExactEvmScheme} from "@x402/evm/exact/server";
import {keccak256, toBytes, type Hex} from "viem";

import type {X402Config} from "./config.js";
import type {PaidCall, PaidCallCounter} from "./counter.js";

/** A priced route, as `x402HTTPResourceServer` matches it: `"GET /content/*"`, `"POST /task"`. */
export type X402Route = {pattern: string; description: string; mimeType: string};

export type X402Settlement =
    | {ok: true; call: PaidCall; headers: Record<string, string>}
    | {ok: false; response: Response};

export type X402Verdict =
    /** The request matched no priced route. */
    | {kind: "free"}
    /** Unpaid, or a payment the facilitator refused: the 402 to send back, as it is. */
    | {kind: "refused"; response: Response}
    | {
          kind: "verified";
          /** The address that signed the authorisation, when the scheme's payload names one. */
          payer: string | null;
          /** keccak256 of the payment header: the same signed authorisation always hashes the same. */
          key: Hex;
          amount: string;
          network: string;
          /** Ask the facilitator to settle. Call it once, after the work succeeded. */
          settle(): Promise<X402Settlement>;
      };

export type X402GateOptions = {
    config: X402Config;
    routes: readonly X402Route[];
    /** Defaults to `HTTPFacilitatorClient` at `config.facilitatorUrl`. A test passes a fake. */
    facilitator?: FacilitatorClient;
    counter?: PaidCallCounter | null;
    now?: () => Date;
};

/** What a server prints in its info document so a caller knows the price before it is asked. */
export type X402Terms = {
    scheme: "exact";
    network: string;
    payTo: string;
    price: string;
    facilitator: string;
    routes: string[];
};

export type X402Gate = {
    terms: X402Terms;
    /** Classify a request on `route` (the label it is counted under). Reads headers only, never the body. */
    check(request: Request, route: string): Promise<X402Verdict>;
    /** `check`, then `run`, then settle if `run` answered below 400. */
    handle(request: Request, route: string, run: () => Promise<Response>): Promise<Response>;
};

/** A WHATWG `Request` as `x402HTTPResourceServer` reads one. Headers, method and URL; no body. */
export function requestAdapter(request: Request): HTTPAdapter {
    const url = new URL(request.url);
    return {
        getHeader: (name) => request.headers.get(name) ?? undefined,
        getMethod: () => request.method,
        getPath: () => url.pathname,
        getUrl: () => request.url,
        getAcceptHeader: () => request.headers.get("accept") ?? "",
        getUserAgent: () => request.headers.get("user-agent") ?? "",
        getQueryParams: () => Object.fromEntries(url.searchParams.entries()),
        getQueryParam: (name) => url.searchParams.get(name) ?? undefined,
    };
}

/** `HTTPResponseInstructions` as a `Response`. An object body is JSON; a string body is sent as is. */
export function responseOf(instructions: HTTPResponseInstructions): Response {
    const headers = new Headers(instructions.headers);
    const {body} = instructions;
    if (body === undefined || body === null) return new Response(null, {status: instructions.status, headers});
    if (typeof body === "string") {
        if (!headers.has("content-type")) {
            headers.set("content-type", instructions.isHtml === true ? "text/html; charset=utf-8" : "text/plain; charset=utf-8");
        }
        return new Response(body, {status: instructions.status, headers});
    }
    if (!headers.has("content-type")) headers.set("content-type", "application/json");
    return new Response(JSON.stringify(body), {status: instructions.status, headers});
}

/**
 * The payer, read from the `exact` scheme's EIP-3009 payload (`payload.authorization.from`). A Permit2
 * payload names it elsewhere, and then this is `null` until the settlement names it.
 */
export function payerOf(payload: PaymentPayload): string | null {
    const authorization = payload.payload["authorization"];
    if (typeof authorization !== "object" || authorization === null) return null;
    const from = (authorization as Record<string, unknown>)["from"];
    return typeof from === "string" ? from : null;
}

/** The payment header a request carries: v2's `PAYMENT-SIGNATURE`, or v1's `X-PAYMENT`. */
function paymentHeaderOf(request: Request): string | undefined {
    return request.headers.get("payment-signature") ?? request.headers.get("x-payment") ?? undefined;
}

/**
 * keccak256 of a request's payment header, or `null` without one. The same key a verified verdict
 * carries, so a ledger can refuse a replay before the facilitator is asked anything.
 */
export function x402PaymentKey(request: Request): Hex | null {
    const header = paymentHeaderOf(request);
    return header === undefined ? null : keccak256(toBytes(header));
}

/**
 * Builds the gate and initialises it, which asks the facilitator what it supports. A facilitator that
 * does not answer, or does not support `exact` on the configured network, throws here, at start,
 * rather than on the first paying caller.
 */
export async function createX402Gate(options: X402GateOptions): Promise<X402Gate> {
    const {config, routes} = options;
    const counter = options.counter ?? null;
    const now = options.now ?? (() => new Date());
    const facilitator = options.facilitator ?? new HTTPFacilitatorClient({url: config.facilitatorUrl});

    const resourceServer = new x402ResourceServer(facilitator).register(config.network, new ExactEvmScheme());
    const routesConfig: RoutesConfig = Object.fromEntries(
        routes.map((route) => [
            route.pattern,
            {
                accepts: {
                    scheme: "exact",
                    network: config.network,
                    payTo: config.payTo,
                    price: config.price,
                    maxTimeoutSeconds: config.maxTimeoutSeconds,
                },
                description: route.description,
                mimeType: route.mimeType,
                unpaidResponseBody: () => ({
                    contentType: "application/json",
                    body: {
                        error: "payment-required",
                        reason: `${route.description} costs ${config.price} in USDC on ${config.network}, through x402. The requirements are in the PAYMENT-REQUIRED header.`,
                    },
                }),
            },
        ]),
    );
    const http = new x402HTTPResourceServer(resourceServer, routesConfig);
    await http.initialize();

    const terms: X402Terms = {
        scheme: "exact",
        network: config.network,
        payTo: config.payTo,
        price: config.price,
        facilitator: config.facilitatorUrl,
        routes: routes.map((route) => route.pattern),
    };

    async function check(request: Request, route: string): Promise<X402Verdict> {
        const adapter = requestAdapter(request);
        const paymentHeader = paymentHeaderOf(request);
        const result = await http.processHTTPRequest({
            adapter,
            path: adapter.getPath(),
            method: adapter.getMethod(),
            ...(paymentHeader === undefined ? {} : {paymentHeader}),
        });
        if (result.type === "no-payment-required") return {kind: "free"};
        if (result.type === "payment-error") return {kind: "refused", response: responseOf(result.response)};

        const {paymentPayload, paymentRequirements, declaredExtensions} = result;
        let settled = false;
        return {
            kind: "verified",
            payer: payerOf(paymentPayload),
            // `paymentHeader` is present: a verified result is only reached with one.
            key: x402PaymentKey(request) ?? keccak256(toBytes("")),
            amount: paymentRequirements.amount,
            network: paymentRequirements.network,
            async settle(): Promise<X402Settlement> {
                if (settled) throw new Error("settle() called twice for one payment");
                settled = true;
                const outcome = await http.processSettlement(paymentPayload, paymentRequirements, declaredExtensions);
                if (!outcome.success) return {ok: false, response: responseOf(outcome.response)};
                const call: PaidCall = {
                    route,
                    payer: outcome.payer ?? payerOf(paymentPayload) ?? "",
                    transaction: outcome.transaction,
                    network: outcome.network,
                    amount: outcome.amount ?? paymentRequirements.amount,
                };
                counter?.record(call, now());
                return {ok: true, call, headers: outcome.headers};
            },
        };
    }

    async function handle(request: Request, route: string, run: () => Promise<Response>): Promise<Response> {
        const verdict = await check(request, route);
        if (verdict.kind === "free") return run();
        if (verdict.kind === "refused") return verdict.response;

        const answer = await run();
        if (answer.status >= 400) return answer;
        const settlement = await verdict.settle();
        if (!settlement.ok) return settlement.response;
        const headers = new Headers(answer.headers);
        for (const [name, value] of Object.entries(settlement.headers)) headers.set(name, value);
        return new Response(answer.body, {status: answer.status, statusText: answer.statusText, headers});
    }

    return {terms, check, handle};
}
