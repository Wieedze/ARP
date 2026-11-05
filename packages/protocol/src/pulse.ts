/**
 * The pulse of a skill: what its own files show, read when somebody asks (task 63, ADR `0134`).
 *
 * Nothing here is a verdict. `keys`, `paidWords` and `login` are text matches, so a reader is told
 * "mentions", never "requires". The figures come from the file or from whoever is named beside them.
 *
 * ## Which file a search result means
 *
 * The result names a skill by the `name` in its frontmatter, because that is what the installer
 * matches (`skills` 1.7.4, `filterSkills`). A directory name is only the cheap first guess, and a
 * repository is free to disagree with it: `resolveContentPath` in `content-path.ts` matches
 * directories because it serves an atom's file, and this one has to find what an install would take.
 * Two differing files are resolved only where the installer's own order resolves them; `differsAt`
 * names the file passed over, and off that order the result stays `ambiguous`, never a choice.
 *
 * ## What identifies a content
 *
 * `contentId` is git's tree id of the skill's directory, so it covers every file and anybody can
 * recompute it: `git rev-parse HEAD:<directory>`. Identical directories in two repositories share
 * it. A skill whose `SKILL.md` sits at the repository root gets the root's id, so that id changes
 * with anything in the repository. `skillMdSha` is git's blob id of the file alone.
 */
import {directoryOf, skillFilesIn, type RepositoryFile} from "./content-path.js";
import {readRequires, type SkillRequires} from "./skill-requires.js";

/** One line of `npx skills find`. `installs` is skills.sh's own figure, as the CLI prints it. */
export type SkillSearchResult = {
    /** `owner/repo` for GitHub, otherwise whatever host the CLI printed. */
    source: string;
    skill: string;
    installs: number | null;
    installsText: string | null;
    url: string | null;
};

export type SkillFacts = {
    files: number;
    bytes: number;
    scripts: number;
    /** Names of environment variables that look like a key. Never a value. */
    keys: string[];
    paidWords: string[];
    /** Hosts the file names, GitHub and placeholder domains left out. */
    hosts: string[];
    /**
     * Files its instructions run that the repository does not hold. `cut-silences` runs
     * `scripts/transcribe-elevenlabs.mjs`, and no key name in its file says what that needs.
     */
    runsAbsentFiles: string[];
    requires: SkillRequires;
};

export type SkillRepository = {stars: number; pushedAt: string | null; archived: boolean};

export type SkillPulse = SkillSearchResult &
    (
        | ({
              status: "read";
              path: string;
              /** Other paths with the same `SKILL.md`. */
              alsoAt: string[];
              /** Other paths with this name and a different file, which an install passes over. */
              differsAt: string[];
              contentId: string;
              skillMdSha: string;
              repository: SkillRepository | null;
          } & SkillFacts)
        /** The source is not a GitHub repository, so this reader has nothing to list. */
        | {status: "not_github"}
        | {status: "repository_unreachable"}
        /** No `SKILL.md` in the repository names this skill. */
        | {status: "absent"; skillFiles: number}
        /** Several files carry the name and their contents differ. */
        | {status: "ambiguous"; paths: string[]}
        /** The listing or the name check stopped before the end, so `absent` cannot be claimed. */
        | {status: "incomplete"; reason: "truncated_listing" | "too_many_skill_files"}
        | {status: "rate_limited"}
    );

export type ListedFile = RepositoryFile & {size: number};

export type RepositoryListing = {
    rootTreeId: string;
    files: readonly ListedFile[];
    /** Directory path to git's tree id. */
    trees: ReadonlyMap<string, string>;
    truncated: boolean;
};

export type PulseFailure = "unreachable" | "rate_limited";

/** The network, passed in so that everything else here is testable without one. */
export type PulseSource = {
    listing(repo: string): Promise<RepositoryListing | PulseFailure>;
    file(repo: string, path: string): Promise<string | null>;
    repository(repo: string): Promise<SkillRepository | null>;
};

