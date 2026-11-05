import {describe, expect, it} from "vitest";

import {
    livenessOf,
    pageOfTools,
    rankTools,
    toolMatches,
    toolSortAxesFor,
    type ToolRow,
} from "../tool-catalog";

const row = (overrides: Partial<ToolRow> = {}): ToolRow => ({
    key: `0x${"ab".repeat(32)}`,
    provenance: "registered",
    name: "a-skill",
    isUnnamed: false,
    source: null,
    label: null,
    href: "/atom/0x",
    declarations: 0,
    declarers: [],
    provenDeposits: null,
    supportTrust: "0.001",
    opposeTrust: null,
    stakers: 0,
    ...overrides,
});

describe("livenessOf", () => {
    it("takes the owner's own word for dead", () => {
        expect(livenessOf({archived: true, gone: false})).toBe("dead");
        expect(livenessOf({archived: false, gone: true})).toBe("dead");
    });

    it("says unknown rather than dead when there is no reading", () => {
        // A tool this build carries nothing for is not a tool that failed. Sorting it with the
        // archived would be asserting something about it.
        expect(livenessOf(null)).toBe("unknown");
    });

    it("is alive on a repository its owner has neither archived nor removed", () => {
        expect(livenessOf({archived: false, gone: false})).toBe("alive");
    });
});

describe("rankTools", () => {
    type Facts = {
        liveness: "alive" | "unknown" | "dead";
        installs: number | null;
        stars?: number | null;
    };
    const facts = new Map<string, Facts>();
    const read = (r: ToolRow) => {
        const fact = facts.get(r.key) ?? {liveness: "unknown" as const, installs: null};
        return {...fact, stars: fact.stars ?? null};
    };

    it("sinks a tool that does not answer below one that does, whatever either staked", () => {
        // The gate, and the whole argument for having one: it is the only input nobody can be paid
        // to change. A composed score would let the stake outweigh it, which is the thing ADR 0046
        // refuses.
        const dead = row({key: "0xdead", stakers: 99, supportTrust: "100"});
        const alive = row({key: "0xalive", stakers: 1, supportTrust: "0.001"});
        facts.set("0xdead", {liveness: "dead", installs: 5_000_000});
        facts.set("0xalive", {liveness: "alive", installs: 1});

        expect(rankTools([dead, alive], "usage", read).map((r) => r.key)).toEqual([
            "0xalive",
            "0xdead",
        ]);
        // And on every other axis, because it is a gate rather than a term in a sum.
        expect(rankTools([dead, alive], "installs", read)[0]?.key).toBe("0xalive");
        expect(rankTools([dead, alive], "stars", read)[0]?.key).toBe("0xalive");
    });

    it("ranks an unknown reading with the alive, above the dead", () => {
        // A repository newer than the bundled readings, with the most deposits on the page.
        const unknown = row({key: "0xunknown", provenDeposits: 30});
        const alive = row({key: "0xalive", provenDeposits: 0});
        const dead = row({key: "0xdead", provenDeposits: 99});
        facts.set("0xalive", {liveness: "alive", installs: null});
        facts.set("0xdead", {liveness: "dead", installs: null});
        facts.delete("0xunknown");

        expect(rankTools([dead, unknown, alive], "usage", read).map((r) => r.key)).toEqual([
            "0xunknown",
            "0xalive",
            "0xdead",
        ]);
    });

    it("sorts by the axis the reader picked, inside the gate", () => {
        const many = row({key: "0xmany", stakers: 1, provenDeposits: 1});
        const staked = row({key: "0xstaked", stakers: 9, provenDeposits: 0});
        facts.set("0xmany", {liveness: "alive", installs: 2});
        facts.set("0xstaked", {liveness: "alive", installs: 9_000});

        expect(rankTools([many, staked], "installs", read)[0]?.key).toBe("0xstaked");
        // Usage is the Usage figure; the stake has no order of its own.
        expect(rankTools([staked, many], "usage", read)[0]?.key).toBe("0xmany");
    });

    it("breaks a tie in Usage on installs, and no deposit outside the sponsor moves it", () => {
        const installed = row({
            key: "0xinstalled",
            name: "b",
            provenDeposits: 2,
            declarations: 0,
            stakers: 0,
            supportTrust: "0.1",
        });
        const backed = row({
            key: "0xbacked",
            name: "a",
            provenDeposits: 2,
            declarations: 99,
            stakers: 99,
            supportTrust: "99",
        });
        facts.set("0xinstalled", {liveness: "alive", installs: 5});
        facts.set("0xbacked", {liveness: "alive", installs: 1});
        expect(rankTools([backed, installed], "usage", read)[0]?.key).toBe("0xinstalled");
    });

    it("falls to the name when nothing else separates two tools, whatever their stake", () => {
        const late = row({key: "0xlate", name: "zeta", stakers: 99, supportTrust: "99"});
        const early = row({key: "0xearly", name: "alpha", stakers: 0, supportTrust: "0"});
        facts.set("0xlate", {liveness: "alive", installs: null});
        facts.set("0xearly", {liveness: "alive", installs: null});
        expect(rankTools([late, early], "usage", read)[0]?.key).toBe("0xearly");
    });

    it("orders Most used by the Usage figure, not by the edge count no column shows", () => {
        const deep = row({key: "0xdeep", declarations: 2, provenDeposits: 6});
        const wide = row({key: "0xwide", declarations: 3, provenDeposits: 3});
        facts.set("0xdeep", {liveness: "alive", installs: null});
        facts.set("0xwide", {liveness: "alive", installs: null});
        expect(rankTools([wide, deep], "usage", read).map((r) => r.key)).toEqual([
            "0xdeep",
            "0xwide",
        ]);
    });

    it("sorts repositories by stars, and offers each index only the axes that mean something there", () => {
        const starred = row({key: "0xstarred", declarations: 0});
        const used = row({key: "0xused", declarations: 5});
        facts.set("0xstarred", {liveness: "alive", installs: null, stars: 40_000});
        facts.set("0xused", {liveness: "alive", installs: null, stars: 10});
        expect(rankTools([used, starred], "stars", read)[0]?.key).toBe("0xstarred");
        expect(toolSortAxesFor("skills", true).map((axis) => axis.id)).toEqual([
            "usage",
            "installs",
        ]);
        expect(toolSortAxesFor("repos", true).map((axis) => axis.id)).toEqual(["usage", "stars"]);
    });

    it("offers no order on Usage when Usage cannot be read", () => {
        expect(toolSortAxesFor("skills", false).map((axis) => axis.id)).toEqual(["installs"]);
        expect(toolSortAxesFor("repos", false).map((axis) => axis.id)).toEqual(["stars"]);
    });

    it("reads the Usage column down in order under Most used, unknown below a known zero", () => {
        const proven = row({key: "0xproven", provenDeposits: 15});
        const zero = row({key: "0xzero", provenDeposits: 0});
        const unread = row({key: "0xunread", provenDeposits: null, declarations: 9});
        for (const key of ["0xproven", "0xzero", "0xunread"]) {
            facts.set(key, {liveness: "alive", installs: null});
        }

        expect(rankTools([unread, zero, proven], "usage", read).map((r) => r.key)).toEqual([
            "0xproven",
            "0xzero",
            "0xunread",
        ]);
    });

    it("ranks an unknown install count below a known zero", () => {
        // `null` is "this build has no figure", not "nobody installed it". A tool with a real zero
        // has been looked at; one with nothing has not.
        const none = row({key: "0xnone"});
        const zero = row({key: "0xzero"});
        facts.set("0xnone", {liveness: "alive", installs: null});
        facts.set("0xzero", {liveness: "alive", installs: 0});

        expect(rankTools([none, zero], "installs", read)[0]?.key).toBe("0xzero");
    });

    it("leaves the caller's array alone", () => {
        const first = row({key: "0xa"});
        const second = row({key: "0xb"});
        facts.set("0xa", {liveness: "dead", installs: null});
        facts.set("0xb", {liveness: "alive", installs: null});
        const input = [first, second];
        rankTools(input, "usage", read);
        expect(input.map((r) => r.key)).toEqual(["0xa", "0xb"]);
    });
});

