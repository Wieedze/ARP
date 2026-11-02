/** Which requests to this server are paid for, and the wrapper that charges them (task 41a).
 *
 *  ADR `0094` §4: agents pay ARP per call, in USDC through x402; tools never pay. Two things are
 *  priced here, and nothing else:
 *
 *      GET  /content/:atomId          a skill file, served with a receipt
 *      POST tools/call <tool name>    any MCP tool call
 *
 *  **Free, on purpose:** the plain `GET` info document, which states the price before anyone is
 *  asked for it, and the JSON-RPC handshake — `initialize`, `tools/list`, `ping`, notifications. A
 *  client that cannot list what it would be paying for cannot decide to pay.
 *
 *  **HTTP only.** The stdio transport is a process the operator launched for themselves: nobody is
 *  on the other end to pay, and `serveStdio` calls the ungated dispatch directly (`server.ts`).
 *
 *  **Off unless configured** (`ARP_X402_PAY_TO`, `ARP_X402_PRICE`): an operator running their own
 *  server charges nobody unless they decide to (ADR `0045`).
 */
import type { FacilitatorClient } from '@x402/core/server';

import {
  createX402Gate,
  PaidCallCounter,
  x402ConfigFrom,
  type X402Gate,
} from '@arp-protocol/core/x402';

export type McpX402 = { gate: X402Gate; counter: PaidCallCounter };

/**
 * The gate from the environment, or `null` when `ARP_X402_PAY_TO` is unset. Throws on a malformed
 * variable, and when the facilitator does not confirm `exact` on the network: initialising asks it
 * what it supports, so a facilitator that does not answer stops the server at start.
 *
 * `ARP_X402_CALLS` is where the paid calls are counted, `.arp/x402-calls.jsonl` by default.
 */
export async function x402FromEnv(
  env: Readonly<Record<string, string | undefined>> = process.env,
  facilitator?: FacilitatorClient,
): Promise<McpX402 | null> {
  const config = x402ConfigFrom(env, 'ARP_X402');
  if (config instanceof Error) throw config;
  if (config === null) return null;
  const counter = new PaidCallCounter(env['ARP_X402_CALLS'] ?? '.arp/x402-calls.jsonl');
  const gate = await createX402Gate({
    config,
    routes: MCP_X402_ROUTES,
    counter,
    ...(facilitator === undefined ? {} : { facilitator }),
  });
  return { gate, counter };
}

/** The x402 route patterns this server prices, as `x402HTTPResourceServer` matches them. */
export const MCP_X402_ROUTES = [
  { pattern: 'GET /content/*', description: 'a skill file with its content receipt', mimeType: 'text/plain' },
  { pattern: 'POST /*', description: 'an ARP MCP tool call', mimeType: 'application/json' },
] as const;

/**
 * The label a request is counted under, or `null` when it is free.
 *
 * Reads a clone of the body, so the request handed on is unread. A body that is not JSON-RPC is
 * free here and refused by the dispatch, which is where a parse error belongs.
 */
export async function paidRouteOf(request: Request): Promise<string | null> {
  const path = new URL(request.url).pathname;
  if (request.method === 'GET') return /^\/content\/[^/]+\/?$/.test(path) ? 'GET /content/:atomId' : null;
  if (request.method !== 'POST') return null;

  let body: unknown;
  try {
    body = await request.clone().json();
  } catch {
    return null;
  }
  if (typeof body !== 'object' || body === null) return null;
  const { method, params } = body as { method?: unknown; params?: unknown };
  if (method !== 'tools/call') return null;
  const name =
    typeof params === 'object' && params !== null ? (params as { name?: unknown }).name : undefined;
  // The tool name is part of the label so the count says which tools are paid for. An unnamed or
  // unknown tool is still a priced call: the dispatch refuses it, and a refusal is not settled.
  return `tools/call ${typeof name === 'string' && /^[a-z0-9_]{1,64}$/.test(name) ? name : '(unnamed)'}`;
}

/** A JSON-RPC answer that carries an error, or is not JSON-RPC at all. Either way, nothing was served. */
export function isRpcFailure(text: string): boolean {
  try {
    const parsed = JSON.parse(text) as { error?: unknown; result?: { isError?: unknown } } | null;
    return parsed === null || parsed.error !== undefined || parsed.result?.isError === true;
  } catch {
    return true;
  }
}

/**
 * The HTTP fetch, charged. `null` gate: the dispatch, unchanged.
 *
 * Settled only when something was served: an HTTP status below 400 **and**, for a tool call, a
 * JSON-RPC answer without an error — JSON-RPC carries its errors in an HTTP 200, so the status alone
 * would charge a caller for "unknown tool". The error reaches the caller unchanged, unsettled.
 */
export function withX402(
  gate: X402Gate | null,
  dispatch: (request: Request) => Promise<Response>,
): (request: Request) => Promise<Response> {
  if (gate === null) return dispatch;
  return async (request) => {
    const route = await paidRouteOf(request);
    if (route === null) return dispatch(request);

    const verdict = await gate.check(request, route);
    if (verdict.kind === 'free') return dispatch(request);
    if (verdict.kind === 'refused') return verdict.response;

    const answer = await dispatch(request);
    if (answer.status >= 400) return answer;
    // The bytes are read once and re-sent, so the content route's body stays exactly what its
    // digest is over.
    const bytes = new Uint8Array(await answer.arrayBuffer());
    if (route.startsWith('tools/call') && isRpcFailure(new TextDecoder().decode(bytes))) {
      return new Response(bytes, { status: answer.status, headers: answer.headers });
    }

    const settlement = await verdict.settle();
    if (!settlement.ok) return settlement.response;
    const headers = new Headers(answer.headers);
    for (const [name, value] of Object.entries(settlement.headers)) headers.set(name, value);
    return new Response(bytes, { status: answer.status, headers });
  };
}
