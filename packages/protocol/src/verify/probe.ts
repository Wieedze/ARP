import {
    DEFAULT_MAX_BODY_BYTES,
    HttpError,
    readArray,
    readBodyText,
    readRecord,
    readString,
    type FetchLike,
} from "@arp-protocol/graphql";

import type {DeclaredEndpoint, ProbeOutcome, ProbeRequest} from "./types.js";

/**
 * Identify the client. A recipient seeing this in their logs can find out who is calling and ask us
 * to stop, which is the minimum owed to someone whose server we are costing money.
 */
export const DEFAULT_USER_AGENT = "ARP-verifier/0.1 (+https://github.com/Wieedze/ARP)";

/** The IPFS gateway a `ipfs://` registration document is read through. */
export const IPFS_GATEWAY = "https://ipfs.io/ipfs/";

export type FetchableUrl =
    /** Fetch this. For an `ipfs://` document it is the gateway URL, not the original. */
    | {status: "fetch"; url: string}
    /** Do not fetch. `reason` is written for the caller that asked, not for a log. */
    | {status: "refuse"; reason: string};

/**
 * Whether a published document's URL is one this process will fetch, and what to fetch.
 *
 * **The scheme check `privateProbeTarget` assigns to its caller**, in one place so both callers get
 * it. That delegation was explicit — "not parseable is not private, the caller's own URL check is
 * what refuses it" — and one of the two callers did not do it: `arp_agent_endpoints` passed an
 * ERC-8004 `tokenURI`'s `registrationFile` straight to `fetch`, so `file:///etc/passwd` walked
 * through the private-address guard and Bun's `fetch` read it. Measured 2026-10-29: 200, and the
 * file's contents handed back to the caller. **Live rather than latent**, because the intended
 * caller is a process on the operator's own machine, so binding loopback bounded nothing.
 *
 * A document somebody published is reachable over http(s), or addressed by `ipfs://`. Anything else
 * — `file:`, `ftp:`, `jar:`, a bare path — reads the machine this runs on, and a `tokenURI` is a
 * string somebody else controls. `data:` is handled before this: it carries its own bytes and
 * there is nothing to fetch.
 *
 * The scheme is checked on **what was published**, before the gateway URL is built from it, so the
 * check cannot be fooled by what we construct.
 *
 * `ipfs://../../etc/passwd` becomes `https://ipfs.io/ipfs/../../etc/passwd` and that is harmless,
 * which is worth saying where somebody will later wonder: the authority is fixed by the prefix, so
 * nothing in the published string can move the host off the gateway. It is a path traversal against
 * a public gateway and it reads nothing local.
 *
 * **It checks one hop.** A redirect is the second half and `nextDocumentHop` is it — a guard on hop
 * one is not a guard, and the caller has to loop.
 */
export function fetchableDocumentUrl(
    published: string,
    options: {allowPrivate?: boolean} = {},
): FetchableUrl {
    const trimmed = published.trim();
    if (!/^(https?|ipfs):\/\//i.test(trimmed)) {
        return {
            status: "refuse",
            reason: "not an http, https or ipfs URL — this process fetches no other scheme",
        };
    }

    const url = /^ipfs:\/\//i.test(trimmed)
        ? `${IPFS_GATEWAY}${trimmed.slice("ipfs://".length)}`
        : trimmed;

    const local = options.allowPrivate === true ? null : privateProbeTarget(url);
    if (local !== null) {
        return {status: "refuse", reason: `${local} is not a public address`};
    }
    return {status: "fetch", url};
}

/**
 * How many hops a published document may redirect through before this gives up.
 *
 * Three covers `http`→`https`, a shortener and a trailing-slash normalisation. A document that
 * needs more is not a document somebody wants read.
 */
export const MAX_DOCUMENT_HOPS = 3;

/**
 * The next hop of a redirect, checked the way the first one was.
 *
 * **A guard on hop one is not a guard**, which is the whole reason this exists. Measured
 * 2026-10-29: a caller-controlled **public** host answering
 * `302 Location: http://169.254.169.254/latest/meta-data/` returned the private body, because
 * `fetch` follows redirects by default and `fetchableDocumentUrl` had already said yes to the
 * public first hop. No DNS control needed, so the "resolves to a private address" caveat does not
 * cover it.
 *
 * `location` is resolved against `from`, because a `Location` may be relative — and a relative one
 * cannot move the host, so it is the absolute ones that matter and both go through the same check.
 */
