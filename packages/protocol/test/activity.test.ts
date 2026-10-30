import {describe, expect, it} from "vitest";

import {
    activityFromLine,
    activityFromWire,
    decodeMultiVaultCall,
    orderActivity,
    type ActivityEvent,
} from "../src/activity.js";
import {encodeCreateTriple, encodeDeposit} from "../src/declare/multivault.js";

const AGENT = `0x${"a".repeat(64)}` as const;
const USES = `0x${"b".repeat(64)}` as const;
const SKILL = `0x${"c".repeat(64)}` as const;
const TRIPLE = `0x${"d".repeat(64)}` as const;
const WALLET = "0xB86F5f4E338eCEEC5DD095f48acF764465587FCF";
const HASH = `0x${"e".repeat(64)}`;

describe("decodeMultiVaultCall", () => {
    it("reads the three ids out of a create-triple, so a declaration names the tool it is about", () => {
        expect(decodeMultiVaultCall(encodeCreateTriple(AGENT, USES, SKILL, 1n))).toEqual({
            fn: "createTriples",
            subjects: [AGENT],
            predicates: [USES],
            objects: [SKILL],
        });
    });

    it("reads the term a deposit stakes on", () => {
        expect(decodeMultiVaultCall(encodeDeposit(WALLET, TRIPLE, 1n, 0n))).toEqual({
            fn: "deposit",
            receiver: WALLET,
            termId: TRIPLE,
            curveId: "1",
        });
    });

    it("names an unknown selector rather than guessing, and never throws", () => {
        expect(decodeMultiVaultCall("0xdeadbeef00")).toEqual({fn: "other", selector: "0xdeadbeef"});
        expect(decodeMultiVaultCall("not hex")).toEqual({fn: "other", selector: null});
        expect(decodeMultiVaultCall(null)).toEqual({fn: "other", selector: null});
    });
});

describe("activityFromLine", () => {
    it("a hook line, in the 33a format", () => {
        const line = JSON.stringify({
            at: "2026-10-30T13:10:36.339Z",
            session: "s1",
            call: "toolu_1",
            format: "claude",
            kind: "skill",
            name: "brainstorming",
            source: null,
            ref: SKILL,
            outcome: "ok",
            code: null,
            ms: 9,
        });
        expect(activityFromLine("session", line)).toEqual({
            source: "session",
            at: "2026-10-30T13:10:36.339Z",
            session: "s1",
            call: "toolu_1",
            kind: "skill",
            name: "brainstorming",
            ref: SKILL,
            outcome: "ok",
            ms: 9,
        });
    });

    it("a hook line from before 33a has no outcome and no duration, not a made-up one", () => {
        const event = activityFromLine(
            "session",
            JSON.stringify({at: "x", kind: "mcp", name: "arp"}),
        );
        expect(event).toMatchObject({outcome: null, ms: null, call: null});
    });

    it("a receipt line names the skill, the atom and who signed the receipt", () => {
        const line = JSON.stringify({
            skill: "brainstorming",
            atom: SKILL,
            url: "https://u",
            at: "t",
            node: "0x76dc",
            to: WALLET,
        });
        expect(activityFromLine("receipt", line)).toEqual({
            source: "receipt",
            at: "t",
            name: "brainstorming",
            url: "https://u",
            atom: SKILL,
            signer: "0x76dc",
            to: WALLET,
        });
    });

    it("a signer line decodes its calldata and keeps the hash only when it is one", () => {
        const line = JSON.stringify({
            at: "t",
            chainId: 13579,
            status: "success",
            hash: HASH,
            signer: WALLET,
            to: "0x2Ece",
            value: "2000000002000000",
            gasUsed: "546818",
            kind: "create-triple",
            why: "declare",
            data: encodeCreateTriple(AGENT, USES, SKILL, 1n),
        });
        const event = activityFromLine("sent", line);
        expect(event).toMatchObject({
            status: "success",
            hash: HASH,
            decoded: {fn: "createTriples", objects: [SKILL]},
        });
        expect(
            activityFromLine("sent", JSON.stringify({chainId: 13579, status: "dry", hash: "0x12"})),
        ).toMatchObject({
            status: "dry",
            hash: null,
        });
    });

    it("drops what does not say enough, and never throws on a corrupt line", () => {
        expect(activityFromLine("session", "{not json")).toBeNull();
        expect(activityFromLine("session", JSON.stringify({kind: "bash", name: "ls"}))).toBeNull();
        expect(
            activityFromLine("sent", JSON.stringify({chainId: 13579, status: "maybe"})),
        ).toBeNull();
        expect(activityFromLine("sent", JSON.stringify({status: "success"}))).toBeNull();
        expect(activityFromLine("receipt", "   ")).toBeNull();
    });
});

describe("activityFromWire", () => {
    it("round-trips every source through JSON, which is how the feed sends it", () => {
        const events = [
            activityFromLine(
                "session",
                JSON.stringify({
                    at: "1",
                    kind: "skill",
                    name: "b",
                    ref: SKILL,
                    outcome: "ok",
                    ms: 3,
                }),
            ),
            activityFromLine(
                "receipt",
                JSON.stringify({at: "2", skill: "b", atom: SKILL, node: "0x1", to: WALLET}),
            ),
            activityFromLine(
                "sent",
                JSON.stringify({
                    at: "3",
                    chainId: 13579,
                    status: "success",
                    hash: HASH,
                    data: encodeDeposit(WALLET, TRIPLE, 1n, 0n),
                }),
            ),
        ];
        for (const event of events) {
            expect(activityFromWire(JSON.parse(JSON.stringify(event)))).toEqual(event);
        }
    });

    it("refuses a shape it does not know, and a decoded call with bad hex loses its ids", () => {
        expect(activityFromWire({source: "chat", text: "hi"})).toBeNull();
        const event = activityFromWire({
            source: "sent",
            at: "1",
            chainId: 13579,
            status: "success",
            decoded: {fn: "deposit", receiver: "nope", termId: TRIPLE},
        });
        expect(event).toMatchObject({decoded: {fn: "other", selector: null}});
    });
});

describe("orderActivity", () => {
    it("oldest first, ties in arrival order", () => {
        const at = (value: string, name: string): ActivityEvent => ({
            source: "receipt",
            at: value,
            name,
            url: null,
            atom: null,
            signer: null,
            to: null,
        });
        const ordered = orderActivity([at("2", "b"), at("1", "a"), at("2", "c")]);
        expect(ordered.map((event) => event.source === "receipt" && event.name)).toEqual([
            "a",
            "b",
            "c",
        ]);
    });

    it("a value that is not decimal wei reads as zero, never as a string a reader would BigInt", () => {
        for (const value of ["0x10", "1e18", "abc", "-1"]) {
            const event = activityFromLine(
                "sent",
                JSON.stringify({chainId: 13579, status: "dry", value}),
            );
            expect(event).toMatchObject({value: "0"});
        }
        expect(
            activityFromLine("sent", JSON.stringify({chainId: 13579, status: "dry", value: "42"})),
        ).toMatchObject({value: "42"});
    });
});
