import {describe, expect, it} from "vitest";

import type {LocalFailure} from "../src/local-failures.js";
import {decideShare, installedFromReceipts, installedFromSkillLock, isSharingOn, sharedLineKey} from "../src/share-failures.js";

const failure = (over: Partial<LocalFailure> = {}): LocalFailure => ({
    at: "2026-11-05T10:00:00Z",
    skill: "clip",
    source: null,
    reason: "missing-key",
    ...over,
});
const installed = [{skill: "clip", source: "a/b"}];
const none = new Set<string>();

describe("isSharingOn", () => {
    it("is off with no file, a broken file, or anything but exactly true", () => {
        for (const text of [null, "", "{half", "null", "[]", "{}", '{"failures":"true"}', '{"failures":1}', '{"failures":false}']) {
            expect(isSharingOn(text)).toBe(false);
        }
    });

    it("is on for true", () => {
        expect(isSharingOn('{"failures":true}')).toBe(true);
    });
});

describe("installedFromSkillLock", () => {
    it("keeps GitHub entries and nothing else", () => {
        const lock = JSON.stringify({
            version: 3,
            skills: {
                clip: {source: "a/b", sourceType: "github"},
                mine: {source: "./local", sourceType: "local"},
                odd: {sourceType: "github"},
            },
        });
        expect(installedFromSkillLock(lock)).toEqual(installed);
    });

    it("reads a missing or broken lock as nothing", () => {
        expect(installedFromSkillLock(null)).toEqual([]);
        expect(installedFromSkillLock("{half")).toEqual([]);
    });
});

describe("installedFromReceipts", () => {
    it("reads the URL of a project receipt and of a server receipt, and skips the rest", () => {
        const text = [
            JSON.stringify({skill: "clip", atom: "0x1", url: "https://github.com/a/b?skill=clip"}),
            JSON.stringify({receipt: {url: "github.com/c/d?skill=ocr"}}),
            JSON.stringify({url: "https://example.com/x?skill=y"}),
            "{half",
        ].join("\n");
        expect(installedFromReceipts(text)).toEqual([
            {skill: "clip", source: "a/b"},
            {skill: "ocr", source: "c/d"},
        ]);
        expect(installedFromReceipts(null)).toEqual([]);
    });
});

describe("decideShare", () => {
    it("sends nothing while sharing is off", () => {
        const decided = decideShare({on: false, failures: [failure({source: "a/b"})], installed, alreadyShared: none});
        expect(decided.lines).toEqual([]);
        expect(decided.keptLocal).toEqual([{skill: "clip", why: "sharing_off"}]);
    });

    it("holds exactly a public skill, failed and a closed reason", () => {
        const {lines} = decideShare({on: true, failures: [failure({at: "SECRET-DATE"})], installed, alreadyShared: none});
        expect(lines).toEqual([{toolUrl: "https://github.com/a/b?skill=clip", outcome: "failed", reason: "missing-key"}]);
        expect(JSON.stringify(lines)).not.toContain("SECRET");
    });

    it("keeps a skill with no known source on this machine, so a private name never leaves", () => {
        const decided = decideShare({on: true, failures: [failure({skill: "my-private-skill"})], installed, alreadyShared: none});
        expect(decided.lines).toEqual([]);
        expect(decided.keptLocal).toEqual([{skill: "my-private-skill", why: "no_public_source"}]);
    });

    it("does not pick when a name has several sources", () => {
        const decided = decideShare({
            on: true,
            failures: [failure()],
            installed: [...installed, {skill: "clip", source: "x/y"}],
            alreadyShared: none,
        });
        expect(decided.lines).toEqual([]);
        expect(decided.keptLocal[0]?.why).toBe("several_sources");
    });

    it("refuses a source that is not a GitHub repository", () => {
        const decided = decideShare({on: true, failures: [failure({source: "../../etc"})], installed: [], alreadyShared: none});
        expect(decided.lines).toEqual([]);
    });

    it("carries the domain when there is one, as another sentence", () => {
        const failures = [failure(), failure({domain: "video"})];
        const {lines} = decideShare({on: true, failures, installed, alreadyShared: none});
        expect(lines).toEqual([
            {toolUrl: "https://github.com/a/b?skill=clip", outcome: "failed", reason: "missing-key"},
            {toolUrl: "https://github.com/a/b?skill=clip", outcome: "failed", domain: "video", reason: "missing-key"},
        ]);
    });

    it("reads a plugin's skill by its last part", () => {
        const {lines} = decideShare({on: true, failures: [failure({skill: "tools:clip"})], installed, alreadyShared: none});
        expect(lines[0]?.toolUrl).toBe("https://github.com/a/b?skill=clip");
    });

    it("writes one line per skill and reason, once", () => {
        const failures = [failure(), failure({at: "later"}), failure({reason: "missing-file"})];
        const first = decideShare({on: true, failures, installed, alreadyShared: none});
        expect(first.lines.map((line) => line.reason)).toEqual(["missing-key", "missing-file"]);
        const again = decideShare({on: true, failures, installed, alreadyShared: new Set(first.lines.map(sharedLineKey))});
        expect(again.lines).toEqual([]);
    });
});
