import {PULSE_ATOMS_QUERY, PULSE_QUALIFIERS_QUERY, PULSE_USES_QUERY, type GraphqlTransport} from "@arp-protocol/graphql";
import {describe, expect, it} from "vitest";

import {findToolAtoms, getPulseUsage, readEdgeWriters, workedInDomain} from "../src/pulse-usage.js";

const TOOL = "0xaaa";
const CONTEXT = "0xc0";
const OUTCOME = "0xd0";
const BECAUSE = "0xe0";
const writer = "0xWriter";

const use = (id: string, subject: string, by = writer) => ({
    term_id: id,
    object_id: TOOL,
    creator_id: by,
    created_at: "2026-11-05T10:00:00Z",
    subject: {term_id: subject, label: `agent ${subject}`},
});
const qualifier = (edge: string, predicate: string, value: string, by = writer) => ({
    term_id: `${edge}-${value}`,
    subject_id: edge,
    predicate_id: predicate,
    creator_id: by,
    object: {label: value},
});

function transport(uses: unknown[], qualifiers: unknown[]): GraphqlTransport {
    return {
        request: async (query: string, variables?: unknown) => {
            if (query === PULSE_USES_QUERY) return {triples: uses};
            if (query === PULSE_QUALIFIERS_QUERY) {
                const {edges} = variables as {edges: string[]}; // this query's own variables
                return {triples: qualifiers.filter((row) => edges.includes((row as {subject_id: string}).subject_id))};
            }
            throw new Error("unexpected query");
        },
    };
}

const read = (uses: unknown[], qualifiers: unknown[], limit?: number) =>
    getPulseUsage([TOOL], {
        graphqlUrl: "unused",
        inContextOf: CONTEXT,
        hasOutcome: OUTCOME,
        because: BECAUSE,
        payers: [],
        transport: transport(uses, qualifiers),
        ...(limit === undefined ? {} : {limit}),
    });

describe("getPulseUsage", () => {
    it("returns an empty line for a tool nobody declared, and does not ask for qualifiers", async () => {
        const usage = (await read([], [])).get(TOOL);
        expect(usage).toMatchObject({declarations: [], agents: 0, byDomain: {}, byOutcome: {}});
    });

    it("counts domains and outcomes the declarer wrote", async () => {
        const usage = (
            await read(
                [use("0x1", "a"), use("0x2", "b")],
                [qualifier("0x1", CONTEXT, "video"), qualifier("0x1", OUTCOME, "failed"), qualifier("0x2", CONTEXT, "video")],
            )
        ).get(TOOL);
        expect(usage?.agents).toBe(2);
        expect(usage?.byDomain).toEqual({video: 2});
        expect(usage?.byOutcome).toEqual({failed: 1});
    });

    it("keeps somebody else's outcome on an edge apart, so a competitor cannot write my failure", async () => {
        const usage = (await read([use("0x1", "a")], [qualifier("0x1", OUTCOME, "failed", "0xCompetitor")])).get(TOOL);
        expect(usage?.byOutcome).toEqual({});
        expect(usage?.declarations[0]?.outcomes).toEqual([]);
        expect(usage?.byOthers).toMatchObject([{writer: "0xCompetitor", predicate: "outcome", value: "failed"}]);
    });

    it("compares writers across case, because the index checksums an address", async () => {
        const usage = (await read([use("0x1", "a", "0xABC")], [qualifier("0x1", OUTCOME, "worked", "0xabc")])).get(TOOL);
        expect(usage?.byOutcome).toEqual({worked: 1});
    });

    it("says when the read stopped at its limit", async () => {
        const usage = (await read([use("0x1", "a")], [], 1)).get(TOOL);
        expect(usage?.truncated).toBe(true);
    });
});

describe("who stands behind a qualifier", () => {
    it("counts the declarer's position on a line somebody else wrote first", async () => {
        const row = {...qualifier("0x1", OUTCOME, "failed", "0xGriefer"), positions: [{account_id: writer.toLowerCase()}]};
        const usage = (await read([use("0x1", "a")], [row])).get(TOOL);
        expect(usage?.byOutcome).toEqual({failed: 1});
        expect(usage?.byOthers).toEqual([]);
    });

    it("asks only for positions that still hold shares, so a wallet that exited does not count", () => {
        expect(PULSE_QUALIFIERS_QUERY).toContain('positions(where: {shares: {_gt: "0"}, account_id: {_in: $writers}})');
    });

    it("ignores an outcome outside the two words", async () => {
        const usage = (await read([use("0x1", "a")], [qualifier("0x1", OUTCOME, "best skill ever")])).get(TOOL);
        expect(usage?.byOutcome).toEqual({});
    });

    it("counts wallets, so one wallet writing about several agents counts once", async () => {
        const usage = (
            await read(
                [use("0x1", "a"), use("0x2", "b")],
                [
                    qualifier("0x1", CONTEXT, "video"),
                    qualifier("0x1", OUTCOME, "worked"),
                    qualifier("0x2", CONTEXT, "video"),
                    qualifier("0x2", OUTCOME, "worked"),
                ],
            )
        ).get(TOOL);
        expect([usage?.agents, usage?.wallets]).toEqual([2, 1]);
        expect(workedInDomain(usage, "video")).toBe(1);
    });
});