export function nextDocumentHop(
    from: string,
    location: string,
    options: {allowPrivate?: boolean} = {},
): FetchableUrl {
    let absolute: string;
    try {
        absolute = new URL(location, from).toString();
    } catch {
        return {status: "refuse", reason: `redirected to something that is not a URL: ${location}`};
    }
    const answer = fetchableDocumentUrl(absolute, options);
    if (answer.status === "refuse") {
        return {status: "refuse", reason: `redirected to ${absolute}: ${answer.reason}`};
    }
    return answer;
}

/** An IPv4 literal as four octets, or null when `host` is not exactly a dotted quad. */
function parseIpv4(host: string): [number, number, number, number] | null {
    const quad = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
    if (quad === null) return null;
    const octets = [Number(quad[1]), Number(quad[2]), Number(quad[3]), Number(quad[4])];
    if (octets.some((octet) => octet > 255)) return null;
    const [a = 0, b = 0, c = 0, d = 0] = octets;
    return [a, b, c, d];
}

/**
 * An IPv6 literal as eight 16-bit groups, or null when `host` is not one.
 *
 * Handles `::` compression and a dotted-quad tail (`::ffff:127.0.0.1`), because a caller that did
 * not come through `URL` can pass either spelling. A zone id (`%eth0`) is dropped: `URL` refuses
 * one, and a link-local address is refused with or without it.
 */
function parseIpv6(host: string): number[] | null {
    const bare = host.split("%")[0] ?? "";
    if (!bare.includes(":")) return null;
    let text = bare;
    const lastColon = text.lastIndexOf(":");
    const quad = parseIpv4(text.slice(lastColon + 1));
    if (quad !== null) {
        // The dotted tail is two groups written another way.
        const high = ((quad[0] << 8) | quad[1]).toString(16);
        const low = ((quad[2] << 8) | quad[3]).toString(16);
        text = `${text.slice(0, lastColon + 1)}${high}:${low}`;
    }
    const halves = text.split("::");
    if (halves.length > 2) return null;
    const parse = (part: string): number[] | null => {
        if (part === "") return [];
        const groups: number[] = [];
        for (const group of part.split(":")) {
            if (!/^[0-9a-f]{1,4}$/i.test(group)) return null;
            groups.push(Number.parseInt(group, 16));
        }
        return groups;
    };
    const head = parse(halves[0] ?? "");
    const rest = halves.length === 2 ? parse(halves[1] ?? "") : [];
    if (head === null || rest === null) return null;
    const given = head.length + rest.length;
    if (halves.length === 1) return given === 8 ? head : null;
    if (given > 7) return null;
    return [...head, ...new Array<number>(8 - given).fill(0), ...rest];
}

/** Whether an IPv4 address is one nobody outside this machine or network should be asked for. */
function isPrivateIpv4([a, b, c]: readonly [number, number, number, number]): boolean {
    if (a === 0) return true; // 0.0.0.0/8, "this network" — 0.0.0.0 reaches loopback on Linux
    if (a === 10) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10, carrier-grade NAT
    if (a === 127) return true;
    // 169.254.0.0/16 is link-local, and it is where every cloud metadata service lives.
    if (a === 169 && b === 254) return true;
    // 172.16.0.0/12 is 172.16 through 172.31 — not all of 172, which would refuse public hosts.
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 0 && c === 0) return true; // 192.0.0.0/24, IETF protocol assignments
    if (a === 192 && b === 168) return true;
    if (a === 198 && (b === 18 || b === 19)) return true; // 198.18.0.0/15, benchmarking
    if (a >= 224) return true; // 224/4 multicast, 240/4 reserved, 255.255.255.255 broadcast
    return false;
}

function ipv4FromGroups(high: number, low: number): [number, number, number, number] {
    return [high >> 8, high & 0xff, low >> 8, low & 0xff];
}

