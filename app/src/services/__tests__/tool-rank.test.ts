import {describe, expect, it} from "vitest";

import {livenessOf, rankTools, type ToolRow} from "../tool-catalog";

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
    const facts = new Map<string, {liveness: "alive" | "unknown" | "dead"; installs: number | null}>();
    const read = (r: ToolRow) => facts.get(r.key) ?? {liveness: "unknown" as const, installs: null};

    it("sinks a tool that does not answer below one that does, whatever either staked", () => {
        // The gate, and the whole argument for having one: it is the only input nobody can be paid
        // to change. A composed score would let the stake outweigh it, which is the thing ADR 0046
        // refuses.
        const dead = row({key: "0xdead", stakers: 99, supportTrust: "100"});
        const alive = row({key: "0xalive", stakers: 1, supportTrust: "0.001"});
        facts.set("0xdead", {liveness: "dead", installs: 5_000_000});
        facts.set("0xalive", {liveness: "alive", installs: 1});

        expect(rankTools([dead, alive], "staked", read).map((r) => r.key)).toEqual([
            "0xalive",
            "0xdead",
        ]);
        // And on every other axis, because it is a gate rather than a term in a sum.
        expect(rankTools([dead, alive], "installs", read)[0]?.key).toBe("0xalive");
        expect(rankTools([dead, alive], "claims", read)[0]?.key).toBe("0xalive");
    });

    it("puts an unknown reading between alive and dead", () => {
        const unknown = row({key: "0xunknown"});
        const alive = row({key: "0xalive"});
        const dead = row({key: "0xdead"});
        facts.set("0xalive", {liveness: "alive", installs: null});
        facts.set("0xdead", {liveness: "dead", installs: null});
        facts.delete("0xunknown");

        expect(rankTools([dead, unknown, alive], "staked", read).map((r) => r.key)).toEqual([
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
        expect(rankTools([many, staked], "staked", read)[0]?.key).toBe("0xstaked");
        expect(rankTools([staked, many], "claims", read)[0]?.key).toBe("0xmany");
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
        rankTools(input, "staked", read);
        expect(input.map((r) => r.key)).toEqual(["0xa", "0xb"]);
    });
});
