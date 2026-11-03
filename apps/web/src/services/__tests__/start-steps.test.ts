import type {ActivityEvent} from "@arp-protocol/core";
import {describe, expect, it} from "vitest";

import {stepsFor} from "../start-steps";

const SKILL = `0x${"c".repeat(64)}` as const;

const receipt: ActivityEvent = {
    source: "receipt",
    at: "2026-11-02T22:36:00Z",
    name: "youtube-thumbnail-design",
    url: null,
    atom: SKILL,
    signer: null,
    to: null,
};
const invoked: ActivityEvent = {
    source: "session",
    at: "2026-11-02T22:37:00Z",
    session: "s",
    call: "c",
    kind: "skill",
    name: "youtube-thumbnail-design",
    ref: SKILL,
    outcome: "ok",
    ms: 4,
};
const declaration = (status: "dry" | "success" | "reverted"): ActivityEvent => ({
    source: "sent",
    at: "2026-11-02T22:38:00Z",
    chainId: 13579,
    status,
    hash: null,
    signer: null,
    to: null,
    value: "0",
    gasUsed: null,
    kind: "create-triple",
    why: "declare",
    decoded: {fn: "createTriples", subjects: [SKILL], predicates: [SKILL], objects: [SKILL]},
});

const done = (steps: ReturnType<typeof stepsFor>) =>
    Object.fromEntries(steps.map((step) => [step.id, step.done]));

describe("start steps", () => {
    it("ticks nothing before the agent is connected", () => {
        expect(done(stepsFor("claude", {feed: "off", events: []}))).toEqual({
            connect: false,
            ask: false,
            declare: false,
        });
    });

    it("ticks each Claude step from what the feed recorded", () => {
        const steps = stepsFor("claude", {
            feed: "live",
            events: [receipt, declaration("success")],
        });
        expect(done(steps)).toEqual({connect: true, ask: true, declare: true});
    });

    it("does not count a dry run or a reverted call as a declaration", () => {
        for (const status of ["dry", "reverted"] as const) {
            const steps = stepsFor("claude", {feed: "live", events: [declaration(status)]});
            expect(done(steps).declare).toBe(false);
        }
    });

    it("ticks the builder's run from the hook, and never claims `arp status` was run", () => {
        const steps = stepsFor("agent", {feed: "live", events: [invoked]});
        expect(done(steps)).toEqual({init: true, run: true, status: null});
    });

    it("shows the tool path's steps without a tick it cannot observe", () => {
        expect(done(stepsFor("tool", {feed: "off", events: []}))).toEqual({
            find: null,
            add: null,
        });
    });
});