/** Whether an IPv6 address is private, including every form that carries an IPv4 one. */
function isPrivateIpv6(groups: readonly number[]): boolean {
    const [g0 = 0, g1 = 0, g2 = 0, g3 = 0, g4 = 0, g5 = 0, g6 = 0, g7 = 0] = groups;
    const leadingZero = g0 === 0 && g1 === 0 && g2 === 0 && g3 === 0 && g4 === 0;
    // `::` unspecified, `::1` loopback, and `::a.b.c.d` IPv4-compatible (deprecated, still routed
    // to the embedded address by some stacks): all of ::/96 is judged by its last 32 bits, which
    // makes `::` and `::1` private through 0.0.0.0/8.
    if (leadingZero && g5 === 0) return isPrivateIpv4(ipv4FromGroups(g6, g7));
    // ::ffff:0:0/96, IPv4-mapped.
    if (leadingZero && g5 === 0xffff) return isPrivateIpv4(ipv4FromGroups(g6, g7));
    // 64:ff9b::/96, NAT64 well-known prefix: the gateway connects to the embedded address.
    if (g0 === 0x64 && g1 === 0xff9b && g2 === 0 && g3 === 0 && g4 === 0 && g5 === 0) {
        return isPrivateIpv4(ipv4FromGroups(g6, g7));
    }
    // 64:ff9b:1::/48, NAT64 local-use: private by definition.
    if (g0 === 0x64 && g1 === 0xff9b && g2 === 1) return true;
    // 2002::/16, 6to4: the next 32 bits are an IPv4 address.
    if (g0 === 0x2002) return isPrivateIpv4(ipv4FromGroups(g1, g2));
    if ((g0 & 0xfe00) === 0xfc00) return true; // fc00::/7, unique local
    if ((g0 & 0xffc0) === 0xfe80) return true; // fe80::/10, link-local
    if ((g0 & 0xffc0) === 0xfec0) return true; // fec0::/10, site-local (deprecated)
    if ((g0 & 0xff00) === 0xff00) return true; // ff00::/8, multicast
    return false;
}

/**
 * Whether an IP literal — as a resolver returns it, no brackets — is private. False for anything
 * that is not a literal: a name says nothing until it is resolved.
 */
export function privateAddress(address: string): boolean {
    const literal = address.toLowerCase();
    const v4 = parseIpv4(literal);
    if (v4 !== null) return isPrivateIpv4(v4);
    const v6 = parseIpv6(literal);
    return v6 !== null && isPrivateIpv6(v6);
}

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
 * and connecting to the resolved address, which `fetch` does not expose. `guardedFetchText` takes an
 * optional `resolveHost` that refuses a name resolving to a private address, which a Node caller can
 * supply; a browser cannot, and rebinding between that lookup and the connection stays open either
 * way. So this is a guard against the common case, not a boundary, and `docs/22` says so.
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
    // `localhost.` is `localhost` to a resolver; `URL` keeps the trailing dot.
    const name = host.replace(/\.+$/, "");

    if (name === "localhost" || name.endsWith(".localhost")) return host;
    // `.internal` and `.local` are the names a cloud or an mDNS network answers on.
    if (name.endsWith(".internal") || name.endsWith(".local")) return host;

    // Only a LITERAL gets the range checks. `10.example.com` is a perfectly good public hostname
    // and a prefix test on the string refuses it — the test for that case is in
    // `probe-private.test.ts` and it caught this.
    //
    // `URL` has already normalised the shorthands: `2130706433`, `127.1` and `0177.0.0.1` all
    // arrive here as `127.0.0.1`, and `[::ffff:127.0.0.1]` arrives as `::ffff:7f00:1` — measured
    // 2026-10-29, which is why the IPv6 parse works on groups rather than on the dotted spelling.
    return privateAddress(name) ? host : null;
}

/**
 * Resolves a hostname to the addresses a connection would use. Optional, and Node-only in
 * practice: `dns.promises.lookup(host, {all: true})` mapped to its `address` fields is one.
 */
export type ResolveHost = (hostname: string) => Promise<readonly string[]>;

