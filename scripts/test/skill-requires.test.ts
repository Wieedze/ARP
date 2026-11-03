import {describe, expect, it} from "bun:test";

import {readRequires} from "../helpers/skill-requires.ts";

// The two shapes task 54's pre-pilot reading found, trimmed to what the reader looks at.
const LARK = `---
name: lark-slides
version: 1.0.0
metadata:
  requires:
    bins: ["lark-cli"]
  cliHelp: "lark-cli slides --help"
---

# slides (v1)

Run \`lark-cli auth login\` first.
`;

const BELT = `---
name: landing-page-design
allowed-tools: Bash(belt *)
---

> **Install the belt CLI skill:** \`npx skills add belt-sh/cli\`

\`\`\`bash
belt login
\`\`\`
`;

describe("what a SKILL.md says it needs", () => {
    it("reads a declared bin list and the first login it mentions", () => {
        expect(readRequires(LARK)).toEqual({
            cli: ["lark-cli"],
            login: {line: 12, text: "Run `lark-cli auth login` first."},
        });
    });

    it("reads a Bash tool from allowed-tools", () => {
        const requires = readRequires(BELT);
        expect(requires.cli).toEqual(["belt"]);
        expect(requires.login).toEqual({line: 9, text: "belt login"});
    });

    it("reads a bin list written as YAML items", () => {
        const markdown = "---\nmetadata:\n  requires:\n    bins:\n      - ffmpeg\n      - \"yt-dlp\"\n---\nbody\n";
        expect(readRequires(markdown).cli).toEqual(["ffmpeg", "yt-dlp"]);
    });

    it("claims nothing for a skill that declares nothing and mentions no login", () => {
        expect(readRequires("---\nname: pdf\n---\n\nFill the form.\n")).toEqual({cli: [], login: null});
        // A bare `Bash` names no binary.
        expect(readRequires("---\nallowed-tools: Bash, Read\n---\n").cli).toEqual([]);
    });

    it("does not read `logging` or `blogin` as a login", () => {
        expect(readRequires("---\nname: x\n---\nSet up logging.\nblogin\n").login).toBeNull();
    });
});
