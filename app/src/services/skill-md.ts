/**
 * What a skill page reads out of a SKILL.md: its frontmatter description and version, and its `##`
 * sections with the first command each one gives.
 *
 * Pure. The text is fetched elsewhere (`use-skill-md`); this only reads it, so it is testable on a
 * string and never needs the network.
 *
 * **Not a YAML parser.** A SKILL.md's frontmatter is a handful of `key: value` lines, sometimes a
 * folded or literal block (`description: >`), sometimes `version` nested under `metadata:`. Those
 * shapes are read; anything else is left out rather than half-read, because a description that
 * came out of a misparse would be printed as the author's own sentence.
 */

export type SkillSection = {
    heading: string;
    /** The first line of the first fenced block under the heading. */
    command: string;
};

export type SkillMd = {
    description: string | null;
    version: string | null;
    sections: SkillSection[];
};

/** The page shows a skill's headings, not its manual: past this many, the SKILL.md link has them. */
const MAX_SECTIONS = 8;

export function parseSkillMd(text: string): SkillMd {
    const normalised = text.replace(/\r\n?/g, "\n");
    const {front, body} = splitFrontmatter(normalised);
    return {
        description: front.get("description") ?? null,
        version: front.get("version") ?? front.get("metadata.version") ?? null,
        // **Only sections that give a command.** The rest are `References`, `Related Skills` and
        // numbered prose, and a link standing in for a command printed bare URLs down the list
        // (user, 2026-10-29). A section with a command says what the skill does in one line.
        sections: sectionsOf(body)
            .filter((section): section is SkillSection => section.command !== null)
            .slice(0, MAX_SECTIONS),
    };
}

/** `raw.githubusercontent.com` answers CORS and resolves `HEAD` to the default branch. */
export function rawSkillUrl(repo: string, path: string): string {
    return `https://raw.githubusercontent.com/${repo}/HEAD/${path}`;
}

function splitFrontmatter(text: string): {front: Map<string, string>; body: string} {
    const front = new Map<string, string>();
    if (!text.startsWith("---\n")) return {front, body: text};
    const end = text.indexOf("\n---", 4);
    if (end === -1) return {front, body: text};
    const lines = text.slice(4, end).split("\n");
    const body = text.slice(text.indexOf("\n", end + 1) + 1);

    let parent: string | null = null;
    for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index] ?? "";
        const match = /^(\s*)([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
        if (match === null) continue;
        const indent = match[1] ?? "";
        const key = match[2] ?? "";
        const raw = (match[3] ?? "").trim();
        if (indent.length === 0) parent = raw === "" ? key : null;
        const name = indent.length > 0 && parent !== null ? `${parent}.${key}` : key;
        if (indent.length > 0 && parent === null) continue;

        if (raw === ">" || raw === ">-" || raw === "|" || raw === "|-") {
            // A block scalar: every following line indented deeper than the key belongs to it.
            const block: string[] = [];
            while (index + 1 < lines.length) {
                const next = lines[index + 1] ?? "";
                if (next.trim() !== "" && !next.startsWith(`${indent} `)) break;
                block.push(next.trim());
                index += 1;
            }
            const joined = raw.startsWith(">")
                ? block.join(" ").replace(/\s+/g, " ")
                : block.join("\n");
            if (joined.trim() !== "") front.set(name, joined.trim());
            continue;
        }
        if (raw === "") continue;
        front.set(name, unquote(raw));
    }
    return {front, body};
}

function unquote(value: string): string {
    if (value.length >= 2) {
        const first = value[0];
        const last = value[value.length - 1];
        if ((first === '"' || first === "'") && first === last) return value.slice(1, -1);
    }
    return value;
}

type Draft = {heading: string; command: string | null};

function sectionsOf(body: string): Draft[] {
    const sections: Draft[] = [];
    let current: Draft | null = null;
    let inFence = false;
    let fenceFirst: string | null = null;

    for (const line of body.split("\n")) {
        if (/^\s*(```|~~~)/.test(line)) {
            if (inFence) {
                inFence = false;
                if (current !== null && current.command === null && fenceFirst !== null) {
                    current.command = fenceFirst;
                }
                fenceFirst = null;
            } else {
                inFence = true;
            }
            continue;
        }
        if (inFence) {
            if (fenceFirst === null && line.trim() !== "") fenceFirst = line.trim();
            continue;
        }
        const heading = /^##\s+(.+?)\s*#*\s*$/.exec(line);
        if (heading !== null) {
            current = {heading: stripInline(heading[1] ?? ""), command: null};
            sections.push(current);
            continue;
        }
    }
    return sections;
}

/** `**Bold**` and `` `code` `` in a heading are markup, not words. */
function stripInline(text: string): string {
    return text.replace(/[*_`]/g, "").trim();
}

/**
 * Split after the first `. `, `! ` or `? ` that ends a sentence, so `firestore.rules` and `e.g.`
 * inside one do not cut it. `null` for the rest when there is only one sentence.
 */
export function splitFirstSentence(text: string): {head: string; rest: string | null} {
    const match = /^(.+?[.!?])\s+(?=[A-Z])/.exec(text);
    if (match === null) return {head: text, rest: null};
    const head = match[1] ?? text;
    const rest = text.slice(match[0].length).trim();
    return rest === "" ? {head: text, rest: null} : {head, rest};
}