export type GuardedFetchOptions = {
    timeoutMs: number;
    /** Body cap, `DEFAULT_MAX_BODY_BYTES` when absent. */
    maxBytes?: number;
    /** Lets a private address through, for a rig that probes its own endpoints on purpose. */
    allowPrivate?: boolean;
    /** Redirects followed before giving up, `MAX_DOCUMENT_HOPS` when absent. */
    maxHops?: number;
    /**
     * When given, every hop's hostname is resolved and refused if any address it resolves to is
     * private. Without it, a public name pointing at `127.0.0.1` passes: `fetch` resolves names
     * itself and exposes neither the address nor a hook, and a browser offers no resolver at all.
     * Even with it, the connection resolves again, so DNS rebinding between the two lookups is
     * not closed. A guard against the common case, not a boundary.
     */
    resolveHost?: ResolveHost;
};

export type GuardedFetch =
    /** `url` is the hop that answered, which is not the one asked for after a redirect. */
    | {status: "ok"; response: Response; text: string; url: string}
    /** Not fetched, or not followed. `reason` is written for the caller that asked. */
    | {status: "refused"; reason: string};

const REDIRECTS = new Set([301, 302, 303, 307, 308]);

async function resolvesPrivate(url: string, resolveHost: ResolveHost): Promise<string | null> {
    const host = new URL(url).hostname.replace(/^\[|\]$/g, "");
    const addresses = await resolveHost(host);
    for (const address of addresses) {
        if (privateAddress(address)) return `${host} resolves to ${address}, not a public address`;
    }
    return null;
}

/**
 * Fetch a URL somebody else supplied: every hop checked, one deadline over all of them and the
 * body, the body capped.
 *
 * Redirects are followed **by hand**. `redirect: "follow"` lets the runtime walk a public first
 * hop to `http://169.254.169.254/` without asking, which is the SSRF `nextDocumentHop` exists to
 * close; here each `Location` goes through it before anything is sent there.
 *
 * In a browser `redirect: "manual"` yields an opaque response that hides the `Location`, so a
 * redirect there is refused rather than followed blind. Server-side runtimes expose it.
 *
 * Throws `HttpError` for a network failure, a deadline or an oversized body. A refusal is a value.
 */
export async function guardedFetchText(
    fetchImpl: FetchLike,
    url: string,
    init: RequestInit,
    options: GuardedFetchOptions,
): Promise<GuardedFetch> {
    const allowPrivate = options.allowPrivate === true;
    const maxHops = options.maxHops ?? MAX_DOCUMENT_HOPS;
    const {timeoutMs} = options;

    const first = fetchableDocumentUrl(url, {allowPrivate});
    if (first.status === "refuse") return {status: "refused", reason: first.reason};

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        let current = first.url;
        let currentInit: RequestInit = init;
        for (let hop = 0; ; hop += 1) {
            if (!allowPrivate && options.resolveHost !== undefined) {
                const resolved = await resolvesPrivate(current, options.resolveHost);
                if (resolved !== null) return {status: "refused", reason: resolved};
            }

            let response: Response;
            try {
                response = await fetchImpl(current, {
                    ...currentInit,
                    signal: controller.signal,
                    redirect: "manual",
                });
            } catch (error) {
                if (controller.signal.aborted) {
                    throw new HttpError(
                        "timeout",
                        `timed out after ${timeoutMs}ms: ${current}`,
                        timeoutMs,
                    );
                }
                throw new HttpError(
                    "network",
                    error instanceof Error ? error.message : String(error),
                    timeoutMs,
                    error,
                );
            }

            if (response.type === "opaqueredirect") {
                return {
                    status: "refused",
                    reason: `${current} redirected, and this runtime does not expose where to`,
                };
            }

            const location = REDIRECTS.has(response.status)
                ? response.headers.get("location")
                : null;
            if (location === null) {
                const text = await readBodyText(response, {
                    signal: controller.signal,
                    timeoutMs,
                    maxBytes: options.maxBytes ?? DEFAULT_MAX_BODY_BYTES,
                });
                return {status: "ok", response, text, url: current};
            }

            await response.body?.cancel().catch(() => undefined);
            if (hop >= maxHops) {
                return {status: "refused", reason: `more than ${maxHops} redirects from ${url}`};
            }
            const next = nextDocumentHop(current, location, {allowPrivate});
            if (next.status === "refuse") return {status: "refused", reason: next.reason};

            // What `fetch` itself does: a 303, or a 301/302 answering a POST, becomes a bodiless
            // GET. A 307 or 308 repeats the request as it was.
            const method = (currentInit.method ?? "GET").toUpperCase();
            if (response.status === 303 || (method === "POST" && response.status <= 302)) {
                const {body: _body, ...rest} = currentInit;
                currentInit = {...rest, method: "GET"};
            }
            current = next.url;
        }
    } finally {
        clearTimeout(timer);
    }
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
     * one — could not satisfy it. `scripts/verify/verify-cohort.ts` has such a wrapper and was the thing
     * that could not typecheck (`docs/tasks/21`). The prober only ever calls it with a string URL.
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
    /**
     * Probe a private address, and follow a redirect to one. Off by default: the URL is somebody
     * else's, and a probe pointed at `127.0.0.1` reads the operator's own network.
     */
    allowPrivate?: boolean;
    /** See `GuardedFetchOptions.resolveHost`. */
    resolveHost?: ResolveHost;
    /** Response body cap, `PROBE_MAX_BODY_BYTES` when absent. */
    maxBodyBytes?: number;
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

