import {useQuery} from "@tanstack/react-query";

/**
 * The two things a skill atom cannot carry: a one-line description and an install count.
 *
 * A skill atom holds its **normalised URL and nothing else** — every field of its Thing is a pure
 * function of that URL (ADR `0054`), because a free-text field inside a hashed document is a
 * duplicate generator. The id is the hash of the document, so this can never be added to the atoms
 * that exist; it has to come from beside them.
 *
 * **Loaded on demand, not bundled into the entry chunk.** 662 descriptions are 45 KB gzipped, and
 * a reader who never opens `/tools` should not pay for them. A dynamic `import()` makes it its own
 * chunk; the query keeps one copy for the session.
 *
 * Why it is a file and not a fetch: measured 2026-10-29, **skills.sh sends no CORS header**, so a
 * browser cannot read it at all. `raw.githubusercontent.com` can, and that is where the full
 * SKILL.md comes from on a detail page — one skill at a time, which is a request worth making. A
 * description is needed for every row, and 662 requests to render one page is not a design.
 */

export type SkillFact = {description: string; installs: number | null};

/**
 * Signals about the repository a skill came from.
 *
 * `archived` and `days` are the two ARP puts on chain, because one is the owner's own declaration
 * and the other decays on its own. `stars` are here because a reader judging a tool wants them and
 * they are a signal of life — a weak one: free to give, and they never fall.
 */
export type RepoFact = {stars: number; days: number | null; archived: boolean; gone: boolean};

export function useSkillFacts() {
    const query = useQuery({
        queryKey: ["skill-facts"],
        queryFn: async (): Promise<{
            skills: Record<string, SkillFact>;
            repos: Record<string, RepoFact>;
        }> => {
            // Both in one chunk: 5 KB of repository signals beside 45 KB of descriptions, wanted
            // by the same pages at the same moment.
            const [skills, repos] = await Promise.all([
                import("../data/skill-facts.json"),
                import("../data/repo-facts.json"),
            ]);
            return {
                skills: (skills.default as {facts?: Record<string, SkillFact>}).facts ?? {},
                repos: (repos.default as {facts?: Record<string, RepoFact>}).facts ?? {},
            };
        },
        // A file in the bundle. It cannot go stale within a session.
        staleTime: Infinity,
        gcTime: Infinity,
    });
    const facts = query.data;
    return {
        /** Keyed by the atom's label — the normalised URL without its scheme, which is what the
         * chain already gave the caller, so nothing is re-derived in the browser. */
        factFor: (label: string | null): SkillFact | null =>
            label === null || facts === undefined ? null : (facts.skills[label] ?? null),
        /** Keyed by the repository atom's label, `github.com/owner/repo`. */
        repoFactFor: (label: string | null): RepoFact | null =>
            label === null || facts === undefined ? null : (facts.repos[label] ?? null),
        isLoading: query.isLoading,
    };
}
