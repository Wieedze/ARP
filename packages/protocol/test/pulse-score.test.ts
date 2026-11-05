import {describe, expect, it} from "vitest";

import {inferDomain, lineWeight, priorFromRank, scoreSkill, signalOf, WALLETS_TO_MOVE, type SignalContext} from "../src/pulse-score.js";
import type {UsageReason} from "../src/declare/usage-context.js";
import type {PulseUsage} from "../src/pulse-usage.js";

const line = (writer: string, domains: string[], outcomes: ("worked" | "failed")[], reasons: UsageReason[] = []) => ({
    tripleId: "0x1",
    agent: {atomId: writer, label: null},
    writer,
    holders: [],
    declaredAt: null,
    domains,
    outcomes,
    lines: domains.flatMap((domain) => outcomes.map((outcome) => ({domain, outcome, reasons, form: "nested" as const}))),
});
const usage = (...declarations: ReturnType<typeof line>[]): PulseUsage => ({
    declarations,
    agents: 0,
    wallets: 0,
    byDomain: {},
    byOutcome: {},
    byReason: {},
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
            expect(version).toBe("pulse-score-3");
        }
    });

    it("never puts a skill the search did not return above the search's last result", () => {
        for (let total = 2; total <= 100; total += 1) {
            expect(priorFromRank(total - 1, total)).toBeGreaterThanOrEqual(priorFromRank(null, total));
        }
    });

    it("handles a search of one result", () => {
        expect(priorFromRank(0, 1)).toBeCloseTo(0.8);
    });
});

const video = (over: Partial<SignalContext> = {}): SignalContext => ({
    domain: "video",
    near: new Set(["video-editing", "media"]),
    canProvide: new Set(),
    ...over,
});

describe("lineWeight", () => {
    const worked = {outcome: "worked" as const, reasons: []};
    const failed = (...reasons: UsageReason[]) => ({domain: "video", outcome: "failed" as const, reasons});

    it("weighs the same domain in full, a near one less, and any other not at all", () => {
        expect(lineWeight({...worked, domain: "video"}, video())).toBe(1);
        expect(lineWeight({...worked, domain: "video-editing"}, video())).toBe(0.5);
        expect(lineWeight({...worked, domain: "audio"}, video())).toBe(0);
        expect(lineWeight({...worked, domain: null}, video())).toBe(0);
    });

    it("counts every line in full when the search names no domain", () => {
        const none = video({domain: null, near: new Set()});
        expect(lineWeight({...worked, domain: "audio"}, none)).toBe(1);
        expect(lineWeight({...worked, domain: null}, none)).toBe(1);
    });

    it("counts a failure for lack of a key only for who cannot supply one", () => {
        expect(lineWeight(failed("missing-key"), video())).toBe(1);
        expect(lineWeight(failed("missing-key"), video({canProvide: new Set(["key"])}))).toBe(0);
        expect(lineWeight(failed("missing-key"), video({canProvide: new Set(["program"])}))).toBe(1);
    });

    it("keeps a failure with no reason, whatever the person can supply", () => {
        expect(lineWeight(failed(), video({canProvide: new Set(["key", "program", "file"])}))).toBe(1);
    });

    it("counts a failure if any of its reasons still applies", () => {
        expect(lineWeight(failed("missing-key", "missing-file"), video({canProvide: new Set(["key"])}))).toBe(1);
    });

    it("keeps not-the-right-tool to the domain it names", () => {
        expect(lineWeight(failed("not-the-right-tool"), video())).toBe(1);
        expect(lineWeight({...failed("not-the-right-tool"), domain: "video-editing"}, video())).toBe(0);
    });

    it("gives a proof no more weight than a declaration today", () => {
        expect(lineWeight({...worked, domain: "video", proven: true}, video())).toBe(1);
    });

    it("can multiply a proven line, and only a proven one, when a weight says so", () => {
        const weights = {near: 0.5, proven: 2};
        expect(lineWeight({...worked, domain: "video", proven: true}, video(), weights)).toBe(2);
        expect(lineWeight({...worked, domain: "video-editing", proven: true}, video(), weights)).toBe(1);
        expect(lineWeight({...worked, domain: "video"}, video(), weights)).toBe(1);
    });
});

