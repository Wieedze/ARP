import {describe, expect, it} from "vitest";

import {readDeclaredEndpoints} from "../src/verify/declaration.js";
import {HostLimiter, hostOf} from "../src/verify/host-limiter.js";
import {probeEndpoint} from "../src/verify/probe.js";
import type {DeclaredEndpoint} from "../src/verify/types.js";

/**
 * Responses recorded from live endpoints on 2026-10-16, with the token id they came from. The
 * inconclusive ones matter most: they are the shapes that would otherwise be reported as defects.
 */
const RECORDED = {
    /** 8453:51097 `https://mcp.surfliquid.com/mcp` — a real MCP server. */
    mcpResult: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        result: {protocolVersion: "2025-06-18", capabilities: {tools: {}}, serverInfo: {name: "x"}},
    }),
    /** 8453:2340 (Clawnch) — declares six MCP tools; a standard client gets this and zero tools. */
    clawnchSessionId: JSON.stringify({error: "Missing sessionId query parameter"}),
    /** 8453:19682 — the declared MCP host is a dead Railway deployment. */
    railway404: JSON.stringify({status: "error", code: 404, message: "Application not found"}),
    /** A server that understood the envelope and refused the call. */
    jsonRpcError: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        error: {code: -32601, message: "Method not found"},
    }),
    /** 8453:26183 `.../.well-known/agent-card.json`. */
    agentCard: JSON.stringify({name: "nebula-scan", skills: [{id: "scan"}]}),
};

function endpoint(over: Partial<DeclaredEndpoint> = {}): DeclaredEndpoint {
    return {
        declaredUnder: "endpoints",
        name: "mcp",
        protocol: "mcp",
        version: null,
        capabilities: [],
        classification: {
            status: "probeable",
            url: "https://example.test/mcp",
            declared: "https://example.test/mcp",
        },
        ...over,
    };
}

const respond = (body: string, status = 200) =>
    (async () =>
        new Response(body, {
            status,
            headers: {"content-type": "application/json"},
        })) as unknown as typeof fetch;

const never: typeof fetch = (() => {
    throw new Error("fetch must not be called");
}) as unknown as typeof fetch;

describe("probeEndpoint — not-checkable is never probed", () => {
    it("makes no request at all, and carries the code through", async () => {
        // The guarantee that matters: an unprobeable endpoint costs its operator nothing, and we
        // claim nothing about it. `never` throws if a request is attempted.
        const outcome = await probeEndpoint(
            endpoint({
                classification: {
                    status: "not-checkable",
                    code: "templated",
                    declared: "https://x.test/{agentId}",
                    placeholder: "{agentId}",
                },
            }),
            {fetch: never},
        );
        expect(outcome.status).toBe("not-checkable");
        if (outcome.status !== "not-checkable") return;
        expect(outcome.code).toBe("templated");
        expect(outcome).not.toHaveProperty("request");
    });

    it("never probes any of the four not-checkable codes", async () => {
        for (const code of [
            "templated",
            "non-http-identifier",
            "unparseable-url",
            "empty",
        ] as const) {
            const outcome = await probeEndpoint(
                endpoint({classification: {status: "not-checkable", code, declared: "x"}}),
                {fetch: never},
            );
            expect(outcome.status).toBe("not-checkable");
        }
    });
});

