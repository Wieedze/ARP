import {describe, expect, it} from "vitest";

import {livenessOf, rankTools, toolSortAxesFor, type ToolRow} from "../tool-catalog";

const row = (overrides: Partial<ToolRow> = {}): ToolRow => ({
    key: `0x${"ab".repeat(32)}`,
    provenance: "registered",
    name: "a-skill",
    isUnnamed: false,
    source: null,
    label: null,
    href: "/atom/0x",
    declarations: 0,
    paidDeclarations: null,
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

        expect(rankTools([dead, alive], "declared", read).map((r) => r.key)).toEqual([
            "0xalive",
            "0xdead",
        ]);
        // And on every other axis, because it is a gate rather than a term in a sum.
        expect(rankTools([dead, alive], "installs", read)[0]?.key).toBe("0xalive");
        expect(rankTools([dead, alive], "stars", read)[0]?.key).toBe("0xalive");
    });

    it("puts an unknown reading between alive and dead", () => {
        const unknown = row({key: "0xunknown"});
        const alive = row({key: "0xalive"});
        const dead = row({key: "0xdead"});
        facts.set("0xalive", {liveness: "alive", installs: null});
        facts.set("0xdead", {liveness: "dead", installs: null});
        facts.delete("0xunknown");

        expect(rankTools([dead, unknown, alive], "declared", read).map((r) => r.key)).toEqual([
            "0xalive",
            "0xunknown",
            "0xdead",
        ]);
    });

    it("sorts by the axis the reader picked, inside the gate", () => {
        const many = row({key: "0xmany", stakers: 1, declarations: 1});
        const staked = row({key: "0xstaked", stakers: 9, declarations: 0});
        facts.set("0xmany", {liveness: "alive", installs: 9_000});
        facts.set("0xstaked", {liveness: "alive", installs: 2});

        expect(rankTools([staked, many], "installs", read)[0]?.key).toBe("0xmany");
        // "Declared" is how many agents declare it; the stake no longer has an order of its own.
        expect(rankTools([staked, many], "declared", read)[0]?.key).toBe("0xmany");
    });

    it("breaks a tie in agents on the stake behind them, positions before amount", () => {
        const backed = row({key: "0xbacked", declarations: 2, stakers: 3, supportTrust: "0.5"});
        const bare = row({key: "0xbare", declarations: 2, stakers: 0, supportTrust: "9"});
        facts.set("0xbacked", {liveness: "alive", installs: null});
        facts.set("0xbare", {liveness: "alive", installs: null});
        expect(rankTools([bare, backed], "declared", read)[0]?.key).toBe("0xbacked");
    });

    it("sorts repositories by stars, and offers each index only the axes that mean something there", () => {
        const starred = row({key: "0xstarred", declarations: 0});
        const used = row({key: "0xused", declarations: 5});
        facts.set("0xstarred", {liveness: "alive", installs: null, stars: 40_000});
        facts.set("0xused", {liveness: "alive", installs: null, stars: 10});
        expect(rankTools([used, starred], "stars", read)[0]?.key).toBe("0xstarred");
        expect(toolSortAxesFor("skills").map((axis) => axis.id)).toEqual(["declared", "installs"]);
        expect(toolSortAxesFor("repos").map((axis) => axis.id)).toEqual(["declared", "stars"]);
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
        rankTools(input, "declared", read);
        expect(input.map((r) => r.key)).toEqual(["0xa", "0xb"]);
    });
});
