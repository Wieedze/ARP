import {spawn, type ChildProcess} from "node:child_process";
import {createServer, type Server} from "node:http";

import {encodeAbiParameters, parseEther, toFunctionSelector} from "viem";
import type {Hex} from "viem";
import {afterAll, beforeAll, describe, expect, it} from "vitest";

import {USES} from "../src/sources/intuition/terms.js";

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

/** The identity atom the stubbed graph resolves an ERC-8004 ref to, through `same as`. */
const STUB_SUBJECT = `0x${"5b".repeat(32)}` as Hex;

/**
 * The same-as resolution, answered only for the query that asks for it.
 *
 * The read tool and the planners run different queries against the same URL, and the planners need
 * a subject that is valid `bytes32` — `0xs1` above is fine for a read whose assertions never encode
 * it, and viem rejects it the moment a `createTriples` calldata is built. So the stub answers by
 * query shape rather than returning one payload for everything.
 */
const STUBBED_SUBJECT = {
    triples: [{subject: {term_id: STUB_SUBJECT, label: "A Mirrored Agent", type: "Thing"}}],
};

/** Stubbed `eth_call` returns, by selector. Keeps the suite hermetic and off every RPC. */
const ATOM_ID = `0x${"a7".repeat(32)}` as Hex;
const TRIPLE_ID = `0x${"73".repeat(32)}` as Hex;
const MULTI_VAULT = "0x2Ece8D4dEdcB9918A398528f3fa4688b1d2CAB91";

const selector = (signature: string) => toFunctionSelector(signature);
const ethCallReturns: Record<string, Hex> = {
    [selector("function calculateAtomId(bytes) view returns (bytes32)")]: encodeAbiParameters(
        [{type: "bytes32"}],
        [ATOM_ID],
    ),
    [selector("function calculateTripleId(bytes32,bytes32,bytes32) pure returns (bytes32)")]:
        encodeAbiParameters([{type: "bytes32"}], [TRIPLE_ID]),
    [selector("function isTermCreated(bytes32) view returns (bool)")]: encodeAbiParameters(
        [{type: "bool"}],
        [false],
    ),
    [selector("function getAtomCost() view returns (uint256)")]: encodeAbiParameters(
        [{type: "uint256"}],
        [parseEther("0.001")],
    ),
    [selector("function getTripleCost() view returns (uint256)")]: encodeAbiParameters(
        [{type: "uint256"}],
        [parseEther("0.002")],
    ),
    [selector("function getBondingCurveConfig() view returns ((address,uint256))")]:
        encodeAbiParameters(
            [{type: "tuple", components: [{type: "address"}, {type: "uint256"}]}],
            [["0x0000000000000000000000000000000000000001", 9n]],
        ),
    // `minDeposit` is 1000 wei here so the stake tests below sit exactly ON the floor — the
    // boundary case, which is the one an off-by-one breaks. Real values are 1e16 on mainnet 1155
    // and 1e15 on testnet 13579.
    [selector(
        "function getGeneralConfig() view returns ((address,address,uint256,address,uint256,uint256,uint256,uint256))",
    )]: encodeAbiParameters(
        [
            {
                type: "tuple",
                components: [
                    {type: "address"},
                    {type: "address"},
                    {type: "uint256"},
                    {type: "address"},
                    {type: "uint256"},
                    {type: "uint256"},
                    {type: "uint256"},
                    {type: "uint256"},
                ],
            },
        ],
        [
            [
                "0x0000000000000000000000000000000000000001",
                "0x0000000000000000000000000000000000000002",
                10000n,
                "0x0000000000000000000000000000000000000003",
                1000n,
                1000000n,
                1000n,
                10n ** 18n,
            ],
        ],
    ),
};

/**
 * The error of a call that must have failed, or a thrown test failure.
 *
 * `rpc` returns `body: null` for the 202 a notification gets, so every `body["error"]` read needs
 * narrowing. One accessor beats seven non-null assertions, which is how a null slips past as a
 * passing `undefined === undefined`.
 */