describe("probeEndpoint — MCP", () => {
    it("confirms an endpoint that answers `initialize` with a result", async () => {
        const outcome = await probeEndpoint(endpoint(), {fetch: respond(RECORDED.mcpResult)});
        expect(outcome.status).toBe("confirmed");
        if (outcome.status !== "confirmed") return;
        expect(outcome.code).toBe("serves-declared-protocol");
        // Every confirmed row says what established it, so a reviewer can reproduce it.
        expect(outcome.request).toEqual({
            method: "POST",
            url: "https://example.test/mcp",
            rpcMethod: "initialize",
        });
    });

    it("reports Clawnch's sessionId response as INCONCLUSIVE, not as a defect", async () => {
        // This is the case the whole three-group design exists for. Clawnch declares six MCP tools
        // and a standard client gets `Missing sessionId query parameter`. That may be a broken
        // deployment, or it may be a transport variant our handshake does not speak. One exchange
        // cannot tell, so accusing would be this task's version of a false `mismatch`.
        const outcome = await probeEndpoint(endpoint(), {
            fetch: respond(RECORDED.clawnchSessionId, 400),
        });
        expect(outcome.status).toBe("inconclusive");
        if (outcome.status !== "inconclusive") return;
        expect(outcome.code).toBe("unrecognised-response");
        expect(outcome.observed).toContain("Missing sessionId");
        expect(outcome.detail).toContain("our handshake may be wrong");
    });

    it("confirms not-served only when the server answers in JSON-RPC and refuses", async () => {
        // A JSON-RPC error means the envelope was understood. That is the one shape from which we
        // can say the endpoint does not serve what it declared without guessing.
        const outcome = await probeEndpoint(endpoint(), {fetch: respond(RECORDED.jsonRpcError)});
        expect(outcome.status).toBe("confirmed");
        if (outcome.status !== "confirmed") return;
        expect(outcome.code).toBe("declared-protocol-not-served");
    });

    it("confirms dead on a 5xx", async () => {
        const outcome = await probeEndpoint(endpoint(), {
            fetch: respond(RECORDED.railway404, 502),
        });
        expect(outcome.status).toBe("confirmed");
        if (outcome.status !== "confirmed") return;
        expect(outcome.code).toBe("dead");
        expect(outcome.httpStatus).toBe(502);
    });

    it("treats a 429 as the host asking us to stop, not as a verdict", async () => {
        const outcome = await probeEndpoint(endpoint(), {fetch: respond("slow down", 429)});
        expect(outcome.status).toBe("inconclusive");
        if (outcome.status !== "inconclusive") return;
        expect(outcome.code).toBe("rate-limited");
        expect(outcome.detail).toContain("nothing was established");
    });

    it("treats a timeout as a fact but a TLS or DNS failure as inconclusive", async () => {
        const timeout = await probeEndpoint(endpoint(), {
            fetch: (() =>
                Promise.reject(new Error("The operation timed out."))) as unknown as typeof fetch,
        });
        expect(timeout.status).toBe("confirmed");
        if (timeout.status === "confirmed") expect(timeout.code).toBe("dead");

        const tls = await probeEndpoint(endpoint(), {
            fetch: (() =>
                Promise.reject(
                    new Error("unable to verify the first certificate"),
                )) as unknown as typeof fetch,
        });
        // Could be our network as much as theirs, so it says so rather than blaming the agent.
        expect(tls.status).toBe("inconclusive");
        if (tls.status === "inconclusive") expect(tls.code).toBe("transport-error");
    });
});

describe("probeEndpoint — what the server says about itself", () => {
    const INIT = JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        result: {
            protocolVersion: "2024-11-05",
            capabilities: {tools: {}},
            serverInfo: {name: "NebulaScan", version: "1.0.0"},
        },
    });
    const TOOLS = JSON.stringify({
        jsonrpc: "2.0",
        id: 2,
        result: {
            tools: [
                {name: "bridge_monitor", description: "Track real-time inflows"},
                {name: "peg_checker"},
                {name: ""},
                "not an object",
            ],
        },
    });

    it("records the NEGOTIATED protocol version, not the one we asked for", async () => {
        // Live: gmchain and nebula-scan both answer 2024-11-05 to a 2025-06-18 request. That is
        // correct MCP version negotiation, and the server's answer is the fact worth keeping.
        const outcome = await probeEndpoint(endpoint(), {fetch: respond(INIT)});
        expect(outcome.status).toBe("confirmed");
        if (outcome.status !== "confirmed") return;
        expect(outcome.server).toEqual({
            name: "NebulaScan",
            version: "1.0.0",
            protocolVersion: "2024-11-05",
        });
        expect(outcome.detail).toContain("NebulaScan");
        expect(outcome.detail).toContain("2024-11-05");
    });

    it("asks for nothing extra unless listTools is set", async () => {
        // One request is the courtesy baseline; the follow-up is opt-in.
        let calls = 0;
        const outcome = await probeEndpoint(endpoint(), {
            fetch: (async () => {
                calls += 1;
                return new Response(INIT, {status: 200});
            }) as unknown as typeof fetch,
        });
        expect(calls).toBe(1);
        if (outcome.status === "confirmed") expect(outcome.servedTools).toBeUndefined();
    });

    it("recovers the tool list the registration file did not carry", async () => {
        // The reason this exists: 0 of ~110 parsed documents across repeated n=200 samples (scripts/measure/cohort-skills.ts; the zero is stable, the denominator varies) declared a capability, while all
        // three confirmed MCP servers listed theirs. The runtime is where the data is.
        const bodies = [INIT, "{}", TOOLS];
        let i = 0;
        const outcome = await probeEndpoint(endpoint(), {
            listTools: true,
            fetch: (async () =>
                new Response(bodies[i++] ?? "{}", {status: 200})) as unknown as typeof fetch,
        });
        expect(outcome.status).toBe("confirmed");
        if (outcome.status !== "confirmed") return;
        // Nameless and non-object entries are dropped rather than yielding blank rows.
        expect(outcome.servedTools).toEqual([
            {name: "bridge_monitor", description: "Track real-time inflows"},
            {name: "peg_checker", description: null},
        ]);
        expect(outcome.detail).toContain("serving 2 tools");
    });

    it("stays confirmed when the handshake works but tools/list does not", async () => {
        // Losing a confirmed MCP server because a follow-up failed would be the wrong trade.
        const bodies = [INIT, "{}", "gateway timeout"];
        let i = 0;
        const outcome = await probeEndpoint(endpoint(), {
            listTools: true,
            fetch: (async () =>
                new Response(bodies[i++] ?? "{}", {status: 200})) as unknown as typeof fetch,
        });
        expect(outcome.status).toBe("confirmed");
        if (outcome.status !== "confirmed") return;
        expect(outcome.servedTools).toEqual([]);
    });

    it("reads an SSE-framed answer instead of calling it unrecognised", async () => {
        // Some deployments answer a single POST with text/event-stream even when the client accepts
        // plain JSON. Treating that as unparseable would report a working server as inconclusive.
        const framed = `event: message\ndata: ${INIT}\n\n`;
        const outcome = await probeEndpoint(endpoint(), {fetch: respond(framed)});
        expect(outcome.status).toBe("confirmed");
        if (outcome.status !== "confirmed") return;
        expect(outcome.server?.name).toBe("NebulaScan");
    });
});