describe("readEdgeWriters", () => {
    it("says who wrote each edge, so a planner can warn a different wallet", async () => {
        const fake: GraphqlTransport = {request: async () => ({triples: [{term_id: "0xAB", creator_id: "0xWriter"}]})};
        const writers = await readEdgeWriters(["0xab"], {graphqlUrl: "unused", transport: fake});
        expect(writers.get("0xab")).toBe("0xWriter");
    });

    it("asks nothing for no edges", async () => {
        const fake: GraphqlTransport = {
            request: async () => {
                throw new Error("unexpected query");
            },
        };
        expect((await readEdgeWriters([], {graphqlUrl: "unused", transport: fake})).size).toBe(0);
    });
});

describe("the limit", () => {
    it("stays at the index's cap, so a larger one can still say the read was cut", async () => {
        const uses = Array.from({length: 250}, (_v, at) => use(`0x${at}`, "a"));
        expect((await read(uses, [], 500)).get(TOOL)?.truncated).toBe(true);
    });
});

describe("a position on the edge lets a wallet's details count", () => {
    const held = (wallet: string) => ({...use("0x1", "a"), positions: [{account_id: wallet}]});
    const behind = (row: ReturnType<typeof qualifier>, wallet: string) => ({...row, positions: [{account_id: wallet}]});

    it("counts a wallet that deposited on the edge as a declarer, with its own lines", async () => {
        const usage = (
            await read(
                [held("0xDepositor")],
                [qualifier("0x1", CONTEXT, "video", "0xDepositor"), qualifier("0x1-video", OUTCOME, "failed", "0xDepositor")],
            )
        ).get(TOOL);
        expect(usage?.wallets).toBe(2);
        expect(usage?.byOthers).toEqual([]);
        const depositor = usage?.declarations.find((row) => row.writer === "0xDepositor");
        expect(depositor?.lines).toEqual([{domain: "video", outcome: "failed", reasons: [], form: "nested"}]);
        expect(usage?.declarations.find((row) => row.writer === writer)?.lines).toEqual([]);
    });

    it("keeps plain support as support: a position with no domain and no result declares nothing", async () => {
        const usage = (await read([held("0xSupporter")], [])).get(TOOL);
        expect(usage?.wallets).toBe(1);
        expect(usage?.declarations.map((row) => row.writer)).toEqual([writer]);
    });

    it("counts a holder who stands behind a domain alone", async () => {
        const usage = (await read([held("0xDepositor")], [behind(qualifier("0x1", CONTEXT, "video"), "0xDepositor")])).get(TOOL);
        expect(usage?.wallets).toBe(2);
    });

    it("keeps the wallet that wrote the edge, with or without a detail", async () => {
        const usage = (await read([{...use("0x1", "a"), positions: []}], [])).get(TOOL);
        expect(usage?.declarations.map((row) => row.writer)).toEqual([writer]);
    });

    it("gives two declarers on one edge their own results", async () => {
        const context = behind(qualifier("0x1", CONTEXT, "video"), "0xDepositor");
        const usage = (
            await read([held("0xDepositor")], [context, qualifier("0x1-video", OUTCOME, "worked"), qualifier("0x1-video", OUTCOME, "failed", "0xDepositor")])
        ).get(TOOL);
        const outcome = (wallet: string) => usage?.declarations.find((row) => row.writer === wallet)?.lines.map((line) => line.outcome);
        expect(outcome(writer)).toEqual(["worked"]);
        expect(outcome("0xDepositor")).toEqual(["failed"]);
    });

    it("does not give one wallet's reason to another", async () => {
        const context = behind(qualifier("0x1", CONTEXT, "video"), "0xDepositor");
        const failed = behind(qualifier("0x1-video", OUTCOME, "failed"), "0xDepositor");
        const usage = (await read([held("0xDepositor")], [context, failed, qualifier("0x1-video-failed", BECAUSE, "missing-key", "0xDepositor")])).get(TOOL);
        const reasons = (wallet: string) => usage?.declarations.find((row) => row.writer === wallet)?.lines[0]?.reasons;
        expect(reasons("0xDepositor")).toEqual(["missing-key"]);
        expect(reasons(writer)).toEqual([]);
    });

    it("keeps apart a wallet with no position on the edge", async () => {
        const usage = (await read([use("0x1", "a")], [qualifier("0x1", OUTCOME, "failed", "0xStranger")])).get(TOOL);
        expect(usage?.wallets).toBe(1);
        expect(usage?.byOthers).toMatchObject([{writer: "0xStranger"}]);
    });

    it("says the read was cut when a line reaches the cap through other edges' wallets", async () => {
        const row = {...qualifier("0x1", OUTCOME, "failed", "0xOther"), positions: Array.from({length: 100}, (_v, at) => ({account_id: `0x${at}`}))};
        expect((await read([use("0x1", "a")], [row])).get(TOOL)?.truncated).toBe(true);
    });

    it("asks only for positions that still hold shares, so a wallet that exited and did not create the edge no longer declares", () => {
        expect(PULSE_USES_QUERY).toContain('positions(where: {shares: {_gt: "0"}})');
    });

    it("says the read was cut when an edge reaches the index's cap on positions", async () => {
        const row = {...use("0x1", "a"), positions: Array.from({length: 100}, (_v, at) => ({account_id: `0x${at}`}))};
        expect((await read([row], [])).get(TOOL)?.truncated).toBe(true);
    });
});

