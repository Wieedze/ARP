/** Pin every catalogued skill repository to the commit it was listed at.
 *
 *      GITHUB_TOKEN=… bun run scripts/build/build-skill-pins.ts            # writes the file
 *      GITHUB_TOKEN=… bun run scripts/build/build-skill-pins.ts --check    # compares, writes nothing
 *
 *  Task 61, deliverable A. Reads `data/catalogue/skills-13579.json` and asks GitHub, per repository,
 *  for the newest commit on the default branch at or before the catalogue's `recordedAt`:
 *  `GET /repos/{repo}/commits?until=<recordedAt>&per_page=1`. Writes
 *  `data/catalogue/skill-pins-13579.json`. The content server serves that commit and nothing else.
 *
 *  A pin is not refreshed by re-running this: `recordedAt` does not move, so the answer does not
 *  either, unless the repository's history was rewritten — which `--check` exists to notice. A newer
 *  upstream commit is a new version, listed by a new record, never by editing this file.
 */
import { readFileSync, writeFileSync } from 'node:fs';

import catalogue from '../../data/catalogue/skills-13579.json';

const OUT = 'data/catalogue/skill-pins-13579.json';
const check = process.argv.includes('--check');

const recordedAt = (catalogue as { recordedAt: string }).recordedAt;
const repos = [
  ...new Set((catalogue as { skills: { repo: string }[] }).skills.map((row) => row.repo)),
].sort();

const headers: Record<string, string> = {
  accept: 'application/vnd.github+json',
  'user-agent': 'arp-pins',
};
const token = process.env['GITHUB_TOKEN']?.trim();
if (token) headers['authorization'] = `Bearer ${token}`;

type Pin = { commit: string; committedAt: string };
const pins: Record<string, Pin> = {};
const failed: string[] = [];
for (const repo of repos) {
  const url = `https://api.github.com/repos/${repo}/commits?until=${encodeURIComponent(recordedAt)}&per_page=1`;
  const response = await fetch(url, { headers });
  if (!response.ok) {
    failed.push(`${repo}: HTTP ${response.status}`);
    continue;
  }
  const [first] = (await response.json()) as {
    sha: string;
    commit: { committer: { date: string } };
  }[];
  if (first === undefined) {
    failed.push(`${repo}: no commit at or before ${recordedAt}`);
    continue;
  }
  pins[repo] = { commit: first.sha, committedAt: first.commit.committer.date };
}

if (failed.length > 0) {
  console.error(
    `no pin for ${failed.length} of ${repos.length} repositories:\n  ${failed.join('\n  ')}`,
  );
  process.exit(1);
}

const out = {
  _note:
    'The commit each catalogued skill repository is served at (task 61, deliverable A). Built by ' +
    'scripts/build/build-skill-pins.ts; do not edit by hand. A newer upstream commit is a new version ' +
    'and needs a new listing, never an edit here.',
  _query:
    'GET /repos/{repo}/commits?until=<listedAt>&per_page=1 — the newest commit on the default branch at the listing time',
  _limits:
    'GitHub filters `until` on the committer date, which whoever commits sets, not on when the commit ' +
    'was pushed. So a pin is the commit GitHub dates at or before the listing, not a record of what ' +
    'the branch held at that second.',
  chainId: (catalogue as { chainId: number }).chainId,
  listedAt: recordedAt,
  repos: pins,
};
const text = `${JSON.stringify(out, null, 2)}\n`;

if (check) {
  const held = readFileSync(OUT, 'utf8');
  if (held !== text) {
    console.error(`${OUT} differs from what GitHub answers now: a pinned history was rewritten`);
    process.exit(1);
  }
  console.log(`${OUT} matches: ${repos.length} repositories`);
} else {
  writeFileSync(OUT, text);
  console.log(`wrote ${OUT}: ${repos.length} repositories pinned at or before ${recordedAt}`);
}
