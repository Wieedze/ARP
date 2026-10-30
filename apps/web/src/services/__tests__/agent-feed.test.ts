import {describe, expect, it} from "vitest";
import type {ActivityEvent as AgentEvent} from "@arp-protocol/core";
import type {Hex} from "viem";

import {ActivityLog} from "../activity-log";
import {
    AgentFeed,
    agentsByWallet,
    entryFor,
    namesOf,
    timelineRows,
    traceInvocations,
    type EventSourceLike,
    type ReadReceipt,
} from "../agent-feed";

const AGENT: Hex = `0x${"a".repeat(64)}`;
const USES: Hex = `0x${"b".repeat(64)}`;
const SKILL: Hex = `0x${"c".repeat(64)}`;
const OTHER: Hex = `0x${"9".repeat(64)}`;
const TRIPLE: Hex = `0x${"d".repeat(64)}`;
const HASH1: Hex = `0x${"1".repeat(64)}`;
const HASH2: Hex = `0x${"2".repeat(64)}`;
const WALLET: Hex = "0xB86F5f4E338eCEEC5DD095f48acF764465587FCF";

const invoked = (at: string, outcome: "ok" | "timeout" = "ok"): AgentEvent => ({
    source: "session",
    at,
    session: "s",
    call: `c-${at}`,
    kind: "skill",
    name: "brainstorming",
    ref: SKILL,
    outcome,
    ms: 5,
});
const declared = (status: "dry" | "success" | "reverted", hash: Hex | null): AgentEvent => ({
    source: "sent",
    at: "2026-10-30T13:11:00Z",
    chainId: 13579,
    status,
    hash,
    signer: WALLET,
    to: null,
    value: "2000000002000000",
    gasUsed: null,
    kind: "create-triple",
    why: "declare",
    decoded: {fn: "createTriples", subjects: [AGENT], predicates: [USES], objects: [SKILL]},
});
const staked = (termId: Hex, hash: Hex): AgentEvent => ({
    source: "sent",
    at: "2026-10-30T13:12:00Z",
    chainId: 13579,
    status: "success",
    hash,
    signer: WALLET,
    to: null,
    value: "1000000000000000",
    gasUsed: "184425",
    kind: "deposit",
    why: "stake",
    decoded: {fn: "deposit", receiver: WALLET, termId, curveId: "1"},
});

describe("entryFor", () => {
    it("names a declaration's object by the name the agent invoked it with", () => {
        const names = namesOf([invoked("2026-10-30T13:10:00Z")]);
        expect(entryFor(declared("success", HASH1), names)).toMatchObject({
            stream: "agent",
            step: "declaration",
            label: "uses",
            detail: "→ brainstorming",
            tx: HASH1,
            costWei: "2000000002000000",
        });
    });

    it("a dry run is a simulation and carries no hash; a failed call is refused", () => {
        expect(entryFor(declared("dry", null), new Map())).toMatchObject({step: "simulated"});
        expect(entryFor(declared("dry", null), new Map())).not.toHaveProperty("tx");
        expect(entryFor(invoked("t", "timeout"), new Map())).toMatchObject({
            step: "refused",
            detail: expect.stringContaining("timeout"),
        });
    });

    it("a deposit is a stake", () => {
        expect(entryFor(staked(TRIPLE, HASH2), new Map())).toMatchObject({
            step: "stake",
            label: "position",
        });
    });
});

describe("traceInvocations", () => {
    const tripleIdOf = (s: Hex, p: Hex, o: Hex) =>
        s === AGENT && p === USES && o === SKILL ? TRIPLE : undefined;

    it("joins an invocation to its declaration and its stake, on ids", () => {
        const [row] = traceInvocations(
            [
                invoked("2026-10-30T13:10:00Z"),
                invoked("2026-10-30T13:10:05Z"),
                declared("success", HASH1),
                staked(TRIPLE, HASH2),
                staked(OTHER, HASH1),
            ],
            tripleIdOf,
        );
        expect(row).toMatchObject({
            name: "brainstorming",
            calls: 2,
            failed: 0,
            declaration: {hash: HASH1, status: "success"},
        });
        expect(row?.stakes).toEqual([
            {chainId: 13579, hash: HASH2, status: "success", value: "1000000000000000"},
        ]);
    });

    it("a real send outranks the dry run that came before it, whichever order they arrive in", () => {
        const [row] = traceInvocations(
            [invoked("t"), declared("success", HASH1), declared("dry", null)],
            tripleIdOf,
        );
        expect(row?.declaration).toMatchObject({status: "success", hash: HASH1});
    });

    it("an invocation nothing declared has no declaration, and no stake is guessed for it", () => {
        const [row] = traceInvocations([invoked("t"), staked(TRIPLE, HASH2)], tripleIdOf);
        expect(row).toMatchObject({declaration: null, stakes: []});
    });
});

