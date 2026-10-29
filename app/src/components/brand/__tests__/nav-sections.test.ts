import {describe, expect, it} from "vitest";

import {SECTION_PATHS} from "../NavSplit";

/**
 * Which nav item a path belongs to.
 *
 * The rule it replaced was `pathname.startsWith(`${to}/`)` with a comment claiming
 * `/agent/8453/2340` "still lights Agents" — it lit **Your agent**, because that path starts with
 * `/agent/`. The comment described the intent and the code did the opposite, so nothing caught it
 * until a reader noticed the marker jumping to his own agent whenever he opened someone else's.
 *
 * It is pure string matching, so it is testable without a DOM or a router, and this is the test the
 * old rule never had.
 */
describe("nav sections", () => {
    const agents = SECTION_PATHS["/agents"]!;
    const yourAgent = SECTION_PATHS["/agent"]!;

    it("gives somebody else's agent to Agents, not to Your agent", () => {
        for (const path of ["/agent/8453/6649", "/agent/13579/4", "/agent/1/0"]) {
            expect(agents(path), `${path} should light Agents`).toBe(true);
            expect(yourAgent(path), `${path} must not light Your agent`).toBe(false);
        }
    });

    it("keeps the operator's own pages on Your agent", () => {
        for (const path of ["/agent", "/agent/import"]) {
            expect(yourAgent(path), `${path} should light Your agent`).toBe(true);
            expect(agents(path), `${path} must not light Agents`).toBe(false);
        }
    });

    it("lights Agents on the directory itself", () => {
        expect(agents("/agents")).toBe(true);
        expect(yourAgent("/agents")).toBe(false);
    });

    it("claims nothing that belongs elsewhere", () => {
        // `/agents` is a prefix of nothing here, but `/agent` is a prefix of both — which is the
        // whole trap. Neither may reach into another section.
        for (const path of ["/tools", "/register", "/profile", "/atom/0xabc", "/rig", "/"]) {
            expect(agents(path), `Agents must not claim ${path}`).toBe(false);
            expect(yourAgent(path), `Your agent must not claim ${path}`).toBe(false);
        }
    });
});