describe("probeEndpoint — A2A and plain", () => {
    it("confirms an agent card at the well-known path", async () => {
        const seen: string[] = [];
        const outcome = await probeEndpoint(endpoint({name: "a2a", protocol: "a2a"}), {
            fetch: (async (url: string) => {
                seen.push(String(url));
                return new Response(RECORDED.agentCard, {status: 200});
            }) as unknown as typeof fetch,
        });
        expect(outcome.status).toBe("confirmed");
        expect(seen[0]).toContain("/.well-known/agent-card.json");
    });

    it("falls through the candidate paths before giving up", async () => {
        const seen: string[] = [];
        await probeEndpoint(endpoint({name: "a2a", protocol: "a2a"}), {
            fetch: (async (url: string) => {
                seen.push(String(url));
                return new Response("not found", {status: 404});
            }) as unknown as typeof fetch,
        });
        expect(seen).toHaveLength(3);
        expect(seen[1]).toContain("/.well-known/agent.json");
    });

    it("asks once when the declared URL is already a card", async () => {
        // The courtesy defect of the 2026-10-27 walk: centralcity declares the card path itself,
        // and appending `/.well-known/agent-card.json` to it made three requests out of one. A
        // count assertion is the only thing that catches it — all three outcomes were `confirmed`.
        const seen: string[] = [];
        const outcome = await probeEndpoint(
            endpoint({
                name: "a2a",
                protocol: "a2a",
                classification: {
                    status: "probeable",
                    url: "https://host.test/a2a/abc/.well-known/agent-card.json",
                    declared: "https://host.test/a2a/abc/.well-known/agent-card.json",
                },
            }),
            {
                fetch: (async (url: string) => {
                    seen.push(String(url));
                    return new Response(RECORDED.agentCard, {status: 200});
                }) as unknown as typeof fetch,
            },
        );
        expect(outcome.status).toBe("confirmed");
        expect(seen).toEqual(["https://host.test/a2a/abc/.well-known/agent-card.json"]);
    });

    it("calls a named-but-unknown endpoint live when it answers under 500", async () => {
        const outcome = await probeEndpoint(
            endpoint({
                name: "web",
                protocol: null,
                classification: {
                    status: "probeable",
                    url: "https://trenches.bid/",
                    declared: "https://trenches.bid",
                },
            }),
            {fetch: respond("<html></html>", 200)},
        );
        expect(outcome.status).toBe("confirmed");
        if (outcome.status !== "confirmed") return;
        // `live` is a weaker claim than `serves-declared-protocol`, and stays weaker: the name said
        // nothing checkable, so answering is all we know.
        expect(outcome.code).toBe("live");
    });
});

