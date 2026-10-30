import {describe, expect, it} from "vitest";
import type {RecentDeclaration} from "@arp-protocol/core";

import {busiestEnd, groupRecent} from "../recent-declarations-view";

/**
 * The grouping behind scene 2 of the landing page, including the tie rule — which is a product
 * decision and was recorded nowhere until this file.
 */

function row(overrides: Partial<RecentDeclaration> = {}): RecentDeclaration {
    return {
        tripleId: `0x${Math.random().toString(16).slice(2)}`,
        at: new Date().toISOString(),
        txHash: null,
        subject: {atomId: "a", label: "Agent A"},
        object: {atomId: "t", label: "Tool T"},
        assets: null,
        positions: 0,
        ...overrides,
    };
}

describe("busiestEnd", () => {
    it("is null on no rows, which is not the same as a group with no rows", () => {
        // Mainnet's answer today. The page prints a different sentence for each, and conflating
        // them is how a failed read became "nobody has run the loop here".
        expect(busiestEnd([], (r) => r.subject)).toBeNull();
    });

    it("picks the end with the most rows and carries them", () => {
        const rows = [
            row({subject: {atomId: "a", label: "A"}}),
            row({subject: {atomId: "b", label: "B"}}),
            row({subject: {atomId: "a", label: "A"}}),
        ];
        const group = busiestEnd(rows, (r) => r.subject);
        expect(group?.key.atomId).toBe("a");
        expect(group?.rows).toHaveLength(2);
    });

    it("breaks a tie towards the most recent", () => {
        // `rows` arrive newest first, so the newest group is the first one the scan meets and `>`
        // keeps it. `>=` would hand the card to the older of two equally busy agents, on a page
        // whose whole subject is current activity.
        const rows = [
            row({subject: {atomId: "new", label: "Newer"}}),
            row({subject: {atomId: "old", label: "Older"}}),
        ];
        expect(busiestEnd(rows, (r) => r.subject)?.key.atomId).toBe("new");
    });

    it("keeps the rows in the order they were read", () => {
        const rows = [
            row({tripleId: "0x1", subject: {atomId: "a", label: "A"}}),
            row({tripleId: "0x2", subject: {atomId: "a", label: "A"}}),
        ];
        expect(busiestEnd(rows, (r) => r.subject)?.rows.map((r) => r.tripleId)).toEqual([
            "0x1",
            "0x2",
        ]);
    });

    it("groups by atom id, not by label", () => {
        // Two atoms can carry the same label — measured on Intuition, `sofia.intuition.box` has 30
        // atoms across 28 URLs under 21 names. Grouping on the label would merge two markets.
        const rows = [
            row({object: {atomId: "t1", label: "Slither"}}),
            row({object: {atomId: "t2", label: "Slither"}}),
        ];
        expect(busiestEnd(rows, (r) => r.object)?.rows).toHaveLength(1);
    });

    it("carries a null label through rather than inventing one", () => {
        const group = busiestEnd([row({object: {atomId: "0xabc", label: null}})], (r) => r.object);
        expect(group?.key.label).toBeNull();
    });
});

describe("groupRecent", () => {
    it("reads the same edges from both ends", () => {
        const rows = [
            row({subject: {atomId: "a", label: "A"}, object: {atomId: "t", label: "T"}}),
            row({subject: {atomId: "a", label: "A"}, object: {atomId: "u", label: "U"}}),
            row({subject: {atomId: "b", label: "B"}, object: {atomId: "t", label: "T"}}),
        ];
        const {agent, tool} = groupRecent(rows);
        // Agent A used two tools; tool T was used by two agents. One query, two cards.
        expect(agent?.key.atomId).toBe("a");
        expect(agent?.rows).toHaveLength(2);
        expect(tool?.key.atomId).toBe("t");
        expect(tool?.rows).toHaveLength(2);
    });

    it("is null on both sides when the read is empty", () => {
        expect(groupRecent([])).toEqual({agent: null, tool: null});
    });
});
