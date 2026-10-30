import {spawn, type ChildProcess} from "node:child_process";
import {createServer, type Server} from "node:http";
import {rmSync, writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";

import {encodeAbiParameters, keccak256, parseEther, stringToBytes, toFunctionSelector} from "viem";
import type {Hex} from "viem";
import {privateKeyToAccount} from "viem/accounts";

import {signContentReceipt} from "../../../packages/protocol/src/receipt.js";
import {afterAll, beforeAll, describe, expect, it} from "vitest";

import {USES} from "../../../packages/protocol/src/sources/intuition/terms.js";

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
/** A receipt record the spawned node reads, so the corroboration verdict is exercised for real. */
const RECEIPTS_PATH = join(tmpdir(), `arp-receipts-${process.pid}.jsonl`);
const RECEIPT_NODE = privateKeyToAccount(`0x${"77".repeat(32)}`);
const DECLARER = privateKeyToAccount(`0x${"88".repeat(32)}`);
/** `obra/superpowers ?skill=brainstorming` — one carrier, so the name alone resolves. */
const BRAINSTORMING_ATOM =
    "0xf205a19595893612b5b716e6e5742d036c70a2cc82cf6581c394cbe3b9310885" as const;
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
    // The previews. `shares` is non-zero so the plans do not refuse: a zero would be the real
    // chain's answer to a fee-only deposit, and `ZeroPositionError` is covered in `declare-plan`
    // against a reader whose arithmetic a test can state. Here the point is only that the plan
    // asks.
    [selector(
        "function previewAtomCreate(bytes32,uint256) view returns (uint256,uint256,uint256)",
    )]: encodeAbiParameters(
        [{type: "uint256"}, {type: "uint256"}, {type: "uint256"}],
        [980n, 1000n, 980n],
    ),
    [selector(
        "function previewTripleCreate(bytes32,uint256) view returns (uint256,uint256,uint256)",
    )]: encodeAbiParameters(
        [{type: "uint256"}, {type: "uint256"}, {type: "uint256"}],
        [990n, 1000n, 990n],
    ),
    [selector("function previewDeposit(bytes32,uint256,uint256) view returns (uint256,uint256)")]:
        encodeAbiParameters([{type: "uint256"}, {type: "uint256"}], [980n, 980n]),
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

    // One receipt, signed by a key this node's reader accepts, served to the address that will
    // declare. Written before the server starts, because the node reads the file per request.
    const signed = await signContentReceipt(
        {
            atom: BRAINSTORMING_ATOM,
            url: "https://github.com/obra/superpowers?skill=brainstorming",
            path: "skills/brainstorming/SKILL.md",
            digest: keccak256(stringToBytes("whatever")),
            to: DECLARER.address,
            servedAt: 1_793_462_400,
            nonce: keccak256(stringToBytes("n")),
        },
        13579,
        {
            address: RECEIPT_NODE.address,
            signTypedData: (data) => RECEIPT_NODE.signTypedData(data),
        },
    );
    writeFileSync(
        RECEIPTS_PATH,
        `${JSON.stringify({skill: "brainstorming", atom: BRAINSTORMING_ATOM, receipt: signed})}\n`,
    );

    server = spawn("bun", ["run", "apps/mcp/src/server.ts"], {
        cwd: new URL("../../..", import.meta.url).pathname,
        env: {
            ...process.env,
            PORT: String(PORT),
            ARP_TARGET: "testnet",
            INTUITION_GRAPHQL_URL: `http://127.0.0.1:${PORT + 1}/v1/graphql`,
            INTUITION_RPC_URL: `http://127.0.0.1:${PORT + 1}/rpc`,
            ARP_MULTI_VAULT: MULTI_VAULT,
            // A receipt the node will read, and the signer this node's reader accepts. Both are
            // what `corroborationOf`'s wiring needs to be visible at all: without them the
            // verdict is a constant and the bug that made it one is invisible.
            ARP_RECEIPTS: RECEIPTS_PATH,
            ARP_ACCEPTED_SIGNERS: RECEIPT_NODE.address,
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
    rmSync(RECEIPTS_PATH, {force: true});
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
        /**
         * The instructions are the **only** context an agent gets if it never reads the skill file,
         * so they have to carry the frame and not just the precautions.
         *
         * They were four sentences of warnings — unsigned calls, position counts, no score — all
         * true and useless as context: a caller learned what to be careful about and nothing about
         * what the work is or why any of it would be worth doing.
         */
        const instructions = String(result["instructions"]);
        // What the expense buys, which is the question a rational agent asks first.
        expect(instructions).toContain("does not come back");
        // It said `contestable`. ADR `0056` took that word out: measured on mainnet 1155, 1 of 185
        // `uses` edges has ever been contradicted, so leading on contestability told a caller to
        // expect a mechanism nothing reaches. What the fee buys is attribution and permanence.
        expect(instructions).toContain("attributed to you");
        // And the exit, because a figure read without it is mistaken for a cumulative.
        expect(instructions).toContain("redeem it");
        // That reading is free, which is the job most agents want and the cheapest one.
        expect(instructions).toMatch(/needs NOTHING/);
        // And the precautions, still there, at the end where a precaution belongs.
        expect(instructions).toContain("UNSIGNED");
        expect(instructions).toContain("composes no score");
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
        // All twelve, in order. A tool added without landing here is a tool the rig's declared
        // capabilities test cannot see either (`rig-files.test.ts`).
        //
        // `arp_identity` is first because a caller should ask it first: the identity atom is
        // written by Intuition's mirror and most agents do not have one, so every other tool here
        // fails for them until that is fixed (ADR `0047`).
        expect(tools.map((t) => t.name)).toEqual([
            "arp_identity",
            "arp_find_agents",
            "arp_find_tools",
            "arp_tool_reputation",
            "arp_declare_used",
            // Beside `arp_declare_used` rather than replacing it, because the two take their list
            // from different places: that one from what the agent believes it used, this one from
            // the runtime hook's own log (`tasks/31`).
            "arp_declare_session",
            "arp_stake_on_used",
            // The market on an atom, both directions. ADR `0056`: the edge is a receipt and the
            // atom is the market, so they are separate tools — and the exit ships with the way in,
            // because a deposit nobody can withdraw is a donation.
            "arp_take_position",
            "arp_exit_position",
            // Where another agent said it can be reached, and whether that answers. Three tools,
            // because what was published, what responds, and what you are willing to assert about
            // it are three different things.
            //
            // `arp_record_reachable` is the only write path on this node whose subject is a FACT
            // rather than a declaration: a probe is reproducible, so a second observer can
            // contradict the first for the price of one HTTP request. Before it, the node produced
            // that fact and discarded it.
            "arp_agent_endpoints",
            "arp_record_reachable",
            "arp_probe_endpoint",
        ]);
        // By name, not by index: the order above is an assertion about the list, and a schema
        // assertion keyed on position silently moves to a different tool when it changes.
        const byName = new Map(tools.map((tool) => [tool.name, tool.inputSchema]));
        expect(byName.get("arp_tool_reputation")).toMatchObject({required: ["tool_atom_id"]});
        expect(byName.get("arp_identity")).toMatchObject({
            required: ["agent_chain_id", "agent_token_id"],
        });
        // `receiver` is required and is the caller's own address: this node plans, the caller
        // signs, and what lands is the caller's verdict rather than ARP's (ADR `0038`).
        expect(byName.get("arp_record_reachable")).toMatchObject({
            required: ["url", "tool_atom_id", "receiver"],
        });
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
        // 0.001 + 0.002 in fees, plus two birth deposits at the stub's 1000-wei floor — one atom
        // and one triple, each born with a position (ADR `0053`).
        expect(p["total_value_wei"]).toBe((parseEther("0.003") + 2_000n).toString());
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

describe("arp_declare_session", () => {
    const call = (args: Record<string, unknown>) =>
        rpc("tools/call", {name: "arp_declare_session", arguments: args});
    const plan = async (args: Record<string, unknown>) => payloadOf((await call(args)).body);

    /** A log the hook could have written. `log` is passed, so no file is involved. */
    const line = (over: Record<string, unknown>) =>
        JSON.stringify({
            at: "2026-10-29T18:00:00.000Z",
            session: "s1",
            kind: "skill",
            source: null,
            ref: null,
            ...over,
        });

    it("plans only for what it can name exactly, and reports the rest", async () => {
        // The whole point of taking the list from the runtime instead of from the agent. A name
        // several repositories carry gets NO call: picking one would write an edge about a
        // repository the agent may never have touched, with a position behind it.
        const p = await plan({
            agent_chain_id: 8453,
            agent_token_id: "1380",
            log: [
                line({name: "brainstorming"}),
                line({name: "product-photography"}),
                line({name: "nothing-the-catalogue-has"}),
                line({kind: "mcp", name: "stripe"}),
            ].join("\n"),
        });

        const rows = p["invocations"] as {status: string; name: string}[];
        const statusOf = (name: string) => rows.find((row) => row.name === name)?.status;
        expect(statusOf("brainstorming")).toBe("resolved");
        expect(statusOf("product-photography")).toBe("ambiguous");
        expect(statusOf("nothing-the-catalogue-has")).toBe("unknown");
        expect(statusOf("stripe")).toBe("unknown");

        expect(p["planned_for"]).toBe(1);
        expect(p["not_planned_for"]).toBe(3);
    });

    it("names every candidate on an ambiguous one rather than one of them", async () => {
        const p = await plan({
            agent_chain_id: 8453,
            agent_token_id: "1380",
            log: line({name: "product-photography"}),
        });
        const row = (p["invocations"] as {status: string; candidates?: unknown[]}[])[0];
        expect(row?.status).toBe("ambiguous");
        // Six, measured 2026-10-29. The figure is not asserted — the catalogue is real data and a
        // number here would break on the next seed. What must hold is that it names more than one.
        expect((row?.candidates ?? []).length).toBeGreaterThan(1);
    });

    it("reads a held receipt against the DECLARER, not against the receipt's own claim", async () => {
        // The bug this exists to catch: `against` fell back to `receipt.to` when `declarer` was
        // omitted, which made `served === declarer` true by construction and the verdict a
        // constant. Nothing tested the path with a real receipt, so it was invisible.
        //
        // The signer here is in `ARP_ACCEPTED_SIGNERS`, which is the only thing that can make a
        // receipt read as a second party: an operator-run node's key is unlinkable to that
        // operator's agent key, so addresses cannot tell the two apart (ADR `0080`).
        const p = await plan({
            agent_chain_id: 8453,
            agent_token_id: "1380",
            declarer: DECLARER.address,
            log: line({name: "brainstorming"}),
        });
        const row = (p["invocations"] as {status: string; access?: string}[])[0];
        expect(row?.access).toContain("second-party");
        expect(row?.access).toContain(RECEIPT_NODE.address);
    });

    it("reads the same receipt as other-caller for a different declarer", async () => {
        // A genuine receipt, correctly signed and accepted, about somebody else's fetch. Letting
        // it corroborate this declaration is the easiest forgery in the system.
        const p = await plan({
            agent_chain_id: 8453,
            agent_token_id: "1380",
            declarer: `0x${"99".repeat(20)}`,
            log: line({name: "brainstorming"}),
        });
        const row = (p["invocations"] as {status: string; access?: string}[])[0];
        expect(row?.access).toContain("other-caller");
    });

    it("refuses to assess a held receipt when no declarer was given", async () => {
        // It used to answer anyway, against the receipt's own `to`. Saying what is missing is the
        // only honest answer when the comparison has no second address.
        const p = await plan({
            agent_chain_id: 8453,
            agent_token_id: "1380",
            log: line({name: "brainstorming"}),
        });
        const row = (p["invocations"] as {status: string; access?: string}[])[0];
        expect(row?.access).toContain("pass `declarer`");
    });

    it("says a resolved claim is the agent's own word when no receipt backs it", async () => {
        // ADR `0080`. A declaration with no receipt is exactly the declaration this project has
        // always had, and the response says which it is rather than leaving a reader to assume.
        // A name the fixture holds no receipt for — `brainstorming` has one, by design above.
        const p = await plan({
            agent_chain_id: 8453,
            agent_token_id: "1380",
            declarer: DECLARER.address,
            log: line({name: "using-git-worktrees"}),
        });
        const rows = p["invocations"] as {status: string; access?: string}[];
        const resolved = rows.find((row) => row.status === "resolved");
        expect(resolved?.access ?? "").toContain("your own word");
    });

    it("plans on the subject the graph resolved, and signs nothing", async () => {
        const p = await plan({
            agent_chain_id: 8453,
            agent_token_id: "1380",
            log: line({name: "brainstorming"}),
        });
        const planned = p["plan"] as Record<string, unknown>;
        expect(planned["subject_atom_id"]).toBe(STUB_SUBJECT);
        expect(planned["predicate_term_id"]).toBe(USES);
        expect(String(planned["caveat"])).toContain("UNSIGNED");
    });

    it("plans nothing at all for a log it could name nothing in", async () => {
        const p = await plan({
            agent_chain_id: 8453,
            agent_token_id: "1380",
            log: line({name: "nothing-the-catalogue-has"}),
        });
        expect(p["planned_for"]).toBe(0);
        expect(p["plan"]).toBeNull();
    });

    it("refuses a log that is not a string rather than reading the machine's own", async () => {
        // Falling back to `.arp/session.jsonl` on a malformed argument would declare whatever
        // happened to be on the host, for a caller who asked about something else.
        const {body} = await call({agent_chain_id: 8453, agent_token_id: "1380", log: 42});
        expect((body?.["error"] as {message: string}).message).toContain("JSONL");
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
