/** How many catalogued skills the content route can serve at their pinned commit.
 *
 *      GITHUB_TOKEN=… bun run scripts/measure/skill-paths-at-pin.ts
 *      GITHUB_TOKEN=… bun run scripts/measure/skill-paths-at-pin.ts --json data/measurements/skill-paths-at-pin-<date>.json
 *
 *  Task 61. The content route resolves a skill with `resolveContentPath` against the repository's
 *  listing at the commit in `data/catalogue/skill-pins-13579.json`. This runs that same resolver
 *  against the same listing, one GitHub tree request per repository — 31 — and counts the
 *  outcomes. `skill-layouts.ts` measured the same question at `HEAD` on 2026-10-29.
 */
import { writeFileSync } from 'node:fs';

import {
  resolveContentPath,
  type RepositoryFile,
} from '../../packages/protocol/src/content-path.js';
import catalogue from '../../data/catalogue/skills-13579.json';
import pins from '../../data/catalogue/skill-pins-13579.json';

const jsonOut = process.argv.indexOf('--json');
const headers: Record<string, string> = {
  accept: 'application/vnd.github+json',
  'user-agent': 'arp-measure',
};
const token = process.env['GITHUB_TOKEN']?.trim();
if (token) headers['authorization'] = `Bearer ${token}`;

const skills = (catalogue as { skills: { repo: string; skill: string }[] }).skills;
const repos = (pins as { repos: Record<string, { commit: string }> }).repos;

const listings = new Map<string, RepositoryFile[]>();
for (const repo of [...new Set(skills.map((s) => s.repo))]) {
  const commit = repos[repo]?.commit;
  if (commit === undefined) continue;
  const response = await fetch(
    `https://api.github.com/repos/${repo}/git/trees/${commit}?recursive=1`,
    { headers },
  );
  if (!response.ok) throw new Error(`${repo}@${commit}: HTTP ${response.status}`);
  const tree = (await response.json()) as {
    tree?: { path: string; type: string; sha: string }[];
    truncated?: boolean;
  };
  if (tree.truncated === true) throw new Error(`${repo}@${commit}: the tree listing was truncated`);
  listings.set(
    repo,
    (tree.tree ?? []).filter((e) => e.type === 'blob').map((e) => ({ path: e.path, sha: e.sha })),
  );
}

const rows = skills.map(({ repo, skill }) => {
  const listing = listings.get(repo);
  if (listing === undefined) return { repo, skill, status: 'unpinned' as const };
  const resolved = resolveContentPath({ repo, skill }, listing);
  return {
    repo,
    skill,
    status: resolved.status,
    ...(resolved.status === 'resolved' ? { path: resolved.path } : {}),
  };
});

const counts: Record<string, number> = {};
for (const row of rows) counts[row.status] = (counts[row.status] ?? 0) + 1;
console.log(`skills ${rows.length}, repositories ${listings.size}`);
for (const [status, n] of Object.entries(counts).sort()) console.log(`  ${status.padEnd(10)} ${n}`);

if (jsonOut !== -1) {
  const path = process.argv[jsonOut + 1];
  if (path === undefined) throw new Error('--json needs a path');
  writeFileSync(
    path,
    `${JSON.stringify(
      {
        measuredAt: new Date().toISOString(),
        source:
          'api.github.com/repos/{repo}/git/trees/{pinned commit}?recursive=1, resolved with resolveContentPath',
        pins: 'data/catalogue/skill-pins-13579.json',
        counts,
        rows,
      },
      null,
      2,
    )}\n`,
  );
  console.log(`wrote ${path}`);
}
