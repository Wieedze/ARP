import {spawn, type ChildProcess} from "node:child_process";
import {createServer, type Server} from "node:http";

import {afterAll, beforeAll, describe, expect, it} from "vitest";

/**
 * ARP's MCP server, over a real HTTP round trip.
 *
 * Started as a subprocess rather than imported, because the thing worth testing is the wire
 * behaviour: an MCP client speaks JSON-RPC over HTTP and gets whatever the server actually sends.
 * Importing the handler would test the function and not the protocol — the distinction that cost
 * this project a live outage once, when a mocked transport proved a variable was passed and not
 * that the query was valid.
 *
 * The graph is stubbed through `INTUITION_GRAPHQL_URL` so the suite is hermetic and the read path's
 * own tests (`tool-usage.test.ts`) stay the place the data mapping is checked.
 *
 * Node's `child_process` and `http` rather than `Bun.spawn` and `Bun.serve`: the server is Bun-run
 * and may use them, but this package must typecheck without `@types/bun`, which is installed nowhere
 * in the repo (`tasks/21`). An earlier draft used the Bun globals, the suite went green, and `tsc`
 * was red — the gate-scope failure `rules/claims.md` check 4 exists for.
 */
const PORT = 3099;
const BASE = `http://127.0.0.1:${PORT}/mcp`;
let server: ChildProcess | null = null;
let stub: Server | null = null;

const STUBBED = {
    tool: [{term_id: `0x${"ab".repeat(32)}`, label: "Stubbed Tool", data: "ipfs://stub"}],
    triples: [
        {
            term_id: "0xaaa1",
            subject: {term_id: "0xs1", label: "An Agent", type: "Thing"},
            term: {total_assets: "5000", vaults: [{position_count: 2}]},
            counter_term: {total_assets: "0", vaults: [{position_count: 0}]},
        },
    ],
};

async function rpc(method: string, params?: unknown, id: number | null = 1) {
    const response = await fetch(BASE, {
        method: "POST",
        headers: {"content-type": "application/json", accept: "application/json"},
        body: JSON.stringify({
            jsonrpc: "2.0",
            ...(id === null ? {} : {id}),
            method,
            ...(params ? {params} : {}),
        }),
    });
    if (response.status === 202) return {status: 202, body: null};
    return {status: response.status, body: (await response.json()) as Record<string, unknown>};
}

beforeAll(async () => {
    stub = createServer((_request, response) => {
        response.writeHead(200, {"content-type": "application/json"});
        response.end(JSON.stringify({data: STUBBED}));
    });
    await new Promise<void>((resolve) => stub!.listen(PORT + 1, "127.0.0.1", resolve));

    server = spawn("bun", ["run", "scripts/arp-mcp-server.ts"], {
        cwd: new URL("../..", import.meta.url).pathname,
        env: {
            ...process.env,
            PORT: String(PORT),
            INTUITION_GRAPHQL_URL: `http://127.0.0.1:${PORT + 1}/v1/graphql`,
        },
        stdio: "ignore",
    });
    // Poll rather than sleep a fixed time: a fixed wait is either slow or flaky.
    for (let i = 0; i < 60; i += 1) {
        try {
            const ping = await fetch(BASE, {
                method: "POST",
                headers: {"content-type": "application/json"},
                body: JSON.stringify({jsonrpc: "2.0", id: 0, method: "ping"}),
            });
            if (ping.ok) return;
        } catch {
            /* not up yet */
        }
        await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error("the MCP server did not come up");
}, 20_000);

afterAll(async () => {
    server?.kill();
    await new Promise<void>((resolve) => {
        if (stub === null) return resolve();
        stub.close(() => resolve());
    });
});

describe("the handshake", () => {
    it("answers `initialize` with a result a standard client accepts", async () => {
        const {body} = await rpc("initialize", {
            protocolVersion: "2025-06-18",
            capabilities: {},
            clientInfo: {name: "test", version: "0"},
        });
        const result = body?.["result"] as Record<string, unknown>;
        expect(result["protocolVersion"]).toBe("2025-06-18");
        expect(result["serverInfo"]).toMatchObject({name: "ARP"});
        expect(result["capabilities"]).toHaveProperty("tools");
        // The instructions tell a caller the one thing it must not get wrong.
        expect(String(result["instructions"])).toContain("composes no score");
    });

    it("takes the `initialized` notification without a body", async () => {
        // A notification has no id and must not get a JSON-RPC response. Returning one would make a
        // strict client treat it as an unsolicited reply.
        const {status, body} = await rpc("notifications/initialized", undefined, null);
        expect(status).toBe(202);
        expect(body).toBeNull();
    });

    it("lists its tools with a schema", async () => {
        const {body} = await rpc("tools/list", undefined, 2);
        const tools = (body?.["result"] as {tools: {name: string; inputSchema: unknown}[]}).tools;
        expect(tools.map((t) => t.name)).toEqual(["arp_tool_reputation"]);
        expect(tools[0].inputSchema).toMatchObject({required: ["tool_atom_id"]});
    });

    it("refuses an unknown method with -32601", async () => {
        const {body} = await rpc("tools/nope", undefined, 3);
        expect(body?.["error"]).toMatchObject({code: -32601});
    });
});

describe("arp_tool_reputation", () => {
    it("returns amounts as strings, with their position counts", async () => {
        // A TRUST figure does not survive JSON's number type, and a figure without its position
        // count reads as a market when it may be one account (ADR 0023).
        const {body} = await rpc(
            "tools/call",
            {name: "arp_tool_reputation", arguments: {tool_atom_id: `0x${"ab".repeat(32)}`}},
            4,
        );
        const text = (body?.["result"] as {content: {text: string}[]}).content[0].text;
        const data = JSON.parse(text) as Record<string, any>;
        expect(data.label).toBe("Stubbed Tool");
        expect(data.totals.support_assets_wei).toBe("5000");
        expect(typeof data.totals.support_assets_wei).toBe("string");
        expect(data.totals.support_positions).toBe(2);
        expect(data.edges[0].staked).toBe(true);
    });

    it("carries the caveat that stops a caller reading it as a score", async () => {
        const {body} = await rpc(
            "tools/call",
            {name: "arp_tool_reputation", arguments: {tool_atom_id: `0x${"ab".repeat(32)}`}},
            5,
        );
        const data = JSON.parse((body?.["result"] as {content: {text: string}[]}).content[0].text);
        expect(data.caveat).toContain("ARP composes no score");
        expect(data.provenance.kind).toBe("claim");
    });

    it("rejects a malformed atom id rather than querying with it", async () => {
        for (const bad of ["nope", "0x123", "", 42, null]) {
            const {body} = await rpc(
                "tools/call",
                {name: "arp_tool_reputation", arguments: {tool_atom_id: bad}},
                6,
            );
            expect(body?.["error"]).toMatchObject({code: -32602});
        }
    });

    it("rejects an unknown tool name", async () => {
        const {body} = await rpc("tools/call", {name: "arp_does_not_exist", arguments: {}}, 7);
        expect(body?.["error"]).toMatchObject({code: -32602});
    });
});

describe("the plain GET", () => {
    it("answers, so the verifier's non-protocol probe reports live rather than dead", async () => {
        const response = await fetch(`http://127.0.0.1:${PORT}/`);
        expect(response.ok).toBe(true);
        const body = (await response.json()) as Record<string, unknown>;
        expect(body["name"]).toBe("ARP");
        expect((body["mcp"] as {tools: string[]}).tools).toContain("arp_tool_reputation");
    });
});
