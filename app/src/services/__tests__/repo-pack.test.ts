import {describe, expect, it} from "vitest";

import {samePackAs} from "../repo-pack";

const descriptions: Record<string, string> = {
    "github.com/obra/superpowers?skill=brainstorming": "Think first.",
    "github.com/obra/superpowers?skill=tdd": "Test first.",
    "github.com/copy/superpowers?skill=brainstorming": "Think first.",
    "github.com/copy/superpowers?skill=tdd": "Test first.",
    "github.com/partial/pack?skill=brainstorming": "Think first.",
    "github.com/reworded/pack?skill=brainstorming": "Think first.",
    "github.com/reworded/pack?skill=tdd": "Write the test first.",
};
const labels = Object.keys(descriptions);
const descriptionOf = (label: string) => descriptions[label] ?? null;

describe("samePackAs", () => {
    it("finds a repository that publishes the same skills with the same descriptions", () => {
        expect(samePackAs("obra/superpowers", labels, descriptionOf)).toEqual(["copy/superpowers"]);
    });

    it("does not count a shared name, or a pack whose descriptions differ", () => {
        // `partial/pack` shares one name; `reworded/pack` shares both names and not the words.
        expect(samePackAs("partial/pack", labels, descriptionOf)).toEqual([]);
        expect(samePackAs("reworded/pack", labels, descriptionOf)).toEqual([]);
    });

    it("finds nothing for a repository it has no skills for", () => {
        expect(samePackAs("nobody/here", labels, descriptionOf)).toEqual([]);
    });
});
