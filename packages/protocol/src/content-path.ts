/**
 * Which file inside a repository a tool's atom refers to.
 *
 * Pure. The repository's listing is passed in, so there is no network here and no opinion about
 * where the listing came from — the same shape as `session.ts`, and for the same reason.
 *
 * ## Why this is not a formula
 *
 * `tasks/31` planned `GET /content/:atomId`. An atom id is a pure function of its normalised URL
 * (ADR `0054`), so the endpoint can recover `github.com/<owner>/<repo>?skill=<name>` without asking
 * anyone. **It cannot recover the path**, and `raw.githubusercontent.com` needs one.
 *
 * Whether a formula would do was an empirical question, and
 * `scripts/measure/skill-layouts.ts` settled it on 2026-10-29 over all 31 catalogued repositories
 * and all 662 catalogued skills: **19 distinct layouts**, and **8 of the 31 repositories use more
 * than one of them**. `skills/<skill>/SKILL.md` covers 215 of the located skills and
 * `<skill>/SKILL.md` another 55, so a formula would be right most of the time — which is the worst
 * available outcome, because the wrong answers would be silent.
 *
 * So the listing is read, and this decides from it.
 *
 * ## The four cases, and where they come from
 *
 * ```
 * 475  one candidate                      serve
 *  46  several, identical content         serve one, name the others
 *   2  several, content differs           refuse
 * 139  none                               refuse
 * ```
 *
 * The 46 are a skill published once per runtime directory inside one repository —
 * `.agents/skills/<skill>/` beside `.claude/skills/<skill>/`, and `pbakaus/impeccable` ships twenty
 * of them. Since the bytes are the same file, choosing between them asserts nothing, and the
 * receipt names the path it served either way.
 *
 * The 2 are the case that must refuse. Two files, two different contents, one atom: serving either
 * would be a claim about which one the agent read, and the receipt would carry that claim under a
 * signature. `session.ts` refuses an ambiguous *name* for the same reason — a false claim that cost
 * something is worse on this project's ladder than no claim at all.
 *
 * The 139 are the finding rather than the defect, and `tasks/31` §5.1 records it: 95 of them sit in
 * a repository with no uncatalogued directory, so there is nothing there the name could have been
 * renamed to. The file the catalogue points at is not in the repository. That is a **per-skill
 * liveness signal** anyone can re-derive with one listing request, which is sharper than `archived`
 * — per skill rather than per repository, and not the owner's own word.
 *
 * ## What it does not do
 *
 * **No fuzzy matching.** Exact directory name, or the same name case-folded, and nothing looser. A
 * near match would be a guess about which file belongs to which atom, under an atom's name, signed.
 *
 * **No opinion about which duplicate is canonical.** Where the content is identical the first
 * candidate in the listing's own order is served and the rest are named. Preferring `.claude/` over
 * `.agents/` would be a convention of ours imposed on somebody else's repository.
 *
 * **Only the immediate parent of SKILL.md.** The first run of the measurement matched any directory
 * in the path and reported 49 ambiguities where there are 48, 7 content conflicts where there are 2,
 * and turned a plugin directory's name into a skill. It is written here as well as there because
 * this is the code that would inherit the mistake.
 */

/** One file in a repository's listing. `sha` is whatever content id the source provides. */
export type RepositoryFile = {
    /** Path from the repository root, no leading slash. */
    path: string;
    /** A content id — git's blob sha from the GitHub tree API, or any digest of the bytes. */
    sha: string;
};

/** A tool URL split into the two things a listing is searched with. */
export type SkillRef = {
    /** `owner/repo`. */
    repo: string;
    skill: string;
};

export type ContentPathResolution =
    | {
          status: "resolved";
          path: string;
          /** Other paths carrying the same content, in the listing's order. Usually empty. */
          alsoAt: readonly string[];
          /** True when the directory name matched case-for-case. */
          exact: boolean;
      }
    /** Several candidates whose contents differ. Which one the agent read is unknown. */
    | {status: "ambiguous"; paths: readonly string[]}
    /** Nothing in the repository carries this name. */
    | {status: "absent"};

/**
 * Split a tool URL into `owner/repo` and the skill it names.
 *
 * `null` for anything that is not a GitHub repository URL carrying `?skill=`, which includes every
 * MCP server in the catalogue. Those have no file to serve and the endpoint says so rather than
 * reaching for one.
 */
export function skillRefFromUrl(url: string): SkillRef | null {
    let parsed: URL;
    try {
        parsed = new URL(url.includes("://") ? url : `https://${url}`);
    } catch {
        return null;
    }
    if (parsed.hostname.replace(/^www\./, "") !== "github.com") return null;

    const skill = parsed.searchParams.get("skill");
    if (skill === null || skill.length === 0) return null;

    const [owner, repo] = parsed.pathname.replace(/^\/+/, "").replace(/\/+$/, "").split("/");
    if (owner === undefined || repo === undefined) return null;
    if (owner.length === 0 || repo.length === 0) return null;

    return {repo: `${owner}/${repo}`, skill};
}

/** The directory a SKILL.md sits in — the only segment a skill's name is matched against. */
export function directoryOf(path: string): string {
    const parts = path.split("/");
    // A SKILL.md at the repository root has no directory. Returning the file's own name here would
    // make it a candidate for a skill called `SKILL.md`, which is the kind of answer that is
    // harmless until it is not.
    return parts.length < 2 ? "" : (parts[parts.length - 2] ?? "");
}

/** Every path in the listing whose basename is SKILL.md, in any case. */
export function skillFilesIn(listing: readonly RepositoryFile[]): RepositoryFile[] {
    return listing.filter(
        (file) => (file.path.split("/").pop() ?? "").toLowerCase() === "skill.md",
    );
}

/**
 * Find the one file a skill's atom refers to, or refuse.
 *
 * `listing` is the repository's files — the whole tree is fine, since this filters to SKILL.md
 * itself. The candidate is a file whose path contains a directory segment equal to the skill's
 * name, exactly or case-folded.
 */
export function resolveContentPath(
    ref: SkillRef,
    listing: readonly RepositoryFile[],
): ContentPathResolution {
    const files = skillFilesIn(listing);
    const folded = ref.skill.toLowerCase();

    const exact = files.filter((file) => directoryOf(file.path) === ref.skill);
    const candidates =
        exact.length > 0
            ? exact
            : files.filter((file) => directoryOf(file.path).toLowerCase() === folded);

    const first = candidates[0];
    if (first === undefined) return {status: "absent"};
    if (candidates.length === 1) {
        return {status: "resolved", path: first.path, alsoAt: [], exact: exact.length > 0};
    }

    const shas = new Set(candidates.map((file) => file.sha));
    if (shas.size > 1) return {status: "ambiguous", paths: candidates.map((file) => file.path)};
    return {
        status: "resolved",
        path: first.path,
        alsoAt: candidates.slice(1).map((file) => file.path),
        exact: exact.length > 0,
    };
}

/**
 * The raw URL for a path, pinned to a commit when one is given.
 *
 * `HEAD` is what the endpoint uses by default, because the question an agent asks is "give me this
 * skill" and not "give me this skill as it was". The cost is that a receipt's digest stops matching
 * when the repository changes under the path, which `receipt.ts` states rather than hides.
 */
export function rawContentUrl(ref: SkillRef, path: string, commit = "HEAD"): string {
    const encoded = path
        .split("/")
        .map((part) => encodeURIComponent(part))
        .join("/");
    return `https://raw.githubusercontent.com/${ref.repo}/${commit}/${encoded}`;
}