describe("AgentFeed", () => {
    function setup(readReceipt: ReadReceipt = async () => null) {
        const log = new ActivityLog();
        const source: EventSourceLike = {
            onopen: null,
            onmessage: null,
            onerror: null,
            close: () => undefined,
        };
        const feed = new AgentFeed(log, {url: "http://feed", open: () => source, readReceipt});
        return {log, source, feed};
    }
    const frame = (event: AgentEvent) => new MessageEvent("message", {data: JSON.stringify(event)});

    it("opens with its first reader, closes with its last, and reports its state", () => {
        const {feed, source} = setup();
        let closed = 0;
        source.close = () => {
            closed += 1;
        };
        const stopA = feed.start();
        const stopB = feed.start();
        expect(feed.status()).toBe("connecting");
        source.onopen?.(new Event("open"));
        expect(feed.status()).toBe("live");
        stopA();
        expect(closed).toBe(0);
        stopB();
        expect(closed).toBe(1);
        expect(feed.status()).toBe("off");
    });

    it("a redelivered event is one entry, and a frame that is not an event is ignored", () => {
        const {feed, source, log} = setup();
        feed.start();
        source.onmessage?.(frame(invoked("t")));
        source.onmessage?.(frame(invoked("t")));
        source.onmessage?.(new MessageEvent("message", {data: "{not json"}));
        source.onmessage?.(new MessageEvent("message", {data: JSON.stringify({source: "chat"})}));
        expect(feed.all()).toHaveLength(1);
        expect(log.all()).toHaveLength(1);
    });

    it("confirms a sent hash by reading the chain itself, once", async () => {
        const reads: Hex[] = [];
        const {feed, source, log} = setup(async (_chainId, hash) => {
            reads.push(hash);
            return {status: "success", block: 42n, costWei: 7n};
        });
        feed.start();
        source.onmessage?.(frame(declared("success", HASH1)));
        source.onmessage?.(frame(declared("success", HASH1)));
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(reads).toEqual([HASH1]);
        expect(log.all().find((entry) => entry.step === "confirmed")).toMatchObject({
            label: "block 42",
            tx: HASH1,
            costWei: "7",
        });
    });

    it("an RPC that fails confirms nothing, and a feed with no EventSource is offline", async () => {
        const {feed, source, log} = setup(async () => {
            throw new Error("down");
        });
        feed.start();
        source.onmessage?.(frame(declared("success", HASH1)));
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(log.all().some((entry) => entry.step === "confirmed")).toBe(false);

        const broken = new AgentFeed(new ActivityLog(), {
            url: "http://feed",
            open: () => {
                throw new ReferenceError("EventSource is not defined");
            },
            readReceipt: async () => null,
        });
        broken.start();
        expect(broken.status()).toBe("offline");
    });
});