describe("HostLimiter", () => {
    const clock = () => {
        let t = 0;
        return {
            now: () => t,
            sleep: async (ms: number) => {
                t += ms;
            },
            advance: (ms: number) => {
                t += ms;
            },
            get t() {
                return t;
            },
        };
    };

    it("buckets by host, so one operator cannot be hit in parallel", () => {
        expect(hostOf("https://platform.termix.live/a/1")).toBe("platform.termix.live");
        expect(hostOf("https://PLATFORM.Termix.live/b/2")).toBe("platform.termix.live");
        expect(hostOf("not a url")).toBe("unparseable:not a url");
    });

    it("serialises same-host calls and leaves a gap between them", async () => {
        const c = clock();
        const limiter = new HostLimiter({minGapMs: 250, now: c.now, sleep: c.sleep});
        const order: string[] = [];
        await Promise.all([
            limiter.run("https://one.test/a", async () => void order.push("a")),
            limiter.run("https://one.test/b", async () => void order.push("b")),
        ]);
        expect(order).toEqual(["a", "b"]);
        // The second waited out the gap rather than going straight away.
        expect(c.t).toBeGreaterThanOrEqual(250);
    });

    it("does not make a different host wait behind the first", async () => {
        const c = clock();
        const limiter = new HostLimiter({minGapMs: 1_000, now: c.now, sleep: c.sleep});
        await limiter.run("https://one.test/a", async () => {});
        const before = c.t;
        await limiter.run("https://two.test/a", async () => {});
        expect(c.t).toBe(before);
    });

    it("honours a numeric Retry-After", async () => {
        const c = clock();
        const limiter = new HostLimiter({now: c.now, sleep: c.sleep});
        limiter.backOff("https://one.test/a", "30");
        expect(limiter.nextFreeFor("https://one.test/b")).toBe(30_000);
    });

    it("still backs off when Retry-After is absent or unreadable", async () => {
        // The signal was sent. Treating an unparseable header as zero would ignore it.
        const c = clock();
        const limiter = new HostLimiter({now: c.now, sleep: c.sleep, defaultBackOffMs: 60_000});
        limiter.backOff("https://one.test/a", null);
        expect(limiter.nextFreeFor("https://one.test/a")).toBe(60_000);
        limiter.backOff("https://two.test/a", "soon please");
        expect(limiter.nextFreeFor("https://two.test/a")).toBe(60_000);
    });

    it("caps an absurd Retry-After so one header cannot stall the walk", async () => {
        const c = clock();
        const limiter = new HostLimiter({now: c.now, sleep: c.sleep});
        limiter.backOff("https://one.test/a", String(60 * 60 * 24));
        expect(limiter.nextFreeFor("https://one.test/a")).toBe(10 * 60_000);
    });

    it("releases the host when the task throws", async () => {
        // Otherwise one failing endpoint closes its host for the rest of the walk, turning a
        // transport error into a cohort-wide gap.
        const c = clock();
        const limiter = new HostLimiter({minGapMs: 0, now: c.now, sleep: c.sleep});
        await expect(
            limiter.run("https://one.test/a", async () => {
                throw new Error("boom");
            }),
        ).rejects.toThrow("boom");
        await expect(limiter.run("https://one.test/b", async () => "ok")).resolves.toBe("ok");
    });

    it("reads a real declaration and probes only what is probeable", async () => {
        const endpoints = readDeclaredEndpoints({
            services: [
                {name: "wallet", endpoint: "eip155:8453:0xabc"},
                {name: "A2A", endpoint: "https://x.test/api/v1/a2a/agents/{agentId}/card"},
                {name: "mcp", endpoint: "https://x.test/mcp"},
            ],
        });
        let requests = 0;
        const outcomes = await Promise.all(
            endpoints.map((e) =>
                probeEndpoint(e, {
                    fetch: (async () => {
                        requests += 1;
                        return new Response(RECORDED.mcpResult, {status: 200});
                    }) as unknown as typeof fetch,
                }),
            ),
        );
        // Three declared, one probeable, one request.
        expect(outcomes.map((o) => o.status)).toEqual([
            "not-checkable",
            "not-checkable",
            "confirmed",
        ]);
        expect(requests).toBe(1);
    });
});
