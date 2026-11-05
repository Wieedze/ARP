import {describe, expect, it} from "vitest";

import {setAsideBecause} from "../src/handlers/pulse.js";
import type {SkillPulse} from "@arp-protocol/core";

const read = (overrides: Partial<Extract<SkillPulse, {status: "read"}>> = {}): SkillPulse => ({
    source: "a/b",
    skill: "x",
    installs: 1,
    installsText: "1",
    url: null,
    status: "read",
    path: "x/SKILL.md",
    alsoAt: [],
    differsAt: [],
    contentId: "tree",
    skillMdSha: "blob",
    repository: null,
    files: 1,
    bytes: 1,
    scripts: 0,
    keys: [],
    paidWords: [],
    hosts: [],
    runsAbsentFiles: [],
    keysInScriptsItRuns: [],
    requires: {cli: [], runs: [], login: null, description: null},
    ...overrides,
});

const none = {noKeys: false, noLogin: false, noPaid: false, noScripts: false, haveCommands: null};

describe("setAsideBecause", () => {
    it("sets nothing aside without a constraint, whatever the file mentions", () => {
        expect(setAsideBecause(read({keys: ["A_API_KEY"], paidWords: ["credits"]}), none)).toEqual([]);
    });

    it("says what matched, so the reader can check the file", () => {
        const pulse = read({
            keys: ["ELEVENLABS_API_KEY"],
            paidWords: ["credits"],
            scripts: 2,
            requires: {cli: ["belt"], runs: ["ffmpeg"], login: {line: 20, text: "belt login"}, description: null},
        });
        expect(
            setAsideBecause(pulse, {noKeys: true, noLogin: true, noPaid: true, noScripts: true, haveCommands: new Set(["ffmpeg"])}),
        ).toEqual([
            "mentions ELEVENLABS_API_KEY",
            "mentions a login at line 20",
            "mentions credits",
            "ships 2 script(s)",
            "needs belt",
        ]);
    });

    it("sets aside a skill whose script needs a key its own file never names", () => {
        const pulse = read({keysInScriptsItRuns: [{file: "scripts/t.mjs", keys: ["ELEVENLABS_API_KEY"]}]});
        expect(setAsideBecause(pulse, {...none, noKeys: true})).toEqual(["runs scripts/t.mjs, which mentions ELEVENLABS_API_KEY"]);
    });

    it("does not set aside a skill it could not read, because nothing is known about it", () => {
        const pulse: SkillPulse = {source: "x", skill: "y", installs: 1, installsText: "1", url: null, status: "not_github"};
        expect(setAsideBecause(pulse, {...none, noKeys: true})).toEqual([]);
    });
});
