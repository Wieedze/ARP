import {describe, expect, it} from "vitest";

import {inferDomain, priorFromRank, scoreSkill, walletsSaying} from "../src/pulse-score.js";
import type {PulseUsage} from "../src/pulse-usage.js";

const line = (writer: string, domains: string[], outcomes: string[]) => ({
    tripleId: "0x1",
    agent: {atomId: writer, label: null},
    writer,
    holders: [],
    declaredAt: null,
    domains,
    outcomes,
});
const usage = (...declarations: ReturnType<typeof line>[]): PulseUsage => ({
    declarations,
    agents: 0,
    wallets: 0,
    byDomain: {},
    byOutcome: {},
    byOthers: [],
    truncated: false,
});
const at = (rank: number | null, worked = 0, failed = 0) => scoreSkill({rank, total: 100, worked, failed}).score;

describe("scoreSkill", () => {
    it("keeps the search's order when nothing is declared", () => {
        expect(at(0)).toBeGreaterThan(at(1));
        expect(at(1)).toBeGreaterThan(at(99));
        expect(at(0)).toBeCloseTo(0.8);
        expect(at(99)).toBeCloseTo(0.2);
    });

    it("does not let one wallet lift a skill above the search's first result, and lets two", () => {
        expect(at(52, 1)).toBeLessThan(at(0));
        expect(at(52, 2)).toBeGreaterThan(at(0));
    });

    it("lowers a skill wallets said failed, even the search's first", () => {
        expect(at(0, 0, 1)).toBeLessThan(at(50));
    });

    it("gives a skill the search did not return the bottom of the range", () => {
        expect(at(null)).toBeCloseTo(0.2);
        expect(at(null, 4)).toBeGreaterThan(at(0));
    });

    it("weighs each new wallet less than the last", () => {
        expect(at(50, 2) - at(50, 1)).toBeLessThan(at(50, 1) - at(50, 0));
    });

    it("stays between 0 and 1 and says its version", () => {
        for (const [worked, failed] of [[0, 0], [100, 0], [0, 100], [5, 5]] as const) {
            const {score, version} = scoreSkill({rank: 3, total: 10, worked, failed});
            expect(score).toBeGreaterThanOrEqual(0);
            expect(score).toBeLessThanOrEqual(1);
            expect(version).toBe("pulse-score-1");
        }
    });

    it("handles a search of one result", () => {
        expect(priorFromRank(0, 1)).toBeCloseTo(0.8);
    });
});

describe("walletsSaying", () => {
    it("counts one wallet once, however many agents it writes about", () => {
        const read = usage(line("0xA", ["video"], ["worked"]), line("0xa", ["video"], ["worked"]), line("0xB", ["video"], ["failed"]));
        expect(walletsSaying(read, new Set(["video"]))).toEqual({worked: 1, failed: 1});
    });

    it("counts only the domains asked for, and all of them with none", () => {
        const read = usage(line("0xA", ["web"], ["worked"]), line("0xB", ["video"], ["worked"]));
        expect(walletsSaying(read, new Set(["video"]))).toEqual({worked: 1, failed: 0});
        expect(walletsSaying(read, null)).toEqual({worked: 2, failed: 0});
        expect(walletsSaying(undefined, null)).toEqual({worked: 0, failed: 0});
    });
});

describe("inferDomain", () => {
    const labels = ["video", "web", "card-payment", "ai"];

    it("finds a label among whole words", () => {
        expect(inferDomain("remove silence from a Video", labels)).toBe("video");
    });

    it("does not match inside a word", () => {
        expect(inferDomain("email webhook", labels)).toBeNull();
    });

    it("prefers the longest label", () => {
        expect(inferDomain("video card-payment", labels)).toBe("card-payment");
    });

    it("returns null when nothing is named", () => {
        expect(inferDomain("turn a script into a voice-over", labels)).toBeNull();
    });
});
