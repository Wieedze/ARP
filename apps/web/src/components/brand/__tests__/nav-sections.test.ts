import {describe, expect, it} from "vitest";

import {SECTION_PATHS} from "../NavSplit";

/**
 * Which nav item a path belongs to.
 *
 * The rule it replaced was `pathname.startsWith(`${to}/`)` with a comment claiming
 * `/agent/8453/2340` "still lights Agents" — it lit **Your agent** (now `/register`), because that path starts with
 * `/agent/`. The comment described the intent and the code did the opposite, so nothing caught it
 * until a reader noticed the marker jumping to his own agent whenever he opened someone else's.
 *
 * It is pure string matching, so it is testable without a DOM or a router, and this is the test the
 * old rule never had.
 */
describe("nav sections", () => {
    const agents = SECTION_PATHS["/agents"]!;

    it("gives somebody else's agent to Agents", () => {
        for (const path of ["/agent/8453/6649", "/agent/13579/4", "/agent/1/0"]) {
            expect(agents(path), `${path} should light Agents`).toBe(true);
        }
    });

    it("lights Agents on the directory itself", () => {
        expect(agents("/agents")).toBe(true);
    });

    it("claims nothing that belongs elsewhere", () => {
        // `/agent` is a prefix of the directory's detail pages and of the old "Your agent" route,
        // which now redirects to `/register` (2026-10-29). Agents may reach neither.
        for (const path of [
            "/agent",
            "/agent/import",
            "/tools",
            "/register",
            "/profile",
            "/atom/0xabc",
            "/rig",
            "/",
        ]) {
            expect(agents(path), `Agents must not claim ${path}`).toBe(false);
        }
    });
});