function errorOf(body: Record<string, unknown> | null): {code: number; message: string} {
    if (body === null) throw new Error("expected a JSON-RPC body, got a 202");
    const error = body["error"];
    if (error === undefined) throw new Error(`expected an error, got ${JSON.stringify(body)}`);
    return error as {code: number; message: string};
}

/** The text payload of a call that must have succeeded, parsed. */
function payloadOf(body: Record<string, unknown> | null): Record<string, unknown> {
    if (body === null) throw new Error("expected a JSON-RPC body, got a 202");
    const result = body["result"] as {content?: [{text: string}]} | undefined;
    if (result?.content === undefined) {
        throw new Error(`expected a result, got ${JSON.stringify(body["error"])}`);
    }
    return JSON.parse(result.content[0].text) as Record<string, unknown>;
}

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

const readBody = async (request: import("node:http").IncomingMessage): Promise<string> => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(chunk as Buffer);
    return Buffer.concat(chunks).toString("utf8");
};

beforeAll(async () => {
    stub = createServer((request, response) => {
        void (async () => {
            const body = await readBody(request);
            response.writeHead(200, {"content-type": "application/json"});
            if (body.includes("sameAsPredicateId")) {
                response.end(JSON.stringify({data: STUBBED_SUBJECT}));
                return;
            }
            if (body.includes("eth_call")) {
                const data = (JSON.parse(body) as {params?: [{data?: string}]}).params?.[0]?.data;
                const hit = ethCallReturns[(data ?? "").slice(0, 10)];
                response.end(
                    JSON.stringify(
                        hit === undefined
                            ? {jsonrpc: "2.0", id: 1, error: {code: -32000, message: "no stub"}}
                            : {jsonrpc: "2.0", id: 1, result: hit},
                    ),
                );
                return;
            }
            response.end(JSON.stringify({data: STUBBED}));
        })();
    });
    await new Promise<void>((resolve) => stub!.listen(PORT + 1, "127.0.0.1", resolve));

    server = spawn("bun", ["run", "scripts/arp-mcp-server.ts"], {
        cwd: new URL("../..", import.meta.url).pathname,
        env: {
            ...process.env,
            PORT: String(PORT),
            ARP_TARGET: "testnet",
            INTUITION_GRAPHQL_URL: `http://127.0.0.1:${PORT + 1}/v1/graphql`,
            INTUITION_RPC_URL: `http://127.0.0.1:${PORT + 1}/rpc`,
            ARP_MULTI_VAULT: MULTI_VAULT,
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
        // All three, in order. A tool added without landing here is a tool the rig's declared
        // capabilities test cannot see either (`rig-files.test.ts`).
        expect(tools.map((t) => t.name)).toEqual([
            "arp_tool_reputation",
            "arp_declare_used",
            "arp_stake_on_used",
        ]);
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

describe("arp_declare_used", () => {
    const call = (args: Record<string, unknown>) =>
        rpc("tools/call", {name: "arp_declare_used", arguments: args});

    const plan = async (args: Record<string, unknown>) => payloadOf((await call(args)).body);

    it("plans the atom before the triple, on the subject the graph resolved", async () => {
        const p = await plan({
            agent_chain_id: 8453,
            agent_token_id: "1380",
            tools: ["ipfs://bafkreistub"],
        });
        expect(p["subject_atom_id"]).toBe(STUB_SUBJECT);
        expect(p["predicate_term_id"]).toBe(USES);
        expect((p["calls"] as {kind: string}[]).map((c) => c.kind)).toEqual([
            "create-atom",
            "create-triple",
        ]);
    });

    it("totals the cost in wei as a string, from the costs the chain reported", async () => {
        const p = await plan({
            agent_chain_id: 8453,
            agent_token_id: "1380",
            tools: ["ipfs://bafkreistub"],
        });
        // The stub charges 0.001 per atom and 0.002 per triple. A number here would lose
        // precision for any realistic TRUST figure, so the wire carries strings.
        expect(p["total_value_wei"]).toBe(parseEther("0.003").toString());
        expect(typeof p["total_value_wei"]).toBe("string");
    });

    it("says the calls are unsigned, on every plan", async () => {
        const p = await plan({
            agent_chain_id: 8453,
            agent_token_id: "1380",
            tools: ["ipfs://bafkreistub"],
        });
        // A caller who assumes ARP executed the plan will not check that it did.
        expect(p["caveat"]).toContain("UNSIGNED");
        expect(p["caveat"]).toContain("nothing has been sent");
    });

    it("rejects a malformed identity rather than planning against a guess", async () => {
        for (const args of [
            {agent_chain_id: 0, agent_token_id: "1", tools: ["x"]},
            {agent_chain_id: 8453, agent_token_id: "not-a-number", tools: ["x"]},
            {agent_chain_id: 8453, agent_token_id: "1", tools: "x"},
            {agent_chain_id: 8453, agent_token_id: "1", tools: [1]},
        ]) {
            expect(errorOf((await call(args)).body).code).toBe(-32602);
        }
    });
});

describe("arp_stake_on_used", () => {
    const call = (args: Record<string, unknown>) =>
        rpc("tools/call", {name: "arp_stake_on_used", arguments: args});

    /**
     * The stub answers `isTermCreated` false for everything, so this exercises the
     * not-on-chain-yet branch. The `exists: true` branch is covered by `declare-plan.test.ts`,
     * which can state chain state per term — and was verified against a real mainnet `uses` edge
     * on 2026-10-19.
     */
    it("plans no deposit on a triple the chain does not have, and reports why", async () => {
        const p = payloadOf(
            (
                await call({
                    receiver: "0xE596096F4176b682E300d73963e7B04B383C1AA1",
                    targets: [{triple_id: TRIPLE_ID, amount_wei: "1000"}],
                })
            ).body,
        ) as {targets: {exists: boolean}[]; calls: unknown[]};
        expect(p.targets[0]?.exists).toBe(false);
        expect(p.calls).toEqual([]);
    });

    it("prices on the curve the chain reports", async () => {
        const p = payloadOf(
            (
                await call({
                    receiver: "0xE596096F4176b682E300d73963e7B04B383C1AA1",
                    targets: [{triple_id: TRIPLE_ID, amount_wei: "1000"}],
                })
            ).body,
        );
        // The stub's getBondingCurveConfig returns 9, so a hardcoded 1 would fail here.
        expect(p["curve_id"]).toBe("9");
    });

    it("rejects a bad receiver, a bad id and a non-numeric amount", async () => {
        for (const args of [
            {receiver: "0xnope", targets: [{triple_id: TRIPLE_ID, amount_wei: "1"}]},
            {
                receiver: "0xE596096F4176b682E300d73963e7B04B383C1AA1",
                targets: [{triple_id: "0x1234", amount_wei: "1"}],
            },
            {
                receiver: "0xE596096F4176b682E300d73963e7B04B383C1AA1",
                targets: [{triple_id: TRIPLE_ID, amount_wei: "0.5"}],
            },
            {receiver: "0xE596096F4176b682E300d73963e7B04B383C1AA1", targets: []},
        ]) {
            expect(errorOf((await call(args)).body).code).toBe(-32602);
        }
    });

    it("refuses a zero stake, because an edge with no stake carries no weight", async () => {
        const {body} = await call({
            receiver: "0xE596096F4176b682E300d73963e7B04B383C1AA1",
            targets: [{triple_id: TRIPLE_ID, amount_wei: "0"}],
        });
        expect(errorOf(body).message).toContain("NonPositiveAmountError");
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
