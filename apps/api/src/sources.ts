/** The three reads, one per upstream, each returning a value or the reason there is none.
 *
 *  The same reads `scripts/measure/repo-liveness.ts`, `skill-layouts.ts`, `skills-installs.ts`
 *  and `skill-domains.ts` made by hand on 2026-10-29, moved here so they run on a schedule instead.
 *  `fetch` is injected, so every parser is tested against a recorded body and nothing here reaches
 *  the network in a test.
 */
import type { RepositoryFile } from '@arp-protocol/core';

export type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

/** A read that failed. `limited` means stop the slice: the next unit would fail the same way. */
export type Failure = { error: string; limited: boolean };

export type RepoFact = {
  stars: number;
  /** ISO 8601, or null when the repository is gone. `days` is computed from it at answer time. */
  pushedAt: string | null;
  archived: boolean;
  gone: boolean;
  description: string | null;
};

export type SkillFact = { description: string; installs: number | null };

const USER_AGENT = 'arp-api (+https://github.com/Wieedze/ARP)';

function githubHeaders(token: string | undefined): Record<string, string> {
  const headers: Record<string, string> = {
    accept: 'application/vnd.github+json',
    'user-agent': USER_AGENT,
  };
  if (token !== undefined && token.trim().length > 0)
    headers.authorization = `Bearer ${token.trim()}`;
  return headers;
}

/** GitHub answers a spent quota with 403 or 429, and both mean "the rest of this slice is wasted". */
function githubFailure(response: Response, what: string): Failure {
  const limited =
    response.status === 429 ||
    (response.status === 403 && response.headers.get('x-ratelimit-remaining') === '0');
  return { error: `${what}: HTTP ${response.status}`, limited };
}

export async function readRepo(
  slug: string,
  fetch: Fetch,
  token?: string,
): Promise<RepoFact | Failure> {
  const response = await fetch(`https://api.github.com/repos/${slug}`, {
    headers: githubHeaders(token),
  });
  // A 404 is an answer about the repository, not a failed read: it is gone, and that is the fact.
  if (response.status === 404) {
    return { stars: 0, pushedAt: null, archived: false, gone: true, description: null };
  }
  if (!response.ok) return githubFailure(response, `repo ${slug}`);
  // GitHub's documented `repos/{owner}/{repo}` fields; each is read defensively below.
  const repo = (await response.json()) as {
    stargazers_count?: number;
    pushed_at?: string | null;
    archived?: boolean;
    description?: string | null;
  };
  return {
    stars: repo.stargazers_count ?? 0,
    pushedAt: repo.pushed_at ?? null,
    archived: repo.archived === true,
    gone: false,
    description: repo.description?.trim() || null,
  };
}

/** Every SKILL.md in the default branch, with its blob sha so identical copies can be told apart. */
export async function readTree(
  repo: string,
  fetch: Fetch,
  token?: string,
): Promise<RepositoryFile[] | Failure> {
  const response = await fetch(`https://api.github.com/repos/${repo}/git/trees/HEAD?recursive=1`, {
    headers: githubHeaders(token),
  });
  if (!response.ok) return githubFailure(response, `tree ${repo}`);
  // GitHub's documented git-trees shape; a missing `tree` reads as an empty listing.
  const tree = (await response.json()) as { tree?: { path: string; type: string; sha: string }[] };
  return (tree.tree ?? [])
    .filter((entry) => entry.type === 'blob')
    .map((entry) => ({ path: entry.path, sha: entry.sha }));
}

/**
 * Where a description is cut, as `scripts/build-skill-facts.ts` cut it: median 448 characters over
 * the 662, and a list row has room for about two lines. The full text is the SKILL.md itself.
 */
const CUT_AT = 200;

export function shorten(text: string): string {
  if (text.length <= CUT_AT) return text;
  const head = text.slice(0, CUT_AT);
  const space = head.lastIndexOf(' ');
  return `${(space > CUT_AT - 40 ? head.slice(0, space) : head).trimEnd()}…`;
}

/**
 * A skill's page on skills.sh, read for the JSON-LD it publishes for machines: the author's
 * description and the install count. Not its API, which answers 401 to anyone without a Vercel
 * OIDC token and is `Disallow`ed in `robots.txt` (`scripts/measure/skills-installs.ts`).
 */
export async function readSkillPage(
  repo: string,
  skill: string,
  fetch: Fetch,
): Promise<SkillFact | Failure> {
  const response = await fetch(`https://www.skills.sh/${repo}/${skill}`, {
    headers: { 'user-agent': USER_AGENT },
  });
  if (response.status === 429)
    return { error: `skills.sh ${repo}/${skill}: HTTP 429`, limited: true };
  if (!response.ok)
    return { error: `skills.sh ${repo}/${skill}: HTTP ${response.status}`, limited: false };
  const body = await response.text();
  const count = /"userInteractionCount":(\d+)/.exec(body)?.[1];
  const quoted = /"description":"((?:[^"\\]|\\.)*)"/.exec(body)?.[1];
  let description = '';
  if (quoted !== undefined) {
    try {
      // Unescaping a JSON string literal by parsing it. A malformed one costs this skill its
      // description, never the slice.
      const parsed: unknown = JSON.parse(`"${quoted}"`);
      if (typeof parsed === 'string') description = parsed;
    } catch {
      description = '';
    }
  }
  // Null, not zero, when the page carries no figure: zero is a claim about the skill, null a claim
  // about what could be read.
  return {
    description: shorten(description),
    installs: count === undefined ? null : Number(count),
  };
}

export function isFailure(value: unknown): value is Failure {
  return typeof value === 'object' && value !== null && 'error' in value && 'limited' in value;
}
