/** Whether a tool URL exists where it says, for `POST /list-tool` (ADR `0123`).
 *
 *  A GitHub URL is checked against GitHub's API: the repository's tree, and for a skill
 *  (`?skill=<s>`) a SKILL.md in a directory of that name (`resolveContentPath`, the same rule the
 *  content server serves by). Two requests at most: the repository, which gives GitHub's own
 *  spelling of its name, then its tree for a skill. Unauthenticated unless `GITHUB_TOKEN` is set, so
 *  GitHub's 60 an hour per IP is the bound without one.
 *
 *  **Any other URL is accepted unchecked.** Fetching an arbitrary URL from the process that holds
 *  the treasury key would let a caller point it at the local network. The daily caps bound what an
 *  invented URL costs.
 */
import { resolveContentPath, skillRefFromUrl, type RepositoryFile } from '@arp-protocol/core';

const FETCH_TIMEOUT_MS = 10_000;

/** `fullName` is GitHub's own `owner/repo`, case included, for a GitHub URL. */
export type ToolResolution = { ok: true; fullName?: string } | { ok: false; reason: string };

const CACHE_MS = 10 * 60_000;
/** Bounded: the route runs this before any limit, so an unbounded map is a way to fill memory. */
const CACHE_ENTRIES = 1_000;
const cache = new Map<string, { at: number; answer: ToolResolution }>();

/**
 * {@link resolveOnGitHub}, remembered for ten minutes per URL. A refusal records nothing in the
 * ledger, so without this one URL repeated would spend GitHub's hourly allowance for everyone.
 */
export async function resolveOnGitHubCached(
  url: string,
  now = Date.now(),
): Promise<ToolResolution> {
  // Only GitHub URLs cost a request, so only they are remembered.
  if (new URL(url).hostname.replace(/^www\./, '') !== 'github.com') return resolveOnGitHub(url);
  const hit = cache.get(url);
  if (hit !== undefined && now - hit.at < CACHE_MS) return hit.answer;
  const answer = await resolveOnGitHub(url);
  cache.delete(url);
  cache.set(url, { at: now, answer });
  // A `Map` iterates in insertion order, so the first key is the oldest.
  if (cache.size > CACHE_ENTRIES) cache.delete(cache.keys().next().value ?? url);
  return answer;
}

export async function resolveOnGitHub(
  url: string,
  token = process.env.GITHUB_TOKEN?.trim(),
): Promise<ToolResolution> {
  const parsed = new URL(url);
  if (parsed.hostname.replace(/^www\./, '') !== 'github.com') return { ok: true };
  const ref = skillRefFromUrl(url);
  const [owner, name] = parsed.pathname.replace(/^\/+/, '').split('/');
  const asked = ref?.repo ?? (owner && name ? `${owner}/${name.replace(/\.git$/, '')}` : null);
  if (asked === null || !/^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/.test(asked)) {
    return { ok: false, reason: `${url} names no repository` };
  }

  const headers: Record<string, string> = {
    accept: 'application/vnd.github+json',
    'user-agent': 'arp-sponsor',
  };
  if (token !== undefined && token.length > 0) headers.authorization = `Bearer ${token}`;
  const get = (path: string) =>
    fetch(`https://api.github.com/repos/${path}`, {
      headers,
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });

  // The repository first: it answers whether it exists, and its own spelling of its name.
  const repoResponse = await get(asked);
  if (repoResponse.status === 404)
    return { ok: false, reason: `github.com/${asked} does not exist` };
  // A rate limit or an outage says nothing about the repository: thrown, not refused.
  if (!repoResponse.ok) throw new Error(`GitHub answered HTTP ${repoResponse.status} for ${asked}`);
  const { full_name: fullName } = (await repoResponse.json()) as { full_name?: string };
  if (typeof fullName !== 'string') throw new Error(`GitHub gave no full_name for ${asked}`);
  if (ref === null) return { ok: true, fullName };

  const treeResponse = await get(`${fullName}/git/trees/HEAD?recursive=1`);
  if (treeResponse.status === 404 || treeResponse.status === 409) {
    return { ok: false, reason: `github.com/${fullName} is empty` };
  }
  if (!treeResponse.ok)
    throw new Error(`GitHub answered HTTP ${treeResponse.status} for ${fullName}`);
  const tree = (await treeResponse.json()) as {
    tree?: { path: string; type: string; sha: string }[];
  };
  const files: RepositoryFile[] = (tree.tree ?? [])
    .filter((entry) => entry.type === 'blob')
    .map((entry) => ({ path: entry.path, sha: entry.sha }));
  if (resolveContentPath(ref, files).status === 'absent') {
    return { ok: false, reason: `github.com/${fullName} has no SKILL.md for ${ref.skill}` };
  }
  return { ok: true, fullName };
}