/** Beyond this a repository is a collection, and reading each file's name costs too much per ask. */
export const MAX_SKILL_FILES_READ = 200;

/**
 * Where the installer looks first, in its order (`skills` 1.7.4, `PRIORITY_PREFIXES`). It keeps the
 * first file carrying a name and drops the rest, so this order decides which of two differing
 * files an install gets, and `docs/zh-CN/skills/x/SKILL.md` loses to `skills/x/SKILL.md`.
 */
const INSTALLER_ORDER = [
    "",
    "skills/",
    "skills/.curated/",
    "skills/.experimental/",
    "skills/.system/",
    ".agents/skills/",
    ".claude/skills/",
    ".cline/skills/",
    ".codebuddy/skills/",
    ".codex/skills/",
    ".commandcode/skills/",
    ".continue/skills/",
    ".factory/skills/",
    ".github/skills/",
    ".goose/skills/",
    ".grok/skills/",
    ".iflow/skills/",
    ".junie/skills/",
    ".kilo/skills/",
    ".kilocode/skills/",
    ".kimchi/skills/",
    ".kiro/skills/",
    ".minimax/skills/",
    ".mux/skills/",
    ".neovate/skills/",
    ".opencode/skills/",
    ".openhands/skills/",
    ".pi/skills/",
    ".posit/assistant/skills/",
    ".qoder/skills/",
    ".roo/skills/",
    ".trae/skills/",
    ".windsurf/skills/",
    ".zcode/skills/",
    ".zencoder/skills/",
];

/** The position of a path in the installer's order, or `null` when it only finds it by walking. */
function installerRank(path: string): number | null {
    let best: number | null = null;
    INSTALLER_ORDER.forEach((prefix, rank) => {
        if (best !== null || !path.startsWith(prefix)) return;
        const depth = path.slice(prefix.length).split("/").length;
        // The root holds a skill at itself or one directory down; a container up to three down.
        if (prefix === "" ? depth <= 2 : depth <= 4) best = rank;
    });
    return best;
}

/** How the installer compares names: case and spacing do not separate two skills. */
function normaliseName(name: string): string {
    return name.trim().toLowerCase().replace(/[\s_]+/g, "-");
}

