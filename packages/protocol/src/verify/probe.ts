import type {DeclaredEndpoint, ProbeOutcome, ProbeRequest} from "./types.js";
import type {FetchLike} from "../http.js";

/**
 * Identify the client. A recipient seeing this in their logs can find out who is calling and ask us
 * to stop, which is the minimum owed to someone whose server we are costing money.
 */
export const DEFAULT_USER_AGENT = "ARP-verifier/0.1 (+https://github.com/Wieedze/ARP)";

/**
 * The host of `url` when it is one nobody outside this machine should be asked to fetch.
 *
 * Returns the offending host, or `null` when probing it is fine.
 *
 * ## Why a probe needs this at all
 *
 * A probe fetches a URL somebody else supplied, from the machine the node runs on. That is the
 * shape of an SSRF, and it is not hypothetical: found 2026-10-29 while writing `docs/22` for people
 * who would install the node. `Bun.serve` binds every interface when given no hostname, so an
 * installed node listened on the LAN, and `arp_probe_endpoint` would fetch
 * `http://169.254.169.254/latest/meta-data/` or `http://127.0.0.1:…/admin` and report the answer to
 * whoever asked. Two fixes landed together: the node binds loopback by default, and this.
 *
 * ## What it does not cover, said here rather than implied
 *
 * **A hostname that resolves to a private address.** `example.com` pointing at `127.0.0.1`, or DNS
 * rebinding between this check and the connection, both pass. Closing that needs resolving the name
 * and connecting to the resolved address, which `fetch` does not expose. So this is a guard against
 * the easy case, not a boundary, and `docs/22` says so in those words.
 *
 * It is exported rather than inlined because the caller is what decides: ARP's own rig probes its
 * own testnet endpoints on purpose, and `ARP_ALLOW_PRIVATE_PROBE` is read where that decision is
 * made, not here.
 */
export function privateProbeTarget(url: string): string | null {
    let host: string;
    try {
        host = new URL(url).hostname.toLowerCase().replace(/^\[|\]$/g, "");
    } catch {
        // Not parseable is not private. The caller's own URL check is what refuses it.
        return null;
    }

    if (host === "localhost" || host.endsWith(".localhost")) return host;
    // `.internal` and `.local` are the names a cloud or an mDNS network answers on.
    if (host.endsWith(".internal") || host.endsWith(".local")) return host;
    if (host === "::1" || host === "0:0:0:0:0:0:0:1") return host;
    // fc00::/7 — IPv6 unique local.
    if (/^f[cd][0-9a-f]{0,2}:/.test(host)) return host;

    // Only an IPv4 LITERAL gets the range checks. `10.example.com` is a perfectly good public
    // hostname and a prefix test on the string refuses it — the test for that case is in
    // `probe-private.test.ts` and it caught this.
    const quad = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
    if (quad === null) return null;
    const [a, b] = [Number(quad[1]), Number(quad[2])];

    if (a === 127 || a === 10 || a === 0) return host;
    if (a === 192 && b === 168) return host;
    // 169.254.0.0/16 is link-local, and it is where every cloud metadata service lives.
    if (a === 169 && b === 254) return host;
    // 172.16.0.0/12 is 172.16 through 172.31 — not all of 172, which would refuse public hosts.
    if (a === 172 && b >= 16 && b <= 31) return host;
    return null;
}

/**
 * Probe timeout. Shorter than `http.ts`'s `DEFAULT_TIMEOUT_MS` (10 s) on purpose: that one is for
 * endpoints we have a relationship with, this one is for tens of thousands of strangers' servers,
 * and the name is distinct so the two cannot be confused at an import site.
 */
export const DEFAULT_PROBE_TIMEOUT_MS = 8_000;

/** The MCP revision the handshake declares. Pinned, not latest: a prober must be reproducible. */
export const MCP_PROTOCOL_VERSION = "2025-06-18";

export type ProbeOptions = {
    /**
     * The network read, injectable.
     *
     * `FetchLike`, not `typeof globalThis.fetch`. Under Bun's lib types the global is an **object**
     * carrying `preconnect`, so a counting or caching wrapper — which is the only reason to inject
     * one — could not satisfy it. `scripts/verify-cohort.ts` has such a wrapper and was the thing
     * that could not typecheck (`tasks/21`). The prober only ever calls it with a string URL.
     */
    fetch?: FetchLike;
    /**
     * After a successful MCP handshake, ask the server what it serves.
     *
     * Off by default because it is a second request per endpoint and the task's courtesy rules make
     * one request the baseline. Worth turning on: measured 2026-10-16, 0 of ~110 parsed documents across repeated n=200 samples (scripts/measure/cohort-skills.ts; the zero is stable, the denominator varies) declared a capability, yet all three confirmed MCP servers answered
     * `tools/list` with their real tool list — 13 tools across gmchain, surfliquid and nebula-scan.
     * So this recovers capability data the registration file does not carry, which is a stronger
     * result than comparing declared against served.
     */
    listTools?: boolean;
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

/**
 * Pull the JSON out of a response that may be SSE-framed.
 *
 * Some MCP deployments answer a single POST with `text/event-stream` even when the client accepts
 * plain JSON. Treating that as unparseable would report a working server as inconclusive.
 */
function unframe(text: string): string {
    if (!text.includes("data:")) return text;
    return text
        .split("\n")
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trim())
        .join("");
}

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

