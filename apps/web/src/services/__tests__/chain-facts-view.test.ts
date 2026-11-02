import {describe, expect, it} from "vitest";
import type {RecentDeclaration, RecentStake} from "@arp-protocol/core";

import {chainFacts, factsOfKind, isOwnFact, type ChainFact} from "../chain-facts-view";

const end = (atomId: string, label: string | null) => ({atomId, label});
const HASH = `0x${"e".repeat(64)}`;
const OTHER = `0x${"f".repeat(64)}`;

const declaration = (params: Partial<RecentDeclaration> & {at: string}): RecentDeclaration => ({
    tripleId: "c1",
    txHash: HASH,
    subject: end("a", "Agent A"),
    object: end("t", null),
    assets: null,
    positions: 0,
    ...params,
});

const stake = (params: Partial<RecentStake> & {id: string; at: string}): RecentStake => ({
    kind: "deposit",
    txHash: OTHER,
    tripleId: "c1",
    subject: end("a", "Agent A"),
    object: end("t", null),
    account: null,
    receiver: null,
    assets: 5n,
    ...params,
});

describe("chainFacts", () => {
    it("merges declarations and stakes newest first, comparing instants rather than strings", () => {
        const facts = chainFacts(
            [declaration({at: "2026-10-30T13:00:00Z"})],
            [
                // 13:30 UTC, written with another offset: a string sort would put it first
                stake({id: "d1", at: "2026-10-30T15:30:00+02:00", txHash: "not a hash"}),
                stake({id: "r1", kind: "redeem", at: "2026-10-30T14:00:00Z", assets: 3n}),
            ],
            50,
        );
        expect(facts.map((fact) => fact.kind)).toEqual(["redeem", "deposit", "declared"]);
        // An unlabelled atom is named by its id; a malformed hash is dropped, not linked.
        expect(facts[2]).toMatchObject({tool: "t", tx: HASH, assets: null});
        expect(facts[1]).toMatchObject({tx: null, assets: "5", key: "deposit:d1"});
    });

    it("shows a deposit made in the declaring transaction on the declaration's row", () => {
        const facts = chainFacts(
            [declaration({at: "2026-10-30T13:00:00Z"})],
            [
                stake({
                    id: `${HASH}-4`,
                    at: "2026-10-30T13:00:00Z",
                    txHash: HASH,
                    account: "0xabc",
                    assets: 7n,
                }),
            ],
            50,
        );
        expect(facts).toHaveLength(1);
        expect(facts[0]).toMatchObject({kind: "declared", assets: "7", account: "0xabc"});
    });

    it("drops rows older than the oldest of a capped list, so a cut-off list never reads as none", () => {
        // Two stakes fill a limit of 2; the declaration predates both and might have company the
        // stake read never reached.
        const facts = chainFacts(
            [declaration({at: "2026-10-30T10:00:00Z"})],
            [
                stake({id: "d1", at: "2026-10-30T13:00:00Z"}),
                stake({id: "d2", at: "2026-10-30T12:00:00Z"}),
            ],
            2,
        );
        expect(facts.map((fact) => fact.key)).toEqual(["deposit:d1", "deposit:d2"]);
    });
});

const fact = (params: Partial<ChainFact>): ChainFact => ({
    key: "k",
    kind: "deposit",
    at: "2026-10-30T13:00:00+00:00",
    agent: "Agent A",
    tool: "t",
    agentAtomId: "a",
    toolAtomId: "t",
    tx: null,
    assets: null,
    account: null,
    receiver: null,
    ...params,
});

describe("isOwnFact", () => {
    const me = "0xB86F5f4E338eCEEC5DD095f48acF764465587FCF";

    it("is yours when you signed it, whatever the case", () => {
        expect(isOwnFact(fact({account: me.toLowerCase()}), me)).toBe(true);
    });

    it("is yours when a sponsor signed and the position is in your name", () => {
        expect(isOwnFact(fact({account: "0x5905", receiver: me}), me)).toBe(true);
    });

    it("is nobody's without a wallet, and not yours when neither address is", () => {
        expect(isOwnFact(fact({account: me}), null)).toBe(false);
        expect(isOwnFact(fact({account: "0x1", receiver: "0x2"}), me)).toBe(false);
        // A declaration with no deposit carries no address.
        expect(isOwnFact(fact({kind: "declared"}), me)).toBe(false);
    });
});

describe("factsOfKind", () => {
    const facts = [fact({key: "a", kind: "declared"}), fact({key: "b", kind: "deposit"})];

    it("keeps every row for all, and one kind otherwise", () => {
        expect(factsOfKind(facts, "all").map((row) => row.key)).toEqual(["a", "b"]);
        expect(factsOfKind(facts, "deposit").map((row) => row.key)).toEqual(["b"]);
        expect(factsOfKind(facts, "redeem")).toEqual([]);
    });
});
