/** Whether a tool URL exists where it says, for `POST /list-tool` (ADR `0120`).
 *
 *  A GitHub URL is checked against GitHub's API: the repository's tree, and for a skill
 *  (`?skill=<s>`) a SKILL.md in a directory of that name (`resolveContentPath`, the same rule the
 *  content server serves by). One request per check, unauthenticated unless `GITHUB_TOKEN` is set,
 *  so GitHub's 60 an hour per IP is the bound without one.
 *
 *  **Any other URL is accepted unchecked.** Fetching an arbitrary URL from the process that holds
 *  the treasury key would let a caller point it at the local network. The daily caps bound what an
 *  invented URL costs.
 */
import { resolveContentPath, skillRefFromUrl, type RepositoryFile } from '@arp-protocol/core';

const FETCH_TIMEOUT_MS = 10_000;

export type ToolResolution = { ok: true } | { ok: false; reason: string };

export async function resolveOnGitHub(
  url: string,
  token = process.env.GITHUB_TOKEN?.trim(),
): Promise<ToolResolution> {
  const parsed = new URL(url);
  if (parsed.hostname.replace(/^www\./, '') !== 'github.com') return { ok: true };
  const ref = skillRefFromUrl(url);
  const [owner, name] = parsed.pathname.replace(/^\/+/, '').split('/');
  const repo = ref?.repo ?? (owner && name ? `${owner}/${name}` : null);
  if (repo === null) return { ok: false, reason: `${url} names no repository` };

  const headers: Record<string, string> = {
    accept: 'application/vnd.github+json',
    'user-agent': 'arp-sponsor',
  };
  if (token !== undefined && token.length > 0) headers.authorization = `Bearer ${token}`;
  const response = await fetch(`https://api.github.com/repos/${repo}/git/trees/HEAD?recursive=1`, {
    headers,
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (response.status === 404 || response.status === 409) {
    return { ok: false, reason: `github.com/${repo} does not exist or is empty` };
  }
  // A rate limit or an outage says nothing about the repository: thrown, not refused.
  if (!response.ok) throw new Error(`GitHub answered HTTP ${response.status} for ${repo}`);
  if (ref === null) return { ok: true };

  const tree = (await response.json()) as { tree?: { path: string; type: string; sha: string }[] };
  const files: RepositoryFile[] = (tree.tree ?? [])
    .filter((entry) => entry.type === 'blob')
    .map((entry) => ({ path: entry.path, sha: entry.sha }));
  const found = resolveContentPath(ref, files);
  if (found.status === 'absent') {
    return { ok: false, reason: `github.com/${repo} has no SKILL.md for ${ref.skill}` };
  }
  return { ok: true };
}