describe("timelineRows", () => {
    const tripleIdOf = (s: Hex, p: Hex, o: Hex) =>
        s === AGENT && p === USES && o === SKILL ? TRIPLE : undefined;
    const names = new Map([[AGENT.toLowerCase(), {kind: "atom" as const, label: "Agent 13579:8"}]]);
    const receipt: AgentEvent = {
        source: "receipt",
        at: "2026-10-30T11:04:52Z",
        name: "brainstorming",
        url: null,
        atom: SKILL,
        signer: "0x76dc846361405D145cf899dAE3512225EC8A5111",
        to: WALLET,
    };
    const events = [
        receipt,
        invoked("2026-10-30T13:10:36Z"),
        declared("success", HASH1),
        staked(TRIPLE, HASH2),
    ];

    it("names who acted: the agent by its identity atom, the receipt by the server that signed it", () => {
        const rows = timelineRows(events, {chainId: 13579, names, tripleIdOf});
        expect(rows.map((row) => row.who)).toEqual([
            "Agent 13579:8",
            "Agent 13579:8",
            "Agent 13579:8",
            "content server 0x76dc8463…",
        ]);
        expect(rows[3]?.off).toBe(
            "served brainstorming to Agent 13579:8 · signed receipt, not a transaction",
        );
    });

    it("links both ways: the invocation lists what it led to, each transaction names its cause", () => {
        const rows = timelineRows(events, {chainId: 13579, names, tripleIdOf});
        const [stake, declaration, invocation] = rows;
        expect(stake).toMatchObject({
            on: "stakes on uses → brainstorming",
            off: "← invoked brainstorming 13:10:36",
            tx: {hash: HASH2},
        });
        expect(declaration).toMatchObject({
            on: "declares uses → brainstorming",
            off: "← invoked brainstorming 13:10:36",
        });
        expect(invocation?.consequences).toEqual([
            {label: "declared", chainId: 13579, hash: HASH1},
            {label: "staked", chainId: 13579, hash: HASH2},
        ]);
    });

    it("on the other chain, the transactions are gone and the off-chain events stay", () => {
        const rows = timelineRows(events, {chainId: 1155, names, tripleIdOf});
        expect(rows.map((row) => row.lane)).toEqual(["off", "off"]);
        expect(rows[0]?.consequences).toEqual([]);
    });

    it("a transaction is listed under the invocation it answers, not under every call of the skill", () => {
        const twice = [
            invoked("2026-10-30T13:10:36Z"),
            declared("success", HASH1),
            staked(TRIPLE, HASH2),
            invoked("2026-10-30T13:20:00Z"),
        ];
        const rows = timelineRows(twice, {chainId: 13579, names, tripleIdOf});
        const invocations = rows.filter((row) => row.lane === "off");
        expect(invocations.map((row) => row.at)).toEqual([
            "2026-10-30T13:20:00Z",
            "2026-10-30T13:10:36Z",
        ]);
        expect(invocations[0]?.consequences).toEqual([]);
        expect(invocations[1]?.consequences.map((c) => c.hash)).toEqual([HASH1, HASH2]);
    });

    it("a reverted call names its cause but is not listed as something the invocation led to", () => {
        const reverted = declared("reverted", HASH1);
        const rows = timelineRows([invoked("2026-10-30T13:10:36Z"), reverted], {
            chainId: 13579,
            names,
            tripleIdOf,
        });
        expect(rows[0]).toMatchObject({off: "← invoked brainstorming 13:10:36"});
        expect(rows[1]?.consequences).toEqual([]);
    });

    it("a dry run names its cause, and only the real send that follows it is a consequence", () => {
        const rows = timelineRows(
            [invoked("2026-10-30T13:10:36Z"), declared("dry", null), declared("success", HASH1)],
            {chainId: 13579, names, tripleIdOf},
        );
        const invocation = rows.find((row) => row.lane === "off");
        const dryRun = rows.find((row) => row.lane !== "off" && row.tx === null);
        expect(invocation?.consequences).toEqual([
            {label: "declared", chainId: 13579, hash: HASH1},
        ]);
        expect(dryRun).toMatchObject({off: "← invoked brainstorming 13:10:36"});
    });
});

describe("agentsByWallet", () => {
    it("names a wallet by the identity atom it declared from, and nothing else", () => {
        const names = new Map([
            [AGENT.toLowerCase(), {kind: "atom" as const, label: "Agent 13579:8"}],
        ]);
        expect(agentsByWallet([declared("success", HASH1)], names)).toEqual(
            new Map([[WALLET.toLowerCase(), "Agent 13579:8"]]),
        );
        // A deposit says nothing about whose identity the wallet holds, and an unnamed atom is no name.
        expect(agentsByWallet([staked(TRIPLE, HASH2)], names).size).toBe(0);
        expect(agentsByWallet([declared("success", HASH1)], new Map()).size).toBe(0);
    });
});
