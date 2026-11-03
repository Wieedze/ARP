/**
 * The facts a person reads before a skill is installed (task 61, deliverable C).
 *
 * Every line is something anyone can re-derive from the files and the catalogue: which repository
 * and commit, which files and how large, which ones carry a shebang, and how many lines match each
 * of a fixed list of patterns, **printed with the pattern and the lines themselves**. Nothing here
 * says whether a skill is safe, suspicious, maintained or popular — that would be a score (ADR
 * `0046`), and a skill this did not flag would become ARP's miss. Where a fact ends and a verdict
 * begins is ADR `0124`.
 *
 * Pure: the caller supplies the files, already checked against their receipt.
 */

/** One file of a skill's directory, its path relative to that directory. */
export type ReviewFile = {path: string; bytes: Uint8Array};

/** A figure somebody else published, with where and when it was read. */
export type ThirdPartyFigure = {label: string; value: string; source: string; readOn: string};

export type SkillReviewInput = {
    repo: string;
    skill: string;
    /** The skill's directory in the repository. */
    path: string;
    /** The pinned commit the files were read at. */
    commit: string;
    /** GitHub's committer date for that commit, when known. */
    committedAt?: string | null;
    files: readonly ReviewFile[];
    thirdParty?: readonly ThirdPartyFigure[];
};

/**
 * The fixed list. A name says what the regular expression matches, never what it means: "calls the
 * network" is a fact about a line, "exfiltrates" would be a verdict about an author.
 */
