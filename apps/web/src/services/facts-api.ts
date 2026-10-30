/**
 * The facts ARP's Worker (`apps/api`) serves: GitHub's and skills.sh's figures, each with when it
 * was read. A cache in front of two sites a browser cannot read itself — skills.sh sends no CORS
 * header, and the GitHub API allows 60 requests an hour per visitor.
 *
 * The bundled copy in `src/data/` stays as the fallback: a Worker that is down or not configured
 * leaves the page with the last dated copy rather than with empty rows.
 */

export type LiveSkillFact = {description: string; installs: number | null; fetchedAt: string};
export type LiveRepoFact = {
    stars: number;
    days: number | null;
    archived: boolean;
    gone: boolean;
    description: string | null;
    fetchedAt: string;
};
type Span = {oldest: string | null; newest: string | null};

export type FactsAnswer = {
    read: {skills: Span; repos: Span; paths: Span};
    skills: Record<string, LiveSkillFact>;
    repos: Record<string, LiveRepoFact>;
    paths: Record<string, string>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * `GET <base>/facts`. Throws on anything that is not the shape — the caller falls back to the
 * bundled copy, so a half-answer must not be mistaken for an answer.
 */
export async function fetchFacts(
    baseUrl: string,
    fetcher: typeof fetch = fetch,
): Promise<FactsAnswer> {
    const response = await fetcher(`${baseUrl.replace(/\/+$/, "")}/facts`);
    if (!response.ok) throw new Error(`${response.status} from the facts API`);
    const body: unknown = await response.json();
    if (
        !isRecord(body) ||
        !isRecord(body.skills) ||
        !isRecord(body.repos) ||
        !isRecord(body.paths) ||
        !isRecord(body.read)
    ) {
        throw new Error("the facts API answered something that is not a facts document");
    }
    // An empty cache is a Worker that has not finished its first cycle, not a set of facts.
    if (Object.keys(body.skills).length === 0) throw new Error("the facts API has nothing yet");
    // Checked above to be the four records `FactsAnswer` names; their entries are the Worker's.
    return body as FactsAnswer;
}

/** `YYYY-MM-DD` of an ISO instant, or `null`. The day a figure was read is what a page prints. */
export function dayOf(iso: string | null): string | null {
    return iso === null || iso.length < 10 ? null : iso.slice(0, 10);
}