describe("pageOfTools", () => {
    const rows = Array.from({length: 62}, (_, index) => row({key: `0x${index}`}));

    it("slices without reordering and says where the page sits", () => {
        const page = pageOfTools(rows, 25, 25);
        expect(page.rows.map((r) => r.key)).toEqual(rows.slice(25, 50).map((r) => r.key));
        expect(page.rangeLabel).toBe("26–50 of 62");
        expect(page.hasPrevious).toBe(true);
        expect(page.hasNext).toBe(true);
    });

    it("ends on a short last page", () => {
        const page = pageOfTools(rows, 50, 25);
        expect(page.rows).toHaveLength(12);
        expect(page.rangeLabel).toBe("51–62 of 62");
        expect(page.hasNext).toBe(false);
    });

    it("clamps an offset the list shrank under to its last page", () => {
        const page = pageOfTools(rows.slice(0, 30), 200, 25);
        expect(page.offset).toBe(25);
        expect(page.rows).toHaveLength(5);
    });

    it("says there are no rows rather than a range of none", () => {
        const page = pageOfTools([], 0, 25);
        expect(page.rows).toEqual([]);
        expect(page.rangeLabel).toBe("no rows");
        expect(page.hasPrevious).toBe(false);
        expect(page.hasNext).toBe(false);
    });
});

describe("toolMatches (task 48)", () => {
    const tool = row({
        name: "writing-plans",
        label: "github.com/obra/superpowers?skill=writing-plans",
        source: "obra/superpowers",
    });

    it("matches the name, the label, the repository or the description, without case", () => {
        expect(toolMatches(tool, "Writing", null)).toBe(true);
        expect(toolMatches(tool, "superpowers", null)).toBe(true);
        expect(toolMatches(tool, "spec", "Use when you have a spec")).toBe(true);
    });

    it("matches nothing for a blank query or a miss", () => {
        expect(toolMatches(tool, "  ", "anything")).toBe(false);
        expect(toolMatches(tool, "kling", null)).toBe(false);
    });
});