/**
 * Ask a server what it serves, after a successful handshake.
 *
 * Sends the `initialized` notification first, as the spec asks, then one `tools/list`. Returns an
 * empty array rather than throwing: a server that handshakes but will not list is still confirmed
 * as speaking MCP, and losing that because the follow-up failed would be the wrong trade.
 */
async function listTools(
    url: string,
    session: string | null,
    options: ProbeOptions,
): Promise<{name: string; description: string | null}[]> {
    const headers: Record<string, string> = {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
    };
    if (session) headers["mcp-session-id"] = session;

    // Courtesy, and the spec's own sequence. Failure here is ignored by design.
    await send(
        {method: "POST", url, rpcMethod: "notifications/initialized"},
        {
            method: "POST",
            headers,
            body: JSON.stringify({jsonrpc: "2.0", method: "notifications/initialized"}),
        },
        options,
    );

    const sent = await send(
        {method: "POST", url, rpcMethod: "tools/list"},
        {
            method: "POST",
            headers,
            body: JSON.stringify({jsonrpc: "2.0", id: 2, method: "tools/list"}),
        },
        options,
    );
    if ("error" in sent) return [];
    try {
        const parsed = JSON.parse(unframe(sent.body)) as Record<string, unknown>;
        const result = parsed["result"] as Record<string, unknown> | undefined;
        const tools = Array.isArray(result?.["tools"]) ? result["tools"] : [];
        return tools.flatMap((tool) => {
            if (typeof tool !== "object" || tool === null) return [];
            const record = tool as Record<string, unknown>;
            const name = record["name"];
            if (typeof name !== "string" || name.length === 0) return [];
            return [
                {
                    name,
                    description:
                        typeof record["description"] === "string" ? record["description"] : null,
                },
            ];
        });
    } catch {
        return [];
    }
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
    const framed = unframe(body);
    let parsed: Record<string, unknown> | null = null;
    try {
        parsed = JSON.parse(framed) as Record<string, unknown>;
    } catch {
        parsed = null;
    }
    const result =
        parsed !== null && typeof parsed["result"] === "object" && parsed["result"] !== null
            ? (parsed["result"] as Record<string, unknown>)
            : null;

    if (response.ok && result !== null) {
        const info = (result["serverInfo"] ?? {}) as Record<string, unknown>;
        const server = {
            name: typeof info["name"] === "string" ? info["name"] : null,
            version: typeof info["version"] === "string" ? info["version"] : null,
            // What the server NEGOTIATED, not what we asked for. gmchain and nebula-scan both
            // answer 2024-11-05 to a 2025-06-18 request, which is correct MCP behaviour.
            protocolVersion:
                typeof result["protocolVersion"] === "string" ? result["protocolVersion"] : null,
        };
        const session = response.headers.get("mcp-session-id");
        const servedTools = options.listTools ? await listTools(url, session, options) : undefined;
        return {
            status: "confirmed",
            code: "serves-declared-protocol",
            httpStatus: response.status,
            request,
            detail:
                `answered \`initialize\` as ${server.name ?? "an unnamed server"}` +
                (server.protocolVersion ? ` on ${server.protocolVersion}` : "") +
                (servedTools ? `, serving ${servedTools.length} tools` : ""),
            server,
            ...(servedTools === undefined ? {} : {servedTools}),
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
    const rpcError =
        parsed === null ? null : (parsed["error"] as Record<string, unknown> | undefined);
    if (rpcError !== null && rpcError !== undefined && typeof rpcError["code"] === "number") {
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

/**
 * Candidate paths for an A2A agent card, in the order the spec and the wild both use.
 *
 * **A declared URL that is already a card is tried alone.** This used to append the two well-known
 * paths to the declared URL unconditionally, so an endpoint declared as
 * `https://host/a2a/<id>/.well-known/agent-card.json` was asked for
 * `…/agent-card.json/.well-known/agent-card.json` first — a path that cannot exist — then a second
 * one, and only then the URL itself, which is what answered. Measured on the 2026-10-27 walk: that
 * is **three requests per endpoint where one would do, 89 times against a single host**, and
 * `tasks/17` calls one request per endpoint per run a hard requirement. The walk's results were
 * unaffected (every one of the 89 won on the third candidate) but the courtesy cost was real.
 */
function a2aCandidates(url: string): string[] {
    const base = url.replace(/\/+$/, "");
    // A card is served at a file, not at a directory. If the declared URL already names one, a
    // well-known path appended to it is a path under a file.
    if (/\.json$/i.test(base)) return [url];
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
 *   request is made and nothing is claimed. Its share moves with whoever minted recently — 82% of
 *   real endpoints in the 2026-10-16 sample, 4% on 2026-10-27 — so the rule holds at any share.
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
