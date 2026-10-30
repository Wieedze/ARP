import {describe, expect, it} from "vitest";

import {parseSkillMd, rawSkillUrl, splitFirstSentence} from "../skill-md";

/** `remotion-dev/skills`' `remotion-render`, as read on 2026-10-29, cut to its shape. */
const REMOTION = `---
name: remotion-render
description: Export a Remotion video
version: 4.0.539
---

## General rendering strategy

Render a video using:

\`\`\`
npx remotion render
\`\`\`

## Transparent videos

See [Transparent videos](./transparent-videos.md) for rendering out a video with transparency.
`;

describe("parseSkillMd", () => {
    it("reads the description, the version and each section's first command", () => {
        const parsed = parseSkillMd(REMOTION);
        expect(parsed.description).toBe("Export a Remotion video");
        expect(parsed.version).toBe("4.0.539");
        // `Transparent videos` gives a link and no command, so it is not listed: a link in that
        // slot printed bare URLs down the list.
        expect(parsed.sections).toEqual([
            {heading: "General rendering strategy", command: "npx remotion render"},
        ]);
    });

    it("reads a folded description and a version nested under metadata", () => {
        const parsed = parseSkillMd(`---
name: x
description: >
  A relentless interview
  to sharpen a plan.
metadata:
  version: "1.2"
---
body`);
        expect(parsed.description).toBe("A relentless interview to sharpen a plan.");
        expect(parsed.version).toBe("1.2");
        expect(parsed.sections).toEqual([]);
    });

    it("ignores a heading inside a code block", () => {
        const parsed = parseSkillMd("## Real\n\n```md\n## Not a heading\n```\n");
        expect(parsed.sections.map((section) => section.heading)).toEqual(["Real"]);
        expect(parsed.sections[0]?.command).toBe("## Not a heading");
    });

    it("says nothing rather than guessing when there is no frontmatter", () => {
        const parsed = parseSkillMd("# Title\n\nText.");
        expect(parsed.description).toBeNull();
        expect(parsed.version).toBeNull();
    });
});

describe("rawSkillUrl", () => {
    it("reads the default branch, whatever it is called", () => {
        expect(rawSkillUrl("remotion-dev/skills", "skills/remotion-render/SKILL.md")).toBe(
            "https://raw.githubusercontent.com/remotion-dev/skills/HEAD/skills/remotion-render/SKILL.md",
        );
    });
});

describe("splitFirstSentence", () => {
    it("cuts after the first sentence, not after a dot inside a file name", () => {
        expect(
            splitFirstSentence(
                "Hardens Cloud Firestore Security Rules (firestore.rules). IMPORTANT: delegate it.",
            ),
        ).toEqual({
            head: "Hardens Cloud Firestore Security Rules (firestore.rules).",
            rest: "IMPORTANT: delegate it.",
        });
    });

    it("keeps one sentence whole, and does not cut at e.g.", () => {
        expect(splitFirstSentence("Export a Remotion video")).toEqual({
            head: "Export a Remotion video",
            rest: null,
        });
        expect(splitFirstSentence("Works offline (e.g. on a plane) too.").rest).toBeNull();
    });
});
