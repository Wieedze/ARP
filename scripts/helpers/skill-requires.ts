/**
 * What a SKILL.md says it needs, read from its own text (task 56).
 *
 * Two readings, kept apart because they are not equally sure:
 *
 * - **`cli`**: binaries the author **declares** in the frontmatter, as `metadata.requires.bins`
 *   (`larksuite/cli`'s `lark-slides`) or as `allowed-tools: Bash(<name> …)` (`101-skills`'
 *   `landing-page-design`). A fact the author wrote.
 * - **`login`**: the first body line that **mentions** a login, a key or a sign-up, quoted with
 *   its line number. A keyword match, so a reader is told "mentions", never "requires".
 *
 * No YAML library: the repo has none, and these two fields have two shapes each. Anything else in
 * the frontmatter is ignored rather than guessed at.
 */
export type SkillRequires = {
    cli: string[];
    login: {line: number; text: string} | null;
};

const LOGIN = /\b(auth login|log ?in|sign ?up|api[ _-]?key|access token)\b/i;

function frontmatter(markdown: string): {lines: string[]; bodyStart: number} {
    const lines = markdown.split("\n");
    if (lines[0]?.trim() !== "---") return {lines: [], bodyStart: 0};
    const end = lines.findIndex((line, index) => index > 0 && line.trim() === "---");
    return end === -1 ? {lines: [], bodyStart: 0} : {lines: lines.slice(1, end), bodyStart: end + 1};
}

function unquote(value: string): string {
    return value.trim().replace(/^["']|["']$/g, "");
}

/** `bins: ["a", "b"]`, or `bins:` followed by `- a` lines. */
function declaredBins(lines: readonly string[]): string[] {
    const at = lines.findIndex((line) => /^\s*bins\s*:/.test(line));
    if (at === -1) return [];
    const inline = lines[at]?.split(":").slice(1).join(":").trim() ?? "";
    if (inline.startsWith("[")) {
        return inline
            .replace(/^\[|\]$/g, "")
            .split(",")
            .map(unquote)
            .filter((name) => name.length > 0);
    }
    const out: string[] = [];
    for (const line of lines.slice(at + 1)) {
        const item = /^\s*-\s*(.+)$/.exec(line);
        if (item === null) break;
        out.push(unquote(item[1] ?? ""));
    }
    return out.filter((name) => name.length > 0);
}

/** `allowed-tools: Bash(belt *)` gives `belt`. Other tools and a bare `Bash` give nothing. */
function bashTools(lines: readonly string[]): string[] {
    const line = lines.find((candidate) => /^\s*allowed-tools\s*:/.test(candidate));
    if (line === undefined) return [];
    return [...line.matchAll(/Bash\(\s*([A-Za-z0-9._-]+)/g)]
        .map((match) => match[1] ?? "")
        .filter((name) => name.length > 0);
}

export function readRequires(markdown: string): SkillRequires {
    const {lines, bodyStart} = frontmatter(markdown);
    const cli = [...new Set([...declaredBins(lines), ...bashTools(lines)])];
    const body = markdown.split("\n");
    for (let index = bodyStart; index < body.length; index += 1) {
        const text = body[index] ?? "";
        if (LOGIN.test(text)) {
            return {cli, login: {line: index + 1, text: text.trim().slice(0, 160)}};
        }
    }
    return {cli, login: null};
}