describe("signalOf", () => {
    const worked = (...wallets: string[]) => wallets.map((wallet) => line(wallet, ["video"], ["worked"]));
    const failed = (...wallets: string[]) => wallets.map((wallet) => line(wallet, ["video"], ["failed"]));
    const none = {worked: 0, failed: 0};

    it("counts one wallet once, however many lines it writes", () => {
        const read = usage(...worked("0xA", "0xa", "0xB", "0xC"));
        expect(signalOf(read, video())).toMatchObject({worked: 3, heard: none});
    });

    it("keeps a wallet's heaviest line, so a near line does not add to an exact one", () => {
        const read = usage(line("0xA", ["video-editing"], ["worked"]), ...worked("0xA", "0xB", "0xC"));
        expect(signalOf(read, video()).worked).toBe(3);
    });

    it("says how many failures did not apply, so the score's parts explain themselves", () => {
        const read = usage(line("0xA", ["video"], ["failed"], ["missing-key"]));
        expect(signalOf(read, video({canProvide: new Set(["key"])})).failuresThatDoNotApply).toBe(1);
    });

    it("counts wallets there too, and not a wallet with a failure that does apply", () => {
        const read = usage(
            line("0xA", ["video"], ["failed"], ["missing-key"]),
            line("0xA", ["video"], ["failed"], ["missing-key"]),
            line("0xB", ["video"], ["failed"], ["missing-key"]),
            line("0xB", ["video"], ["failed"]),
        );
        expect(signalOf(read, video({canProvide: new Set(["key"])}))).toMatchObject({failuresThatDoNotApply: 1, heard: {failed: 1}});
    });

    it("does not call a failure in another domain one that does not apply", () => {
        const read = usage(line("0xA", ["audio"], ["failed"], ["missing-key"]));
        expect(signalOf(read, video({canProvide: new Set(["key"])})).failuresThatDoNotApply).toBe(0);
    });

    it("returns nothing for a tool nobody declared", () => {
        expect(signalOf(undefined, video())).toEqual({worked: 0, failed: 0, failuresThatDoNotApply: 0, heard: none});
    });

    describe("the threshold", () => {
        const scoreOf = (read: PulseUsage | undefined, rank: number) =>
            scoreSkill({rank, total: 10, ...signalOf(read, video())}).score;

        it("is 3", () => {
            expect(WALLETS_TO_MOVE).toBe(3);
        });

        it("a false worked line no longer moves a skill above another", () => {
            const others = scoreOf(undefined, 2);
            expect(scoreOf(usage(...worked("0xLiar")), 9)).toBeLessThan(others);
            expect(scoreOf(usage(...worked("0xLiar", "0xLiar2")), 9)).toBeLessThan(others);
        });

        it("a false failed line no longer moves the first result down", () => {
            const first = usage(...failed("0xLiar"));
            expect(scoreOf(first, 0)).toBe(scoreOf(undefined, 0));
            expect(scoreOf(first, 0)).toBeGreaterThan(scoreOf(undefined, 1));
        });

        it("leaves one wallet's line to be shown", () => {
            expect(signalOf(usage(...failed("0xLiar")), video())).toMatchObject({failed: 0, heard: {failed: 1, worked: 0}});
        });

        it("moves from three wallets that say the same thing", () => {
            expect(scoreOf(usage(...worked("0xA", "0xB", "0xC")), 8)).toBeGreaterThan(scoreOf(undefined, 0));
            expect(scoreOf(usage(...failed("0xA", "0xB", "0xC")), 0)).toBeLessThan(scoreOf(undefined, 8));
        });

        it("does not add a worked and a failed to reach it", () => {
            const read = usage(...worked("0xA", "0xB"), ...failed("0xC"));
            expect(signalOf(read, video())).toMatchObject({worked: 0, failed: 0, heard: {worked: 2, failed: 1}});
        });

        it("counts only wallets whose line concerns this search", () => {
            const read = usage(...worked("0xA", "0xB"), line("0xC", ["audio"], ["worked"]));
            expect(signalOf(read, video())).toMatchObject({worked: 0, heard: {worked: 2}});
        });

        it("does not count a failure excused for this person", () => {
            const excused = (wallet: string) => line(wallet, ["video"], ["failed"], ["missing-key"]);
            const read = usage(excused("0xA"), excused("0xB"), excused("0xC"));
            expect(signalOf(read, video({canProvide: new Set(["key"])}))).toMatchObject({failed: 0, failuresThatDoNotApply: 3});
        });
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
