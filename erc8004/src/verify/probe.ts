import type {DeclaredEndpoint, ProbeOutcome, ProbeRequest} from "./types.js";

/**
 * Identify the client. A recipient seeing this in their logs can find out who is calling and ask us
 * to stop, which is the minimum owed to someone whose server we are costing money.
 */
export const DEFAULT_USER_AGENT = "ARP-verifier/0.1 (+https://github.com/Wieedze/ARP)";

/**
 * Probe timeout. Shorter than `http.ts`'s `DEFAULT_TIMEOUT_MS` (10 s) on purpose: that one is for
 * endpoints we have a relationship with, this one is for tens of thousands of strangers' servers,
 * and the name is distinct so the two cannot be confused at an import site.
 */
export const DEFAULT_PROBE_TIMEOUT_MS = 8_000;

/** The MCP revision the handshake declares. Pinned, not latest: a prober must be reproducible. */
export const MCP_PROTOCOL_VERSION = "2025-06-18";

export type ProbeOptions = {
    fetch?: typeof globalThis.fetch;
    userAgent?: string;
    timeoutMs?: number;
    /** Injected so tests do not sleep. Called with the delay a courteous client would wait. */
    onThrottle?: (host: string, waitMs: number) => Promise<void> | void;
};

/**
 * How much response body is kept on an inconclusive outcome.
 *
 * Enough for a reader to see what confused us, bounded so one hostile endpoint cannot fill a
 * result file. The body is also the only evidence that an `inconclusive` is honest rather than a
 * shrug.
 */
const OBSERVED_LIMIT = 240;

function truncate(text: string): string {
    const flat = text.replace(/\s+/g, " ").trim();
    return flat.length > OBSERVED_LIMIT ? `${flat.slice(0, OBSERVED_LIMIT)}…` : flat;
}

/**
 * One request per endpoint, with no retries.
 *
 * Deliberate: a retry doubles the load on somebody else's server to resolve an ambiguity we are
 * willing to report as ambiguous. `inconclusive` is a legitimate answer and is cheaper for the
 * person being probed than certainty is.
 */
async function send(
    request: ProbeRequest,
    init: RequestInit,
    options: ProbeOptions,
): Promise<{response: Response; body: string} | {error: unknown}> {
    const doFetch = options.fetch ?? globalThis.fetch;
    const timeoutMs = options.timeoutMs ?? DEFAULT_PROBE_TIMEOUT_MS;
    try {
        const response = await doFetch(request.url, {
            ...init,
            headers: {
                "user-agent": options.userAgent ?? DEFAULT_USER_AGENT,
                ...(init.headers ?? {}),
            },
            signal: AbortSignal.timeout(timeoutMs),
            redirect: "follow",
        });
        return {response, body: await response.text()};
    } catch (error) {
        return {error};
    }
}

function transportError(request: ProbeRequest, error: unknown): ProbeOutcome {
    const message = error instanceof Error ? error.message : String(error);
    // A timeout IS the answer: an endpoint that does not respond in 8 s is not serving a caller.
    // Anything else — DNS failure, TLS failure, connection refused — could be our network as much
    // as theirs, so it is inconclusive rather than a verdict about the agent.
    const isTimeout = /abort|timeout|timed out/i.test(message);
    if (isTimeout) {
        return {
            status: "confirmed",
            code: "dead",
            httpStatus: null,
            request,
            detail: `no response within the timeout (${message})`,
        };
    }
    return {
        status: "inconclusive",
        code: "transport-error",
        httpStatus: null,
        request,
        observed: truncate(message),
        detail: "the request did not complete; this may be our network rather than the endpoint",
    };
}

/** `429` and `503` are the server asking us to back off. Never a verdict about the agent. */
function rateLimited(request: ProbeRequest, status: number, body: string): ProbeOutcome {
    return {
        status: "inconclusive",
        code: "rate-limited",
        httpStatus: status,
        request,
        observed: truncate(body),
        detail: `the host asked us to back off (HTTP ${status}); nothing was established`,
    };
}

async function probeMcp(url: string, options: ProbeOptions): Promise<ProbeOutcome> {
    const request: ProbeRequest = {method: "POST", url, rpcMethod: "initialize"};
    const sent = await send(
        request,
        {
            method: "POST",
            headers: {
                "content-type": "application/json",
                accept: "application/json, text/event-stream",
            },
            body: JSON.stringify({
                jsonrpc: "2.0",
                id: 1,
                method: "initialize",
                params: {
                    protocolVersion: MCP_PROTOCOL_VERSION,
                    capabilities: {},
                    clientInfo: {name: "arp-verifier", version: "0.1"},
                },
            }),
        },
        options,
    );
    if ("error" in sent) return transportError(request, sent.error);
    const {response, body} = sent;
    if (response.status === 429 || response.status === 503) {
        return rateLimited(request, response.status, body);
    }
    if (response.ok && /"result"\s*:/.test(body)) {
        return {
            status: "confirmed",
            code: "serves-declared-protocol",
            httpStatus: response.status,
            request,
            detail: "answered `initialize` with a JSON-RPC result",
        };
    }
    if (response.status >= 500) {
        return {
            status: "confirmed",
            code: "dead",
            httpStatus: response.status,
            request,
            detail: `server error (HTTP ${response.status})`,
        };
    }
    // It answered, and not with an MCP result. That is either an endpoint that does not speak the
    // protocol it declared, or our handshake being wrong for this deployment — and we cannot tell
    // which from one exchange. A JSON-RPC error object is the one case we can read as the former:
    // the server understood the envelope and refused the call.
    if (/"error"\s*:\s*\{[^}]*"code"\s*:\s*-3\d{4}/.test(body)) {
        return {
            status: "confirmed",
            code: "declared-protocol-not-served",
            httpStatus: response.status,
            request,
            detail: "returned a JSON-RPC error to `initialize`",
        };
    }
    return {
        status: "inconclusive",
        code: "unrecognised-response",
        httpStatus: response.status,
        request,
        observed: truncate(body),
        detail: "answered, but not with an MCP result; our handshake may be wrong for this deployment",
    };
}

