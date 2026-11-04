/**
 * What a SKILL.md says it needs, read from its own text (task 56).
 *
 * Two readings, kept apart because they are not equally sure:
 *
 * - **`cli`**: binaries the author **declares** in the frontmatter, as `metadata.requires.bins`
 *   (`larksuite/cli`'s `lark-slides`) or as `allowed-tools: Bash(<name> …)` (`101-skills`'
 *   `landing-page-design`). A fact the author wrote.
 * - **`runs`**: commands the file's **instructions** run that are not on every machine: `web2md` in
 *   `softaworks/agent-toolkit`'s `web-to-markdown`, which declares nothing in its frontmatter and
 *   needs that CLI and a Chrome. Read from shell fences, and from `command -v <name>` and install
 *   lines in inline code; other inline code is too often prose or a subcommand (`auth`, `render`,
 *   `film` when it was counted). A reading of the text, so a reader is told "runs", never that it
 *   is missing or required.
 * - **`login`**: the first body line that **mentions** a login, a key or a sign-up, quoted with
 *   its line number. A keyword match, so a reader is told "mentions", never "requires".
 * - **`description`**: the frontmatter's, for a skill listed after skills.sh was read (ADR `0132`).
 *
 * No YAML library: the repo has none, and these two fields have two shapes each. Anything else in
 * the frontmatter is ignored rather than guessed at.
 */
export type SkillRequires = {
    cli: string[];
    runs: string[];
    login: {line: number; text: string} | null;
    description: string | null;
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

/** `description: text`, quoted or not, or `description: >-` followed by indented lines. */
function declaredDescription(lines: readonly string[]): string | null {
    const at = lines.findIndex((line) => /^description\s*:/.test(line));
    if (at === -1) return null;
    const inline = lines[at]?.split(":").slice(1).join(":").trim() ?? "";
    if (inline !== "" && !/^[>|][-+]?$/.test(inline)) return unquote(inline) || null;
    const block: string[] = [];
    for (const line of lines.slice(at + 1)) {
        if (!/^\s+\S/.test(line)) break;
        block.push(line.trim());
    }
    return block.length === 0 ? null : block.join(" ");
}

/** On every machine, or a language's own runner: naming these tells a reader nothing. */
const COMMON = new Set(
    (
        "awk bash break bun case cat cd chmod command continue cp curl cut date diff do done echo else env " +
        "esac exit export false fi find for function git grep head if kill ln local ls mkdir mv node npm npx open pip pip3 pnpm printf pwd " +
        "python python3 read return rm sed set sh shift sleep sort source sudo tail tar tee test then time " +
        "touch tr true uniq unset unzip wait wc wget which while xargs yarn zip"
    ).split(" "),
);

const INSTALL =
    /\b(?:npm\s+(?:i|install)\s+(?:-g|--global)|pnpm\s+add\s+-g|yarn\s+global\s+add|brew\s+install|pipx\s+install|pip3?\s+install|cargo\s+install)\s+([@a-z0-9][@\w./-]*)/i;
const PROBE = /\b(?:command\s+-v|which)\s+([a-z][\w-]*)/i;
const COMMAND = /^[a-z][a-z0-9_-]*$/;

/** What one line of shell runs. `explicitOnly` keeps a probe or an install line and nothing else. */
function commandsIn(shell: string, explicitOnly: boolean): string[] {
    const found: string[] = [];
    for (const segment of shell.split(/&&|\|\||[|;]/)) {
        const line = segment.trim().replace(/^\$\s+/, "");
        if (line === "" || line.startsWith("#")) continue;
        const named = INSTALL.exec(line)?.[1] ?? PROBE.exec(line)?.[1];
        if (named !== undefined) {
            found.push(named);
            continue;
        }
        if (explicitOnly) continue;
        const words = line.split(/\s+/).filter((word) => !/^[A-Za-z_][A-Za-z0-9_]*=/.test(word));
        const first = words[0] === "sudo" ? words[1] : words[0];
        if (first === undefined || !COMMAND.test(first)) continue;
        found.push(first);
    }
    return found;
}

const SHELL_FENCE = /^(sh|bash|shell|zsh|console|terminal)$/i;

/** Inside a shell fence, what is only text: a heredoc's body, or a quoted string left open by a line. */
function shellLinesRun(lines: readonly string[]): string[] {
    const run: string[] = [];
    let heredocEnd: string | null = null;
    let quote: string | null = null;
    let continued = false;
    for (const line of lines) {
        if (heredocEnd !== null) {
            if (line.trim() === heredocEnd) heredocEnd = null;
            continue;
        }
        // The line after a trailing backslash continues a command, so its first word is an argument.
        if (quote === null && !continued) run.push(line);
        continued = line.trimEnd().endsWith("\\");
        heredocEnd = /<<-?\s*['"]?([A-Za-z_]+)/.exec(line)?.[1] ?? null;
        for (const char of line) {
            if (quote === null && (char === '"' || char === "'")) quote = char;
            else if (char === quote) quote = null;
        }
    }
    return run;
}

function commandsRun(body: readonly string[], declared: readonly string[]): string[] {
    const found: string[] = [];
    let fence: "shell" | "other" | null = null;
    let fenced: string[] = [];
    for (const line of body) {
        const marker = /^\s*(?:```|~~~)\s*([\w-]*)/.exec(line);
        if (marker !== null) {
            if (fence === "shell") {
                for (const run of shellLinesRun(fenced)) found.push(...commandsIn(run, false));
            }
            fenced = [];
            fence = fence !== null ? null : SHELL_FENCE.test(marker[1] ?? "") ? "shell" : "other";
            continue;
        }
        if (fence !== null) {
            fenced.push(line);
            continue;
        }
        for (const inline of line.matchAll(/`([^`]+)`/g)) found.push(...commandsIn(inline[1] ?? "", true));
    }
    return [...new Set(found)].filter((name) => !COMMON.has(name) && !declared.includes(name));
}

export function readRequires(markdown: string): SkillRequires {
    const {lines, bodyStart} = frontmatter(markdown);
    const cli = [...new Set([...declaredBins(lines), ...bashTools(lines)])];
    const description = declaredDescription(lines);
    const body = markdown.split("\n");
    const runs = commandsRun(body.slice(bodyStart), cli);
    for (let index = bodyStart; index < body.length; index += 1) {
        const text = body[index] ?? "";
        if (LOGIN.test(text)) {
            return {cli, runs, login: {line: index + 1, text: text.trim().slice(0, 160)}, description};
        }
    }
    return {cli, runs, login: null, description};
}
