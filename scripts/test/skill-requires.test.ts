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
            runs: [],
            login: {line: 12, text: "Run `lark-cli auth login` first."},
            description: null,
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
        expect(readRequires("---\nname: pdf\n---\n\nFill the form.\n")).toEqual({
            cli: [],
            runs: [],
            login: null,
            description: null,
        });
        // A bare `Bash` names no binary.
        expect(readRequires("---\nallowed-tools: Bash, Read\n---\n").cli).toEqual([]);
    });

    it("does not read `logging` or `blogin` as a login", () => {
        expect(readRequires("---\nname: x\n---\nSet up logging.\nblogin\n").login).toBeNull();
    });

    it("reads a command only the instructions name, as web-to-markdown does", () => {
        const markdown =
            "---\nname: web-to-markdown\n---\n" +
            "3) Ensure it is installed:\n   - Run: `command -v web2md`\n" +
            "   - Then `web2md '<url>' --out ./page.md`, and check with `ls -la <path>`.\n";
        expect(readRequires(markdown).runs).toEqual(["web2md"]);
    });

    it("reads shell fences and install lines, not other code or the common commands", () => {
        const markdown = [
            "---",
            "name: x",
            "---",
            "Install: `npm install -g @scope/tool`, and `render --fast` is a subcommand.",
            "```bash",
            "cd out && ffmpeg -i a.mp4 | jq .",
            "```",
            "```python",
            "print('not shell')",
            "```",
        ].join("\n");
        expect(readRequires(markdown).runs).toEqual(["@scope/tool", "ffmpeg", "jq"]);
    });

    it("does not read a heredoc, an open string or a continued line as a command", () => {
        const markdown = [
            "---",
            "name: x",
            "---",
            "```sh",
            "cat > a.js <<EOF",
            "const a = 1",
            "EOF",
            'tool --prompt "first line',
            'change the second line"',
            "tool --long \\",
            "  argument",
            "```",
        ].join("\n");
        expect(readRequires(markdown).runs).toEqual(["tool"]);
    });

    it("does not name what a skill declares twice", () => {
        const markdown = "---\nallowed-tools: Bash(belt *)\n---\n```bash\nbelt login\n```\n";
        expect(readRequires(markdown).runs).toEqual([]);
    });

    it("reads one name on a requires line", () => {
        expect(readRequires("---\nmetadata:\n  requires: clueso-mcp\n---\n").cli).toEqual(["clueso-mcp"]);
    });

    it("reads a description written inline, quoted or as a block", () => {
        const of = (line: string) => readRequires(`---\n${line}\n---\n`).description;
        expect(of("description: Fills forms")).toBe("Fills forms");
        expect(of('description: "Says: hello"')).toBe("Says: hello");
        expect(of("description: >-\n  Two\n  lines")).toBe("Two lines");
    });
});
