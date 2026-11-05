import {describe, expect, it} from "vitest";

import {classifySkill} from "../src/skill-domains.js";

describe("classifySkill", () => {
    it("places a name word only at the start of a word in the name", () => {
        expect(classifySkill("web-to-markdown", "")).toBe("document");
        expect(classifySkill("clips", "")).toBe("video");
        expect(classifySkill("ecliptic", "")).toBeNull();
    });

    it("does not take a name word from the description", () => {
        expect(classifySkill("gizmo", "outputs markdown")).toBeNull();
    });

    it("returns nothing rather than a guess when no word matches", () => {
        expect(classifySkill("gizmo", "does stuff")).toBeNull();
    });
});
