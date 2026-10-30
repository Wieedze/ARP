import {describe, expect, it} from "vitest";

import {
    InvalidToolUrlError,
    isToolUrl,
    normaliseToolUrl,
    toolAtomUri,
    toolThing,
    toolThingDocument,
} from "../src/declare/index.js";

describe("normaliseToolUrl", () => {
    /** Each row is one spelling a tool gets pasted as. All of them are one atom. */
    const SPELLINGS: [string, string][] = [
        ["https://github.com/crytic/slither", "https://github.com/crytic/slither"],
        ["  https://github.com/crytic/slither  ", "https://github.com/crytic/slither"],
        ["github.com/crytic/slither", "https://github.com/crytic/slither"],
        ["http://github.com/crytic/slither", "https://github.com/crytic/slither"],
        ["https://www.github.com/crytic/slither", "https://github.com/crytic/slither"],
        ["https://github.com/crytic/slither/", "https://github.com/crytic/slither"],
        ["https://github.com/crytic/slither///", "https://github.com/crytic/slither"],
        ["https://github.com/crytic/slither#readme", "https://github.com/crytic/slither"],
        ["HTTPS://GitHub.COM/crytic/slither", "https://github.com/crytic/slither"],
        ["https://github.com:443/crytic/slither", "https://github.com/crytic/slither"],
        ["http://github.com:80/crytic/slither", "https://github.com/crytic/slither"],
    ];

    it.each(SPELLINGS)("%s -> %s", (input, expected) => {
        expect(normaliseToolUrl(input)).toBe(expected);
    });

    it("collapses every spelling to the same atom id", () => {
        const ids = new Set(SPELLINGS.map(([input]) => toolAtomUri(input)));
        expect(ids.size).toBe(1);
    });

    it("sorts query keys, because order is not identity", () => {
        expect(normaliseToolUrl("https://x.org/a?b=2&a=1")).toBe("https://x.org/a?a=1&b=2");
        expect(toolAtomUri("https://x.org/a?b=2&a=1")).toBe(toolAtomUri("https://x.org/a?a=1&b=2"));
    });

    it("keeps the path's case", () => {
        // Most servers are case-sensitive there. GitHub's leniency is a choice of GitHub's, not a
        // property of URLs, so it is not generalised from.
        expect(normaliseToolUrl("https://github.com/Crytic/Slither")).toBe(
            "https://github.com/Crytic/Slither",
        );
        expect(toolAtomUri("https://github.com/Crytic/Slither")).not.toBe(
            toolAtomUri("https://github.com/crytic/slither"),
        );
    });

    it("keeps a non-default port", () => {
        expect(normaliseToolUrl("http://localhost:3100/task")).toBe("https://localhost:3100/task");
    });

    it("rejects what it cannot normalise", () => {
        for (const bad of ["", "   ", "ipfs://bafkrei", "did:web:example.org", "npm:slither"]) {
            expect(() => normaliseToolUrl(bad)).toThrow(InvalidToolUrlError);
            expect(isToolUrl(bad)).toBe(false);
        }
    });

    it("accepts what it can", () => {
        expect(isToolUrl("https://github.com")).toBe(true);
        expect(isToolUrl("github.com")).toBe(true);
    });
});

describe("toolThing", () => {
    it("derives every field from the URL, so nobody can pick a name", () => {
        expect(toolThing("https://www.github.com/crytic/slither/")).toEqual({
            name: "github.com/crytic/slither",
            description:
                "A tool identified by its URL, so every declaration of its use lands on one atom.",
            image: "",
            url: "https://github.com/crytic/slither",
        });
    });

    it("pins keys in sorted order with no whitespace", () => {
        expect(toolThingDocument("github.com/crytic/slither")).toBe(
            '{"@context":"https://schema.org","@type":"Thing","description":"A tool identified by ' +
                'its URL, so every declaration of its use lands on one atom.","image":"","name":' +
                '"github.com/crytic/slither","url":"https://github.com/crytic/slither"}',
        );
    });

    /**
     * The recipe is frozen, not configurable.
     *
     * One differing character — a word in the description, an unsorted key, a stripped `www.` that
     * stops being stripped — yields a different CID, a different atom, and a permanently split
     * market, because Intuition has no deletion. This expectation is the lock. Recomputed
     * independently in Python (sha256 of the document, CIDv1 raw/sha2-256 header, base32) on
     * 2026-10-21 and it matched.
     */
    it("locks the derived atom URI for a known tool", () => {
        expect(toolAtomUri("https://github.com/crytic/slither")).toBe(
            "ipfs://bafkreidf2beugrdbzvidlwibi46fhyanrh7v3noaucjahsllu2xjqtas44",
        );
    });
});
