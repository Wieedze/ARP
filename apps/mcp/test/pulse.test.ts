import {describe, expect, it} from "vitest";

import {canSearch, searchInvocation, setAsideBecause, SKILLS_CLI, toCheck} from "../src/handlers/pulse.js";
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

describe("the search package", () => {
    it("runs pinned, with the query as one argument", () => {
        const {file, args} = searchInvocation('video; rm -rf "$HOME"', "/usr/bin", "/private/cli");
        expect(SKILLS_CLI).toMatch(/^skills@\d+\.\d+\.\d+$/);
        expect([file, ...args]).toEqual(["npx", "--yes", SKILLS_CLI, "find", 'video; rm -rf "$HOME"']);
    });

    it("hands it no secret, and not the operator's home", () => {
        const {env} = searchInvocation("x", "/usr/bin", "/private/cli");
        expect(Object.keys(env).sort()).toEqual(["DISABLE_TELEMETRY", "HOME", "NO_COLOR", "PATH"]);
        expect(env.HOME).toBe("/private/cli");
    });

    it("does not run where an agent key is kept, or where the operator turned it off", () => {
        expect(canSearch({holdsAgentKey: false, setting: undefined})).toBe(true);
        expect(canSearch({holdsAgentKey: true, setting: undefined})).toBe(false);
        expect(canSearch({holdsAgentKey: false, setting: "off"})).toBe(false);
    });
});

describe("setAsideBecause", () => {
    it("sets nothing aside without a constraint, whatever the file mentions", () => {
        expect(setAsideBecause(read({keys: ["A_API_KEY"], paidWords: ["credits"]}), none)).toEqual([]);
    });

    it("sets aside on what the file states, and says what matched", () => {
        const pulse = read({
            keys: ["ELEVENLABS_API_KEY"],
            scripts: 2,
            runsAbsentFiles: ["scripts/t.py"],
            requires: {cli: ["belt"], runs: [], login: null, description: null},
        });
        expect(
            setAsideBecause(pulse, {noKeys: true, noLogin: false, noPaid: false, noScripts: true, haveCommands: new Set(["ffmpeg"])}),
        ).toEqual([
            "mentions ELEVENLABS_API_KEY",
            "ships 2 script(s)",
            "declares belt",
            "runs scripts/t.py, which its repository does not hold",
        ]);
    });

    it("only flags a word match, so a shell variable named end cannot set a skill aside", () => {
        // The shape of agenticluke/claude-skill-video-editing-plus, set aside on 2026-11-05 over `end`.
        const pulse = read({
            paidWords: ["credits"],
            requires: {cli: [], runs: ["end"], login: {line: 20, text: "login page"}, description: null},
        });
        const constraints = {noKeys: true, noLogin: true, noPaid: true, noScripts: false, haveCommands: new Set(["ffmpeg"])};
        expect(setAsideBecause(pulse, constraints)).toEqual([]);
        expect(toCheck(pulse, constraints)).toEqual([
            "login, line 20: login page",
            "paid words: credits",
            "commands in its instructions: end",
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