/** Candidate paths for an A2A agent card, in the order the spec and the wild both use. */
function a2aCandidates(url: string): string[] {
    const base = url.replace(/\/+$/, "");
    return [`${base}/.well-known/agent-card.json`, `${base}/.well-known/agent.json`, url];
}

async function probeA2a(url: string, options: ProbeOptions): Promise<ProbeOutcome> {
    let last: ProbeOutcome | null = null;
    for (const candidate of a2aCandidates(url)) {
        const request: ProbeRequest = {method: "GET", url: candidate};
        const sent = await send(request, {method: "GET"}, options);
        if ("error" in sent) {
            last = transportError(request, sent.error);
            continue;
        }
        const {response, body} = sent;
        if (response.status === 429 || response.status === 503) {
            return rateLimited(request, response.status, body);
        }
        if (response.ok && /"(name|skills|capabilities|protocolVersion)"\s*:/.test(body)) {
            const which =
                candidate === url
                    ? "the declared URL itself"
                    : `\`${candidate.slice(url.replace(/\/+$/, "").length)}\``;
            return {
                status: "confirmed",
                code: "serves-declared-protocol",
                httpStatus: response.status,
                request,
                detail: `served an agent card at ${which}`,
            };
        }
        last = {
            status: "inconclusive",
            code: "unrecognised-response",
            httpStatus: response.status,
            request,
            observed: truncate(body),
            detail: "answered, but not with anything shaped like an agent card",
        };
    }
    return (
        last ?? {
            status: "inconclusive",
            code: "unrecognised-response",
            httpStatus: null,
            request: {method: "GET", url},
            observed: "",
            detail: "no candidate path produced a response",
        }
    );
}

async function probePlain(url: string, options: ProbeOptions): Promise<ProbeOutcome> {
    const request: ProbeRequest = {method: "GET", url};
    const sent = await send(request, {method: "GET"}, options);
    if ("error" in sent) return transportError(request, sent.error);
    const {response, body} = sent;
    if (response.status === 429 || response.status === 503) {
        return rateLimited(request, response.status, body);
    }
    if (response.status >= 500) {
        return {
            status: "confirmed",
            code: "dead",
            httpStatus: response.status,
            request,
            detail: `server error (HTTP ${response.status})`,
        };
    }
    return {
        status: "confirmed",
        code: "live",
        httpStatus: response.status,
        request,
        detail: `answered HTTP ${response.status}`,
    };
}

/**
 * Probe one declared endpoint, and report which of the three groups the result is in.
 *
 * - `confirmed` — a fact, with the request that established it, so any row reproduces with one
 *   `curl`.
 * - `not-checkable` — carried straight through from the classification. **Never probed**, so no
 *   request is made and nothing is claimed. This is 82% of real endpoints.
 * - `inconclusive` — it answered something we did not understand, or the transport failed in a way
 *   that could be our network. Reported with what we sent and what came back.
 *
 * The asymmetry is the point and it is principled, not cautious. A timeout *is* an answer about the
 * agent: an endpoint that cannot respond in eight seconds is not serving callers. A TLS or DNS
 * failure is not, because it could equally be us. A `429` is never a verdict — it is the host asking
 * us to stop.
 *
 * **The cost, stated rather than hidden:** some genuinely dead endpoints land in `inconclusive`.
 * Observed 2026-10-16 on agent 8453:19682, whose declared MCP host returns
 * `{"status":"error","code":404,"message":"Application not found"}` — a dead platform deployment,
 * reported as `unrecognised-response` because a 404 on an unknown path is also what a live server
 * with a different route layout returns. We give up a true positive rather than risk a false
 * accusation, exactly as `confirmedProviderIds` does in the signature path (ADR 0019). The `observed`
 * body is carried so a reader can draw their own conclusion from the same evidence we had.
 */
export async function probeEndpoint(
    endpoint: DeclaredEndpoint,
    options: ProbeOptions = {},
): Promise<ProbeOutcome> {
    if (endpoint.classification.status !== "probeable") {
        return {
            status: "not-checkable",
            code: endpoint.classification.code,
            detail: `not probed: ${endpoint.classification.code}`,
        };
    }
    const {url} = endpoint.classification;
    if (endpoint.protocol === "mcp") return probeMcp(url, options);
    if (endpoint.protocol === "a2a") return probeA2a(url, options);
    return probePlain(url, options);
}