export const REVIEW_PATTERNS: readonly {name: string; short: string; pattern: RegExp}[] = [
    {
        name: "lines that call the network",
        short: "network",
        pattern: /\b(curl|wget|Invoke-WebRequest|Invoke-RestMethod)\b/,
    },
    {
        name: "lines that pipe into a shell or an interpreter",
        short: "pipe to a shell",
        pattern: /\|\s*(sudo\s+)?(sh|bash|zsh|python3?|node)\b/,
    },
    {
        name: "lines that decode base64",
        short: "base64 decode",
        pattern: /\bbase64\s+(-d|--decode)\b|\batob\(/,
    },
    {
        name: "lines that delete recursively",
        short: "recursive delete",
        pattern: /\brm\s+-[a-zA-Z]*(rf|fr)[a-zA-Z]*\b/,
    },
    {
        name: "lines that name a credentials path",
        short: "credentials path",
        pattern: /~\/\.ssh|\.ssh\/|\.aws\/|\.npmrc|\.netrc|\.config\/gh\b/,
    },
    {name: "lines that run sudo", short: "sudo", pattern: /\bsudo\b/},
];

/** A line kept for the page: its file, its 1-based number, and its text, trimmed. */
export type MatchedLine = {file: string; line: number; text: string};

export type SkillReview = {
    repo: string;
    skill: string;
    path: string;
    commit: string;
    committedAt: string | null;
    files: readonly {path: string; bytes: number; binary: boolean}[];
    totalBytes: number;
    /** Files whose first line starts with `#!`. */
    shebang: readonly string[];
    patterns: readonly {
        name: string;
        short: string;
        pattern: string;
        matches: readonly MatchedLine[];
    }[];
    thirdParty: readonly ThirdPartyFigure[];
};

const LINE_CAP = 160;

function isBinary(bytes: Uint8Array): boolean {
    return bytes.subarray(0, 8192).includes(0);
}

/** The facts, computed from the files. Sorted by path, so the same files give the same page. */
export function reviewSkill(input: SkillReviewInput): SkillReview {
    const files = [...input.files].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
    const decoder = new TextDecoder("utf-8", {fatal: false});
    const texts = files.map((file) => ({
        path: file.path,
        binary: isBinary(file.bytes),
        lines: isBinary(file.bytes) ? [] : decoder.decode(file.bytes).split(/\r?\n/),
    }));
    return {
        repo: input.repo,
        skill: input.skill,
        path: input.path,
        commit: input.commit,
        committedAt: input.committedAt ?? null,
        files: files.map((file, i) => ({
            path: file.path,
            bytes: file.bytes.byteLength,
            binary: texts[i]?.binary ?? false,
        })),
        totalBytes: files.reduce((sum, file) => sum + file.bytes.byteLength, 0),
        shebang: texts.filter((t) => t.lines[0]?.startsWith("#!") === true).map((t) => t.path),
        patterns: REVIEW_PATTERNS.map(({name, short, pattern}) => ({
            name,
            short,
            pattern: pattern.source,
            matches: texts.flatMap((t) =>
                t.lines.flatMap((text, i) =>
                    pattern.test(text)
                        ? [{file: t.path, line: i + 1, text: text.trim().slice(0, LINE_CAP)}]
                        : [],
                ),
            ),
        })),
        thirdParty: input.thirdParty ?? [],
    };
}

/**
 * The page as plain text, for a terminal or an MCP elicitation. At most `maxLines` matching lines
 * per pattern are printed; the count is always the full count.
 */
export function renderSkillReview(review: SkillReview, maxLines = 5): string {
    const out: string[] = [];
    out.push(`Install ${review.skill} from ${review.repo}?`);
    out.push("");
    out.push(`repository  github.com/${review.repo}`);
    out.push(
        `commit      ${review.commit}${review.committedAt === null ? "" : `  (${review.committedAt})`}`,
    );
    out.push(`directory   ${review.path}`);
    // Where the person reads every file before answering: the same commit the bytes come from.
    if (/^[0-9a-f]{40}$/.test(review.commit)) {
        out.push(
            `read it     https://github.com/${review.repo}/tree/${review.commit}/${review.path}`,
        );
    }
    out.push(`files       ${review.files.length}, ${review.totalBytes} bytes`);
    for (const file of review.files) {
        out.push(`  ${file.path}  ${file.bytes} bytes${file.binary ? ", binary" : ""}`);
    }
    out.push(`shebang     ${review.shebang.length === 0 ? "none" : review.shebang.join(", ")}`);
    out.push("");
    for (const p of review.patterns) {
        out.push(`${p.matches.length} ${p.name}  /${p.pattern}/`);
        for (const m of p.matches.slice(0, maxLines)) out.push(`  ${m.file}:${m.line}  ${m.text}`);
        if (p.matches.length > maxLines) out.push(`  … ${p.matches.length - maxLines} more`);
    }
    if (review.thirdParty.length > 0) {
        out.push("");
        for (const f of review.thirdParty)
            out.push(`${f.label}  ${f.value}  (${f.source}, read ${f.readOn})`);
    }
    out.push("");
    out.push(
        "These are counts and lines, not a judgement. Nothing is installed unless you accept.",
    );
    return out.join("\n");
}

/** What a person sees in the install question: short, because a terminal dialog has few lines. */
export type SkillPrompt = {
    /** The question's text: the skill, the link to read it at the commit, and the counts. */
    message: string;
    /** The checkbox's label: what ticking it does. */
    confirm: string;
    /** Under the checkbox. */
    confirmHelp: string;
};

function sizeOf(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function kindOf(path: string): string {
    const name = path.slice(path.lastIndexOf("/") + 1);
    const dot = name.lastIndexOf(".");
    return dot <= 0 ? "no extension" : name.slice(dot);
}

/**
 * The install question, sized for Claude Code's terminal dialog: it prints the message line by
 * line, then each field's title and description (measured 2026-11-03, 2.1.317), and a 75-line page
 * did not fit. The full file list is behind the link, at the same commit the bytes come from.
 */
export function renderSkillPrompt(
    review: SkillReview,
    installPath: string,
    maxLines = 3,
): SkillPrompt {
    const out: string[] = [];
    out.push(`Install the skill "${review.skill}" from ${review.repo}?`);
    if (/^[0-9a-f]{40}$/.test(review.commit)) {
        out.push("Read every file first, at the exact version that would be installed:");
        out.push(`https://github.com/${review.repo}/tree/${review.commit}/${review.path}`);
    } else {
        out.push(`No pinned version: ${review.commit}`);
    }
    out.push("");
    const kinds = new Map<string, number>();
    for (const file of review.files)
        kinds.set(kindOf(file.path), (kinds.get(kindOf(file.path)) ?? 0) + 1);
    const byKind = [...kinds.entries()]
        .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
        .map(([kind, n]) => `${n} ${kind}`)
        .join(", ");
    out.push(`${review.files.length} files, ${sizeOf(review.totalBytes)}: ${byKind}`);
    if (review.shebang.length > 0) out.push(`Start with #!: ${review.shebang.join(", ")}`);
    out.push(
        `Lines found: ${review.patterns.map((p) => `${p.short} ${p.matches.length}`).join(" · ")}`,
    );
    const shown = review.patterns.flatMap((p) =>
        p.matches.map((m) => `  ${p.short}  ${m.file}:${m.line}  ${m.text}`),
    );
    for (const line of shown.slice(0, maxLines)) out.push(line);
    if (shown.length > maxLines) out.push(`  … ${shown.length - maxLines} more at the link`);
    for (const f of review.thirdParty)
        out.push(`${f.source}: ${f.value} ${f.label} (read ${f.readOn})`);
    return {
        message: out.join("\n"),
        confirm: `Install ${review.skill} into ${installPath}`,
        confirmHelp: "Nothing is written unless you tick this and press Accept.",
    };
}
