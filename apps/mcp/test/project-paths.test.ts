import {describe, expect, it} from "vitest";

import {inProject} from "../src/config.js";

describe("a path in the project", () => {
    it("lands in the project when the server was started elsewhere", () => {
        expect(inProject(".claude/skills", "/work/app")).toBe("/work/app/.claude/skills");
    });

    it("keeps a path that is already absolute", () => {
        expect(inProject("/var/log/session.jsonl", "/work/app")).toBe("/var/log/session.jsonl");
    });
});
