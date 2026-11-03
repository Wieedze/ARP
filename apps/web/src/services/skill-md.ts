/**
 * What a skill page reads out of a SKILL.md: its frontmatter description and version.
 *
 * `parseSkillMd` is pure and testable on a string; `fetchSkillMd` is the one network read, bounded
 * in time and in bytes because the file is whatever the repository's author committed.
 *
 * **Not a YAML parser.** A SKILL.md's frontmatter is a handful of `key: value` lines, sometimes a
 * folded or literal block (`description: >`), sometimes `version` nested under `metadata:`. Those
 * shapes are read; anything else is left out rather than half-read, because a description that
 * came out of a misparse would be printed as the author's own sentence.
 */

export type SkillMd = {
    description: string | null;
    version: string | null;
};

export function parseSkillMd(text: string): SkillMd {
    const normalised = text.replace(/\r\n?/g, "\n");
    const {front} = splitFrontmatter(normalised);
    return {
        description: front.get("description") ?? null,
        version: front.get("version") ?? front.get("metadata.version") ?? null,
    };
}

/** A SKILL.md is a few kilobytes; anything past this is not one worth reading in a browser. */
export const SKILL_MD_MAX_BYTES = 256 * 1024;
export const SKILL_MD_TIMEOUT_MS = 10_000;

/** Fetch and parse one SKILL.md. Throws on a non-2xx answer, a timeout or an oversized body. */
export async function fetchSkillMd(
    url: string,
    options: {fetchImpl?: typeof fetch; timeoutMs?: number; maxBytes?: number} = {},
): Promise<SkillMd> {
    const fetchImpl = options.fetchImpl ?? fetch;
    const maxBytes = options.maxBytes ?? SKILL_MD_MAX_BYTES;
    const response = await fetchImpl(url, {
        signal: AbortSignal.timeout(options.timeoutMs ?? SKILL_MD_TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`${response.status} from ${url}`);
    return parseSkillMd(await readCapped(response, maxBytes, url));
}

async function readCapped(response: Response, maxBytes: number, url: string): Promise<string> {
    const declared = Number(response.headers.get("content-length"));
    if (Number.isFinite(declared) && declared > maxBytes) {
        throw new Error(`${url} is ${declared} bytes, over the ${maxBytes}-byte limit`);
    }
    if (response.body === null) return "";
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let text = "";
    let total = 0;
    let chunk = await reader.read();
    while (!chunk.done) {
        total += chunk.value.byteLength;
        if (total > maxBytes) {
            await reader.cancel();
            throw new Error(`${url} is over the ${maxBytes}-byte limit`);
        }
        text += decoder.decode(chunk.value, {stream: true});
        chunk = await reader.read();
    }
    return text + decoder.decode();
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