/** The most body a probe reads. A `tools/list` is kilobytes; a stranger's endpoint gets a megabyte. */
export const PROBE_MAX_BODY_BYTES = 1024 * 1024;

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
): Promise<{response: Response; body: string} | {error: unknown} | {refused: string}> {
    const doFetch = options.fetch ?? globalThis.fetch;
    try {
        const answer = await guardedFetchText(
            doFetch,
            request.url,
            {
                ...init,
                headers: {
                    "user-agent": options.userAgent ?? DEFAULT_USER_AGENT,
                    ...(init.headers ?? {}),
                },
            },
            {
                timeoutMs: options.timeoutMs ?? DEFAULT_PROBE_TIMEOUT_MS,
                maxBytes: options.maxBodyBytes ?? PROBE_MAX_BODY_BYTES,
                ...(options.allowPrivate === true ? {allowPrivate: true} : {}),
                ...(options.resolveHost === undefined ? {} : {resolveHost: options.resolveHost}),
            },
        );
        if (answer.status === "refused") return {refused: answer.reason};
        return {response: answer.response, body: answer.text};
    } catch (error) {
        return {error};
    }
}

/** Not sent, or not followed: the URL or a redirect pointed somewhere this prober will not go. */
function refusedOutcome(request: ProbeRequest, reason: string): ProbeOutcome {
    return {
        status: "inconclusive",
        code: "refused",
        httpStatus: null,
        request,
        observed: "",
        detail: `not probed: ${reason}`,
    };
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
    if (!("response" in sent)) return [];
    try {
        const parsed: unknown = JSON.parse(unframe(sent.body));
        const tools = readArray(readRecord(parsed, "result"), "tools");
        return tools.flatMap((tool) => {
            const name = readString(tool, "name");
            if (name === null || name.length === 0) return [];
            return [{name, description: readString(tool, "description")}];
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
    if ("refused" in sent) return refusedOutcome(request, sent.refused);
    const {response, body} = sent;
    if (response.status === 429 || response.status === 503) {
        return rateLimited(request, response.status, body);
    }
    const framed = unframe(body);
    let parsed: unknown = null;
    try {
        parsed = JSON.parse(framed);
    } catch {
        parsed = null;
    }
    const result = readRecord(parsed, "result");

    if (response.ok && result !== null) {
        const info = readRecord(result, "serverInfo");
        const server = {
            name: readString(info, "name"),
            version: readString(info, "version"),
            // What the server NEGOTIATED, not what we asked for. gmchain and nebula-scan both
            // answer 2024-11-05 to a 2025-06-18 request, which is correct MCP behaviour.
            protocolVersion: readString(result, "protocolVersion"),
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
    const rpcError = readRecord(parsed, "error");
    if (rpcError !== null && typeof rpcError["code"] === "number") {
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
 * `docs/tasks/17` calls one request per endpoint per run a hard requirement. The walk's results were
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
        if ("refused" in sent) return refusedOutcome(request, sent.refused);
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
    if ("refused" in sent) return refusedOutcome(request, sent.refused);
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
