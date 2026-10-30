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
export type RepoFact = {
    stars: number;
    days: number | null;
    archived: boolean;
    gone: boolean;
    /** The owner's own one-line summary on GitHub, or `null` when they wrote none (7 of 53). */
    description: string | null;
};

/**
 * What ARP wrote for a skill: its atom and its domain tag, `null` for the 61 no keyword matched.
 * From `catalogue/skills-13579.json`, which `scripts/audit-skill-tags.ts` checks against the chain.
 */
export type CatalogueEntry = {atom: string | null; domain: string | null};

export function useSkillFacts() {
    const query = useQuery({
        queryKey: ["skill-facts"],
        queryFn: async (): Promise<{
            skills: Record<string, SkillFact>;
            repos: Record<string, RepoFact>;
            catalogue: Record<string, CatalogueEntry>;
            measuredOn: string | null;
        }> => {
            // Both in one chunk: 5 KB of repository signals beside 45 KB of descriptions, wanted
            // by the same pages at the same moment.
            const [skills, repos, catalogue] = await Promise.all([
                import("../data/skill-facts.json"),
                import("../data/repo-facts.json"),
                import("../data/skill-catalogue.json"),
            ]);
            return {
                skills: (skills.default as {facts?: Record<string, SkillFact>}).facts ?? {},
                repos: (repos.default as {facts?: Record<string, RepoFact>}).facts ?? {},
                catalogue:
                    (catalogue.default as {skills?: Record<string, CatalogueEntry>}).skills ?? {},
                // Both files were measured on the same day; the date is printed beside the figures.
                measuredOn: (skills.default as {_measuredOn?: string})._measuredOn ?? null,
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
        /** ARP's record of a skill: its atom id and the domain it was tagged with, or `null`. */
        catalogueFor: (label: string | null): CatalogueEntry | null =>
            label === null || facts === undefined ? null : (facts.catalogue[label] ?? null),
        /** Every skill label the bundled facts know, for comparing one repository with another. */
        skillLabels: facts === undefined ? [] : Object.keys(facts.skills),
        /** The day the figures were read, `YYYY-MM-DD`: a dated copy, never a live read. */
        measuredOn: facts?.measuredOn ?? null,
        isLoading: query.isLoading,
    };
}