describe("the wallet that pays for a line", () => {
    const paid = (rows: unknown[]) =>
        getPulseUsage([TOOL], {
            graphqlUrl: "unused",
            inContextOf: CONTEXT,
            hasOutcome: OUTCOME,
            because: BECAUSE,
            payers: ["0xTREASURY"],
            transport: transport([{...use("0x1", "a", "0xTreasury"), positions: [{account_id: "0xAgent"}]}], rows),
        });
    const onBehalf = (row: ReturnType<typeof qualifier>) => ({...row, positions: [{account_id: "0xAgent"}]});

    it("says nothing by paying: only the agent holds the line", async () => {
        const usage = (
            await paid([
                onBehalf(qualifier("0x1", CONTEXT, "video", "0xTreasury")),
                onBehalf(qualifier("0x1-video", OUTCOME, "failed", "0xTreasury")),
                onBehalf(qualifier("0x1-video-failed", BECAUSE, "missing-key", "0xTreasury")),
            ])
        ).get(TOOL);
        expect(usage?.declarations.find((row) => row.writer === "0xAgent")?.lines).toEqual([
            {domain: "video", outcome: "failed", reasons: ["missing-key"], form: "nested"},
        ]);
        expect(usage?.declarations.find((row) => row.writer === "0xTreasury")?.lines).toEqual([]);
    });

    it("keeps its row, since it did write the edge, and is not counted as a wallet", async () => {
        const usage = (await paid([])).get(TOOL);
        expect(usage?.declarations.map((row) => row.writer)).toEqual(["0xTreasury"]);
        expect(usage?.wallets).toBe(0);
    });
});

