import {PULSE_ATOMS_QUERY, PULSE_QUALIFIERS_QUERY, PULSE_USES_QUERY, type GraphqlTransport} from "@arp-protocol/graphql";
import {describe, expect, it} from "vitest";

import {findToolAtoms, getPulseUsage, workedInDomain} from "../src/pulse-usage.js";

const TOOL = "0xaaa";
const CONTEXT = "0xc0";
const OUTCOME = "0xd0";
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
        request: async (query: string) => {
            if (query === PULSE_USES_QUERY) return {triples: uses};
            if (query === PULSE_QUALIFIERS_QUERY) return {triples: qualifiers};
            throw new Error("unexpected query");
        },
    };
}

const read = (uses: unknown[], qualifiers: unknown[], limit?: number) =>
    getPulseUsage([TOOL], {
        graphqlUrl: "unused",
        inContextOf: CONTEXT,
        hasOutcome: OUTCOME,
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