const RESULT = /^(\S+?)@(.+?) ([\d.,]+[KMB]?) installs?\s*$/;
const RESULT_NO_COUNT = /^(\S+?)@(.+?)\s*$/;
// eslint-disable-next-line no-control-regex -- the escape byte is exactly what is being removed
const ANSI = /\u001b\[[0-9;]*m/g;

function parseInstalls(text: string): number {
    const value = Number(text.replace(/,/g, "").replace(/[KMB]$/, ""));
    const unit = text.at(-1);
    return Math.round(value * (unit === "K" ? 1e3 : unit === "M" ? 1e6 : unit === "B" ? 1e9 : 1));
}

/** Parse the CLI's text. It has no JSON output, so a changed format gives an empty list. */
export function parseSkillsFind(output: string): SkillSearchResult[] {
    const results: SkillSearchResult[] = [];
    const seen = new Set<string>();
    const lines = output.replace(ANSI, "").split("\n");
    for (let index = 0; index < lines.length; index += 1) {
        const line = (lines[index] ?? "").trim();
        const next = (lines[index + 1] ?? "").trim();
        const link = /^└\s*(https?:\/\/\S+)/.exec(next)?.[1] ?? null;
        const counted = RESULT.exec(line);
        const match = counted ?? (link === null ? null : RESULT_NO_COUNT.exec(line));
        if (match === null) continue;
        const key = `${match[1]}@${match[2]}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const installsText = counted?.[3] ?? null;
        results.push({
            source: match[1] ?? "",
            skill: match[2] ?? "",
            installs: installsText === null ? null : parseInstalls(installsText),
            installsText,
            url: link,
        });
    }
    return results;
}

/** The frontmatter's `name`, unquoted. `null` when there is none, which an installer also skips. */
export function frontmatterName(markdown: string): string | null {
    const lines = markdown.split("\n");
    if (lines[0]?.trim() !== "---") return null;
    for (const line of lines.slice(1)) {
        if (line.trim() === "---") return null;
        const match = /^name\s*:\s*(.+?)\s*$/.exec(line);
        if (match !== null) return (match[1] ?? "").replace(/^["']|["']$/g, "");
    }
    return null;
}

const KEY_NAME = /\b[A-Z][A-Z0-9_]*(?:API_KEY|APIKEY|_TOKEN|_SECRET)\b/g;
const PAID_WORD = /\b(pricing|paid|subscription|credits?|billing|free tier|per minute)\b/gi;
const HOST = /https?:\/\/([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g;
const NOT_A_SERVICE = /(^|\.)(github\.com|githubusercontent\.com|example\.(com|org|net))$/;
const LOOKS_LIKE_A_FILE = /\.(jpe?g|png|gif|webp|mp[34]|wav|mov|webm|pdf|md|json|txt)$/;
const SCRIPT = /\.(sh|bash|py|js|mjs|cjs|ts|rb|pl)$/i;

const RUNS_FILE = /\b(?:node|bun|deno|tsx|python3?|bash|sh)\s+((?:~|\.{1,2})?\/?[\w.@-]+(?:\/[\w.@-]+)*\.(?:mjs|cjs|js|ts|py|sh))\b/g;
const PLACEHOLDER = /(^|\/)(path|your|my|foo|example|script|file|input|output)(\/|\.|$)/i;

/** Scripts the text runs that no file in the repository could be. Suffix match, so a layout cannot fool it. */
function absentFiles(markdown: string, repositoryFiles: readonly {path: string}[]): string[] {
    const named = [...markdown.matchAll(RUNS_FILE)].map((match) => match[1] ?? "");
    return [...new Set(named)].filter((name) => {
        if (name.startsWith("/") || name.startsWith("~") || PLACEHOLDER.test(name)) return false;
        const tail = name.replace(/^(\.{1,2}\/)+/, "");
        return !repositoryFiles.some((file) => file.path === tail || file.path.endsWith(`/${tail}`));
    });
}

/** What a directory's listing and its `SKILL.md` show. Pure. */
export function readSkillFacts(
    markdown: string,
    filesInDirectory: readonly ListedFile[],
    repositoryFiles: readonly {path: string}[] = filesInDirectory,
): SkillFacts {
    const hosts = [...markdown.matchAll(HOST)]
        .map((match) => (match[1] ?? "").toLowerCase())
        .filter((host) => !NOT_A_SERVICE.test(host) && !LOOKS_LIKE_A_FILE.test(host));
    return {
        files: filesInDirectory.length,
        bytes: filesInDirectory.reduce((total, file) => total + file.size, 0),
        scripts: filesInDirectory.filter((file) => SCRIPT.test(file.path)).length,
        keys: [...new Set(markdown.match(KEY_NAME) ?? [])],
        paidWords: [...new Set((markdown.match(PAID_WORD) ?? []).map((word) => word.toLowerCase()))],
        hosts: [...new Set(hosts)],
        runsAbsentFiles: absentFiles(markdown, repositoryFiles),
        requires: readRequires(markdown),
    };
}

function parentOf(path: string): string {
    const at = path.lastIndexOf("/");
    return at === -1 ? "" : path.slice(0, at);
}

type Located =
    | {status: "found"; file: ListedFile; alsoAt: string[]; differsAt: string[]; markdown: string}
    | {status: "absent"; skillFiles: number}
    | {status: "ambiguous"; paths: string[]}
    | {status: "incomplete"; reason: "truncated_listing" | "too_many_skill_files"};

/** Find the file whose frontmatter names the skill, trying directories that carry the name first. */
async function locate(
    source: PulseSource,
    repo: string,
    skill: string,
    listing: RepositoryListing,
): Promise<Located> {
    const wanted = normaliseName(skill);
    const candidates = listing.files.filter((file) => skillFilesIn([file]).length === 1);
    const guessed = candidates.filter((file) => normaliseName(directoryOf(file.path)) === wanted);
    const others = candidates.filter((file) => !guessed.includes(file));

    const read = async (files: readonly ListedFile[]) =>
        (await Promise.all(files.map(async (file) => ({file, markdown: await source.file(repo, file.path)})))).filter(
            (entry): entry is {file: ListedFile; markdown: string} =>
                entry.markdown !== null && normaliseName(frontmatterName(entry.markdown) ?? "") === wanted,
        );

    let named = await read(guessed);
    if (named.length === 0) {
        if (others.length > MAX_SKILL_FILES_READ) {
            return {status: "incomplete", reason: "too_many_skill_files"};
        }
        for (let at = 0; at < others.length && named.length === 0; at += 20) {
            named = await read(others.slice(at, at + 20));
        }
        // The batch that found one may have stopped short of a second copy in a later batch. That
        // only costs an `alsoAt` entry or a missed `ambiguous`, so it is read through once found.
        if (named.length > 0) {
            const last = others.findIndex((file) => file === named.at(-1)?.file);
            named = [...named, ...(await read(others.slice(last + 1)))];
        }
    }
    if (named.length === 0) {
        if (listing.truncated) return {status: "incomplete", reason: "truncated_listing"};
        return {status: "absent", skillFiles: candidates.length};
    }
    const ranked = named
        .map((entry) => ({...entry, rank: installerRank(entry.file.path)}))
        .sort((a, b) => (a.rank ?? Infinity) - (b.rank ?? Infinity));
    const [first, ...rest] = ranked;
    if (first === undefined) return {status: "absent", skillFiles: candidates.length};
    const differs = rest.filter((entry) => entry.file.sha !== first.file.sha);
    // Off the installer's list it takes whichever file a directory walk meets first, so which one
    // an install gets is not knowable from here.
    if (first.rank === null && differs.length > 0) {
        return {status: "ambiguous", paths: ranked.map((entry) => entry.file.path)};
    }
    return {
        status: "found",
        file: first.file,
        markdown: first.markdown,
        alsoAt: rest.filter((entry) => entry.file.sha === first.file.sha).map((entry) => entry.file.path),
        differsAt: differs.map((entry) => entry.file.path),
    };
}

/** Read one search result. Every way it can fail is a status, because "unknown" must stay visible. */
export async function readPulse(result: SkillSearchResult, source: PulseSource): Promise<SkillPulse> {
    if (!/^[\w.-]+\/[\w.-]+$/.test(result.source)) return {...result, status: "not_github"};
    const listing = await source.listing(result.source);
    if (listing === "rate_limited") return {...result, status: "rate_limited"};
    if (listing === "unreachable") return {...result, status: "repository_unreachable"};

    const located = await locate(source, result.source, result.skill, listing);
    if (located.status === "absent") return {...result, status: "absent", skillFiles: located.skillFiles};
    if (located.status === "ambiguous") return {...result, status: "ambiguous", paths: located.paths};
    if (located.status === "incomplete") return {...result, status: "incomplete", reason: located.reason};

    const directory = parentOf(located.file.path);
    const prefix = directory === "" ? "" : `${directory}/`;
    const inDirectory = listing.files.filter((file) => file.path.startsWith(prefix));
    return {
        ...result,
        status: "read",
        path: located.file.path,
        alsoAt: located.alsoAt,
        differsAt: located.differsAt,
        contentId: directory === "" ? listing.rootTreeId : (listing.trees.get(directory) ?? located.file.sha),
        skillMdSha: located.file.sha,
        repository: await source.repository(result.source),
        ...readSkillFacts(located.markdown, inDirectory, listing.files),
    };
}

export type PulseGroup = {contentId: string; members: Extract<SkillPulse, {status: "read"}>[]};

/** Results that are the same content, largest group first. A lone result is a group of one. */
export function groupByContent(pulses: readonly SkillPulse[]): PulseGroup[] {
    const groups = new Map<string, Extract<SkillPulse, {status: "read"}>[]>();
    for (const pulse of pulses) {
        if (pulse.status !== "read") continue;
        groups.set(pulse.contentId, [...(groups.get(pulse.contentId) ?? []), pulse]);
    }
    return [...groups.entries()]
        .map(([contentId, members]) => ({contentId, members}))
        .sort((a, b) => b.members.length - a.members.length);
}

type GitHubTree = {
    sha?: unknown;
    truncated?: unknown;
    tree?: {path?: unknown; type?: unknown; sha?: unknown; size?: unknown}[];
};

/**
 * Read GitHub. One tree request and one repository request per repository, cached for the source's
 * life. Unauthenticated that is 60 requests an hour, so a token is optional and only makes it
 * comfortable. `raw.githubusercontent.com` is not on that quota.
 */
export function githubPulseSource(options: {fetch?: typeof fetch; token?: string} = {}): PulseSource {
    const get = options.fetch ?? fetch;
    const headers: Record<string, string> = {
        accept: "application/vnd.github+json",
        "user-agent": "arp-pulse",
        ...(options.token === undefined ? {} : {authorization: `Bearer ${options.token}`}),
    };
    const listings = new Map<string, Promise<RepositoryListing | PulseFailure>>();
    const repositories = new Map<string, Promise<SkillRepository | null>>();

    const readListing = async (repo: string): Promise<RepositoryListing | PulseFailure> => {
        const response = await get(`https://api.github.com/repos/${repo}/git/trees/HEAD?recursive=1`, {headers});
        if (response.status === 403 || response.status === 429) return "rate_limited";
        if (!response.ok) return "unreachable";
        const body = (await response.json()) as GitHubTree; // validated field by field below
        const files: ListedFile[] = [];
        const trees = new Map<string, string>();
        for (const entry of body.tree ?? []) {
            if (typeof entry.path !== "string" || typeof entry.sha !== "string") continue;
            if (entry.type === "tree") trees.set(entry.path, entry.sha);
            if (entry.type === "blob") {
                files.push({path: entry.path, sha: entry.sha, size: typeof entry.size === "number" ? entry.size : 0});
            }
        }
        return {
            rootTreeId: typeof body.sha === "string" ? body.sha : "",
            files,
            trees,
            truncated: body.truncated === true,
        };
    };

    const readRepository = async (repo: string): Promise<SkillRepository | null> => {
        const response = await get(`https://api.github.com/repos/${repo}`, {headers});
        if (!response.ok) return null;
        // validated field by field below
        const body = (await response.json()) as {stargazers_count?: unknown; pushed_at?: unknown; archived?: unknown};
        return {
            stars: typeof body.stargazers_count === "number" ? body.stargazers_count : 0,
            pushedAt: typeof body.pushed_at === "string" ? body.pushed_at : null,
            archived: body.archived === true,
        };
    };

    const once = <T>(cache: Map<string, Promise<T>>, repo: string, read: (repo: string) => Promise<T>): Promise<T> => {
        const hit = cache.get(repo);
        if (hit !== undefined) return hit;
        const started = read(repo);
        cache.set(repo, started);
        return started;
    };

    return {
        listing: (repo) => once(listings, repo, readListing),
        repository: (repo) => once(repositories, repo, readRepository),
        file: async (repo, path) => {
            const encoded = path.split("/").map(encodeURIComponent).join("/");
            const response = await get(`https://raw.githubusercontent.com/${repo}/HEAD/${encoded}`);
            return response.ok ? response.text() : null;
        },
    };
}
