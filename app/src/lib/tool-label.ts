/**
 * Break a tool atom's label into the parts a reader cares about.
 *
 * An atom's label **is** its normalised URL without the scheme (`declare/tool-thing.ts`), because
 * every field of a tool's Thing is a pure function of that URL and nobody gets to type a name —
 * that is what stops one tool becoming five atoms. The cost is a label that reads like a URL, and
 * it is paid here rather than on chain.
 *
 * ```
 * github.com/prime-skills/runcomfy-agent-skills?skill=nano-banana
 *            └ owner ────┘ └ repo ───────────┘        └ skill ─┘
 * ```
 *
 * `github.com/` is on **all 716** of them, so showing it 716 times says nothing. What differs is
 * the three parts after it, and a skill's own name is what a person types into
 * `npx skills add <repo> --skill <name>`.
 *
 * Nothing here is humanised — no hyphens turned into spaces, no title case. The skill's name is an
 * **argument**, and a reader who retypes a prettified one gets an error.
 */

export type ToolLabel =
    | {kind: "skill"; owner: string; repo: string; skill: string; host: string}
    | {kind: "repo"; owner: string; repo: string; host: string}
    | {kind: "other"; text: string};

/**
 * `null` in, and the atom id stands in for the label — which `ToolCatalogList` already renders in
 * mono because a hex string is not a name.
 */
export function parseToolLabel(label: string | null): ToolLabel {
    if (label === null || label.trim().length === 0) return {kind: "other", text: ""};
    const text = label.trim();

    // Parsed with `URL`, not with a regular expression: the query string is what carries the skill
    // and `?skill=a&b=c` has to decode the same way the writer encoded it.
    let url: URL;
    try {
        url = new URL(text.includes("://") ? text : `https://${text}`);
    } catch {
        return {kind: "other", text};
    }

    const segments = url.pathname.split("/").filter((part) => part.length > 0);
    const owner = segments[0];
    const repo = segments[1];
    if (owner === undefined || repo === undefined) return {kind: "other", text};

    const skill = url.searchParams.get("skill");
    const host = url.hostname;
    if (skill !== null && skill.length > 0) return {kind: "skill", owner, repo, skill, host};
    // A deeper path is not a repository — `/tree/main/x` would read as one if only the first two
    // segments were checked.
    if (segments.length > 2) return {kind: "other", text};
    return {kind: "repo", owner, repo, host};
}

/**
 * What the row's first line says.
 *
 * A skill leads with its own name and nothing else: its line has to hold a name a person retypes,
 * and `github.com/owner/repo?skill=` in front of it eats the width. Its repository goes on the
 * second line.
 *
 * **A repository keeps its host**, and that is not an inconsistency. Its line is the only line it
 * gets, so there is room; and dropping the host would make `github.com/x/y` and `gitlab.com/x/y`
 * render identically, which is a false merge on screen of two atoms the chain keeps apart.
 */
export function primaryNameOf(parsed: ToolLabel): string {
    if (parsed.kind === "skill") return parsed.skill;
    if (parsed.kind === "repo") return `${parsed.host}/${parsed.owner}/${parsed.repo}`;
    return parsed.text;
}

/**
 * What the row's second line says, or `null` when it would repeat the first.
 *
 * A repository row has nowhere else to go, so it gets no second line rather than one that says the
 * same thing twice.
 */
export function sourceOf(parsed: ToolLabel): string | null {
    return parsed.kind === "skill" ? `${parsed.owner}/${parsed.repo}` : null;
}

/**
 * Where to go and look. **Never a call target** (ADR `0051`): this is a page for a person, not an
 * endpoint for an agent.
 *
 * The `?skill=` form is ARP's identifier, not a URL GitHub does anything with, so it is dropped —
 * the link goes to the repository, which is where the skill actually lives. Linking to a path we
 * cannot resolve would be a link that 404s.
 */
export function browseUrlOf(parsed: ToolLabel): string | null {
    if (parsed.kind === "other") return null;
    return `https://${parsed.host}/${parsed.owner}/${parsed.repo}`;
}