describe("form B", () => {
    const chain = (by = writer) => [
        qualifier("0x1", CONTEXT, "video", by),
        qualifier("0x1-video", OUTCOME, "failed", by),
        qualifier("0x1-video-failed", BECAUSE, "missing-key", by),
    ];

    it("reads a use, its domain, its outcome and its reason as one line", async () => {
        const usage = (await read([use("0x1", "a")], chain())).get(TOOL);
        expect(usage?.declarations[0]?.lines).toEqual([{domain: "video", outcome: "failed", reasons: ["missing-key"], form: "nested"}]);
        expect(usage?.byReason).toEqual({"missing-key": 1});
    });

    it("keeps two domains apart, so a failure in one is not a failure in the other", async () => {
        const usage = (
            await read(
                [use("0x1", "a")],
                [
                    qualifier("0x1", CONTEXT, "video"),
                    qualifier("0x1-video", OUTCOME, "failed"),
                    qualifier("0x1", CONTEXT, "audio"),
                    qualifier("0x1-audio", OUTCOME, "worked"),
                ],
            )
        ).get(TOOL);
        expect(usage?.declarations[0]?.lines).toContainEqual({domain: "video", outcome: "failed", reasons: [], form: "nested"});
        expect(usage?.declarations[0]?.lines).toContainEqual({domain: "audio", outcome: "worked", reasons: [], form: "nested"});
        expect(usage?.declarations[0]?.lines).toHaveLength(2);
    });

    it("still reads form A, on each domain of the edge", async () => {
        const usage = (
            await read([use("0x1", "a")], [qualifier("0x1", CONTEXT, "video"), qualifier("0x1", OUTCOME, "worked")])
        ).get(TOOL);
        expect(usage?.declarations[0]?.lines).toEqual([{domain: "video", outcome: "worked", reasons: [], form: "sibling"}]);
    });

    it("keeps one line for a use written in both forms, with the reason", async () => {
        const usage = (await read([use("0x1", "a")], [...chain(), qualifier("0x1", OUTCOME, "failed")])).get(TOOL);
        expect(usage?.declarations[0]?.lines).toEqual([{domain: "video", outcome: "failed", reasons: ["missing-key"], form: "nested"}]);
        expect(usage?.byOutcome).toEqual({failed: 1});
    });

    it("reads an outcome with no domain as a line with no domain", async () => {
        const usage = (await read([use("0x1", "a")], [qualifier("0x1", OUTCOME, "worked")])).get(TOOL);
        expect(usage?.declarations[0]?.lines).toEqual([{domain: null, outcome: "worked", reasons: [], form: "sibling"}]);
    });

    it("keeps somebody else's outcome on my domain apart", async () => {
        const usage = (
            await read([use("0x1", "a")], [qualifier("0x1", CONTEXT, "video"), qualifier("0x1-video", OUTCOME, "failed", "0xCompetitor")])
        ).get(TOOL);
        expect(usage?.declarations[0]?.lines).toEqual([]);
        expect(usage?.byOthers).toMatchObject([{writer: "0xCompetitor", predicate: "outcome", value: "failed"}]);
    });

    it("keeps somebody else's reason apart, so a competitor cannot excuse or explain my failure", async () => {
        const rows = [...chain().slice(0, 2), qualifier("0x1-video-failed", BECAUSE, "missing-key", "0xCompetitor")];
        const usage = (await read([use("0x1", "a")], rows)).get(TOOL);
        expect(usage?.declarations[0]?.lines[0]?.reasons).toEqual([]);
        expect(usage?.byOthers).toMatchObject([{writer: "0xCompetitor", predicate: "reason"}]);
    });

    it("does not follow an outcome on a domain the declarer does not stand behind", async () => {
        const rows = [qualifier("0x1", CONTEXT, "video", "0xCompetitor"), qualifier("0x1-video", OUTCOME, "failed")];
        const usage = (await read([use("0x1", "a")], rows)).get(TOOL);
        expect(usage?.declarations[0]?.lines).toEqual([]);
    });

    it("ignores a reason outside the list, and a reason on a success", async () => {
        const free = [...chain().slice(0, 2), qualifier("0x1-video-failed", BECAUSE, "the moon was full")];
        expect((await read([use("0x1", "a")], free)).get(TOOL)?.declarations[0]?.lines[0]?.reasons).toEqual([]);
        const onWorked = [
            qualifier("0x1", CONTEXT, "video"),
            qualifier("0x1-video", OUTCOME, "worked"),
            qualifier("0x1-video-worked", BECAUSE, "missing-key"),
        ];
        expect((await read([use("0x1", "a")], onWorked)).get(TOOL)?.declarations[0]?.lines[0]?.reasons).toEqual([]);
    });

    it("never asks for an amount, so a deposit's size cannot reach the score", () => {
        expect(PULSE_QUALIFIERS_QUERY).not.toMatch(/shares\s*\n|assets/);
    });
});

describe("workedInDomain", () => {
    it("counts a stated success in that domain, so a declared failure does not lift a skill", async () => {
        const usage = (
            await read(
                [use("0x1", "a"), use("0x2", "b"), use("0x3", "c")],
                [
                    qualifier("0x1", CONTEXT, "video"),
                    qualifier("0x1", OUTCOME, "failed"),
                    qualifier("0x2", CONTEXT, "video"),
                    qualifier("0x2", OUTCOME, "worked"),
                    qualifier("0x3", CONTEXT, "web"),
                    qualifier("0x3", OUTCOME, "worked"),
                ],
            )
        ).get(TOOL);
        expect(workedInDomain(usage, "video")).toBe(1);
        expect(workedInDomain(undefined, "video")).toBe(0);
    });
});

describe("findToolAtoms", () => {
    it("maps the URIs that exist, and asks nothing for an empty list", async () => {
        const transport: GraphqlTransport = {
            request: async (query: string) => {
                expect(query).toBe(PULSE_ATOMS_QUERY);
                return {atoms: [{term_id: "0xa", data: "ipfs://one"}]};
            },
        };
        const found = await findToolAtoms(["ipfs://one", "ipfs://two"], {graphqlUrl: "unused", transport});
        expect([...found]).toEqual([["ipfs://one", "0xa"]]);
        expect((await findToolAtoms([], {graphqlUrl: "unused", transport})).size).toBe(0);
    });
});
