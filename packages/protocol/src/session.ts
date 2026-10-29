/**
 * What a runtime invoked, turned into the tools ARP can name.
 *
 * Pure. The log and the catalogue are both passed in, so this is testable without a file, a chain
 * or a network — and so it carries no opinion about where either comes from.
 *
 * ## Why a declaration should come from here rather than from the agent
 *
 * Until this existed, a declaration was **composed**: the agent decided, after the fact and from
 * memory, what to say it had used. That is the agent's word about the agent, which `docs/14` puts
 * on the bottom rung and which ARP's whole argument is about not confusing with evidence.
 *
 * A runtime hook is configuration rather than code the model runs. It fires on the call, writes a
 * line, and the model never touches the line. What follows is not something the agent composed; it
 * is something it is stuck with. The difference is structural, not cryptographic, and it is the
 * one rung available without a TEE.
 *
 * ## Why it refuses rather than guesses
 *
 * A skill's **name does not identify a tool**. Measured 2026-10-29 by
 * `scripts/measure/skill-content-duplicates.ts`: of 499 distinct skill names in the catalogue,
 * **104 are carried by more than one repository with byte-identical files** and 9 more by
 * repositories whose files differ. `product-photography` exists in six.
 *
 * So a log line carrying only a name is consistent with several atoms, and choosing one would
 * write an edge about a repository the agent may never have touched — a false claim with a
 * position behind it, which is worse on this project's ladder than no claim at all.
 *
 * ## What ends it
 *
 * A **reference**: an atom id, or the URL it derives from. Both are the same information, since an
 * id is a pure function of a normalised URL (ADR `0054`), and either resolves to exactly one atom.
 *
 * A runtime hands a skill's name and not its origin, so the reference is empty today. It fills the
 * moment ARP serves the content: the response carries the atom it is, the hook logs that, and
 * there is nothing to guess. That is the half of "ARP as the access path" that is about
 * identification rather than about a business model.
 */

/** One line a runtime hook wrote. */
export type Invocation = {
    at: string;
    session: string | null;
    kind: "skill" | "mcp";
    /** The skill's name, or the MCP server's configured key. */
    name: string;
    /** Where the runtime said it came from, when it said. Never inferred. */
    source: string | null;
    /** An atom id or a URL. Exact where a name is not. */
    ref: string | null;
};

/** What the catalogue holds about one skill. Passed in, never imported. */
export type CataloguedSkill = {
    repo: string;
    skill: string;
    url: string;
    atom: string | null;
};

export type Resolution =
    | {status: "resolved"; name: string; repo: string; url: string; atomId: string; calls: number}
    | {status: "ambiguous"; name: string; candidates: {repo: string; url: string}[]; calls: number}
    | {status: "unknown"; name: string; kind: "skill" | "mcp"; calls: number};

/** Parse a JSONL log. A corrupt line loses itself, never the session's whole record. */
export function parseSessionLog(text: string): Invocation[] {
    const out: Invocation[] = [];
    for (const line of text.split("\n")) {
        if (line.trim().length === 0) continue;
        let parsed: Partial<Invocation>;
        try {
            parsed = JSON.parse(line) as Partial<Invocation>;
        } catch {
            continue;
        }
        if (typeof parsed.name !== "string") continue;
        if (parsed.kind !== "skill" && parsed.kind !== "mcp") continue;
        out.push({
            at: typeof parsed.at === "string" ? parsed.at : "",
            session: typeof parsed.session === "string" ? parsed.session : null,
            kind: parsed.kind,
            name: parsed.name,
            source: typeof parsed.source === "string" ? parsed.source : null,
            ref: typeof parsed.ref === "string" ? parsed.ref : null,
        });
    }
    return out;
}

/**
 * What each distinct invocation resolves to, counted.
 *
 * The count is reported and **never weighted**: calling a tool forty times is not forty times the
 * evidence, and ARP composes no score (ADR `0046`). A reader deciding whether to declare wants to
 * see it, which is the whole of why it is here.
 */
export function resolveInvocations(
    log: readonly Invocation[],
    catalogue: readonly CataloguedSkill[],
): Resolution[] {
    const calls = new Map<string, {invocation: Invocation; n: number}>();
    for (const entry of log) {
        // Keyed on the exact reference first: two lines naming the same skill are one tool only
        // when they point at the same atom, and a name cannot say that.
        const key = entry.ref ?? `${entry.kind}:${entry.name}:${entry.source ?? ""}`;
        const seen = calls.get(key);
        if (seen === undefined) calls.set(key, {invocation: entry, n: 1});
        else seen.n += 1;
    }

    const out: Resolution[] = [];
    for (const {invocation, n} of calls.values()) {
        if (invocation.kind !== "skill") {
            // An MCP server's key is whatever the operator typed into their settings. It is not a
            // repository and nothing maps it to one, so it is reported rather than resolved.
            out.push({status: "unknown", name: invocation.name, kind: "mcp", calls: n});
            continue;
        }

        if (invocation.ref !== null) {
            const byRef = catalogue.find(
                (row) => row.atom === invocation.ref || row.url === invocation.ref,
            );
            if (byRef !== undefined && byRef.atom !== null) {
                out.push({
                    status: "resolved",
                    name: byRef.skill,
                    repo: byRef.repo,
                    url: byRef.url,
                    atomId: byRef.atom,
                    calls: n,
                });
                continue;
            }
        }

        // A plugin skill arrives as `plugin:skill`; the catalogue holds the bare name.
        const bare = invocation.name.includes(":")
            ? (invocation.name.split(":").pop() ?? invocation.name)
            : invocation.name;
        let matches = catalogue.filter((row) => row.skill === bare);
        // A source narrows it when the runtime gave one, which is the only other thing that can.
        if (invocation.source !== null && matches.length > 1) {
            const narrowed = matches.filter((row) => invocation.source?.includes(row.repo) === true);
            if (narrowed.length > 0) matches = narrowed;
        }

        const only = matches[0];
        if (matches.length === 0) {
            out.push({status: "unknown", name: bare, kind: "skill", calls: n});
        } else if (matches.length === 1 && only !== undefined && only.atom !== null) {
            out.push({
                status: "resolved",
                name: bare,
                repo: only.repo,
                url: only.url,
                atomId: only.atom,
                calls: n,
            });
        } else {
            out.push({
                status: "ambiguous",
                name: bare,
                candidates: matches.map((row) => ({repo: row.repo, url: row.url})),
                calls: n,
            });
        }
    }
    return out;
}
