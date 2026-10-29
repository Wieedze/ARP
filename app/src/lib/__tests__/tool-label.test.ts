import {describe, expect, it} from "vitest";

import {browseUrlOf, compactNameOf, parseToolLabel, primaryNameOf, sourceOf} from "../tool-label";

describe("parseToolLabel", () => {
    it("splits a skill into owner, repo and skill", () => {
        const parsed = parseToolLabel("github.com/prime-skills/runcomfy-agent-skills?skill=nano-banana");
        expect(parsed).toEqual({
            kind: "skill",
            owner: "prime-skills",
            repo: "runcomfy-agent-skills",
            skill: "nano-banana",
            host: "github.com",
        });
    });

    it("reads a repository with no skill", () => {
        expect(parseToolLabel("github.com/stripe/agent-toolkit")).toEqual({
            kind: "repo",
            owner: "stripe",
            repo: "agent-toolkit",
            host: "github.com",
        });
    });

    it("decodes a skill name the writer encoded", () => {
        // `encodeURIComponent` ran at write time, so the reader has to undo exactly that.
        const parsed = parseToolLabel("github.com/x/y?skill=a%2Fb");
        expect(parsed.kind === "skill" && parsed.skill).toBe("a/b");
    });

    it("does not mistake a deep path for a repository", () => {
        // `/tree/main/skills/x` has an owner and a repo in its first two segments, and is not one.
        expect(parseToolLabel("github.com/x/y/tree/main/skills/z").kind).toBe("other");
    });

    it("falls back rather than throwing on anything it cannot parse", () => {
        expect(parseToolLabel("not a url at all").kind).toBe("other");
        expect(parseToolLabel(null)).toEqual({kind: "other", text: ""});
        expect(parseToolLabel("github.com").kind).toBe("other");
    });
});

describe("what a row shows", () => {
    it("leads with the skill and names its repository underneath", () => {
        const parsed = parseToolLabel("github.com/obra/superpowers?skill=brainstorming");
        expect(primaryNameOf(parsed)).toBe("brainstorming");
        expect(sourceOf(parsed)).toBe("obra/superpowers");
    });

    it("gives a repository no second line rather than one that repeats the first", () => {
        const parsed = parseToolLabel("github.com/stripe/agent-toolkit");
        expect(sourceOf(parsed)).toBeNull();
    });

    it("keeps the host on a repository and drops it from a skill", () => {
        // A repository's line is the only line it gets, so there is room — and without the host
        // `github.com/x/y` and `gitlab.com/x/y` would render identically, a false merge on screen
        // of two atoms the chain keeps apart. A skill's line has to hold a name a person retypes.
        expect(primaryNameOf(parseToolLabel("github.com/stripe/agent-toolkit"))).toBe(
            "github.com/stripe/agent-toolkit",
        );
        expect(primaryNameOf(parseToolLabel("github.com/x/y?skill=nano-banana"))).toBe("nano-banana");
    });

    it("never prettifies a name somebody has to retype", () => {
        // `nano-banana` is an argument to `npx skills add … --skill`, so "Nano Banana" would be a
        // name that does not work.
        const parsed = parseToolLabel("github.com/x/y?skill=nano-banana");
        expect(primaryNameOf(parsed)).toBe("nano-banana");
    });
});

describe("browseUrlOf", () => {
    it("links to the repository, dropping ARP's own identifier", () => {
        // `?skill=` is how ARP keeps one atom per skill; GitHub does nothing with it, and linking
        // to a path we cannot resolve would 404.
        expect(browseUrlOf(parseToolLabel("github.com/obra/superpowers?skill=brainstorming"))).toBe(
            "https://github.com/obra/superpowers",
        );
    });

    it("has nowhere to send a label it could not parse", () => {
        expect(browseUrlOf(parseToolLabel("not a url"))).toBeNull();
    });
});

describe("compactNameOf", () => {
    it("drops the host from a repository, which primaryNameOf keeps", () => {
        // A list row is the only line a repository gets, so it keeps the host and `github.com/x/y`
        // stays distinct from `gitlab.com/x/y`. A card shows one subject at a time and has no such
        // ambiguity to resolve — there the host is the same six characters on every one.
        const parsed = parseToolLabel("github.com/stripe/agent-toolkit");
        expect(primaryNameOf(parsed)).toBe("github.com/stripe/agent-toolkit");
        expect(compactNameOf(parsed)).toBe("stripe/agent-toolkit");
    });

    it("changes nothing for a skill, which never carried the host", () => {
        const parsed = parseToolLabel("github.com/x/y?skill=nano-banana");
        expect(compactNameOf(parsed)).toBe("nano-banana");
    });

    it("leaves a label it could not parse exactly as it found it", () => {
        expect(compactNameOf(parseToolLabel("Agent 13579:3"))).toBe("Agent 13579:3");
    });
});
