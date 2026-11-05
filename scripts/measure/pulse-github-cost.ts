/** How many of GitHub's hourly requests one `arp_pulse` search costs a person with no token.
 *
 *      bun run scripts/measure/pulse-github-cost.ts [--json data/measurements/pulse-github-cost-<date>.json]
 *      bun run scripts/measure/pulse-github-cost.ts --live [first recorded result]
 *
 *  Offline, it replays the searches recorded in `data/measurements/pulse-read-2026-11-05.json` against a stub
 *  that answers every request and counts those on `api.github.com`, so the figure is what the code asks for and
 *  spends no quota. `before` is what `arp_pulse` did until 2026-11-05: the whole window, with each repository's
 *  figures. `after` is `readWindow` with no token, on a first search and on the same search again with a cache.
 *  `--live` reads one window of recorded results from GitHub with no token, and reads the remaining quota before and
 *  after. It runs no search package.
 */
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import recorded from '../../data/measurements/pulse-read-2026-11-05.json';
import { diskListingCache } from '../../apps/mcp/src/pulse-cache.ts';
import { readWindow } from '../../apps/mcp/src/pulse-window.ts';
import { githubPulseSource, readPulse, type SkillSearchResult } from '../../packages/protocol/src/pulse.ts';

const LIMIT = 5;
const WINDOW = Math.min(LIMIT * 3, 30);
const HOURLY = 60;

function stub() {
  let api = 0;
  const fetcher = (async (input: string | URL | Request) => {
    const url = String(input);
    if (url.startsWith('https://api.github.com/')) {
      api += 1;
      if (url.includes('/git/trees/')) {
        const repo = url.split('/repos/')[1]?.split('/git/')[0] ?? '';
        const names = rowsByRepo.get(repo) ?? [];
        return Response.json({
          sha: repo,
          tree: names.flatMap((name) => [
            { path: `skills/${name}`, type: 'tree', sha: `${repo}-${name}` },
            { path: `skills/${name}/SKILL.md`, type: 'blob', sha: `${repo}-${name}-file`, size: 10 },
          ]),
        });
      }
      return Response.json({ stargazers_count: 1, pushed_at: null, archived: false });
    }
    const name = url.split('/').at(-2) ?? '';
    return new Response(`---\nname: ${decodeURIComponent(name)}\n---\nbody`);
  }) as typeof fetch; // the stub answers the three URLs the reader asks for
  return { fetcher, count: () => api };
}

const rows = (recorded as unknown as { pulses: (SkillSearchResult & { query?: string })[] }).pulses; // this repo's own file
const rowsByRepo = new Map<string, string[]>();
for (const row of rows) rowsByRepo.set(row.source, [...(rowsByRepo.get(row.source) ?? []), row.skill]);
const github = rows.filter((row) => /^[\w.-]+\/[\w.-]+$/.test(row.source));
// Consecutive windows of the recorded results stand for separate searches.
const searches: SkillSearchResult[][] = [];
for (let at = 0; at + WINDOW <= github.length; at += WINDOW) searches.push(github.slice(at, at + WINDOW));

const never = () => false;
const measured: { before: number; after: number; afterSameSearchAgain: number }[] = [];
for (const search of searches) {
  const old = stub();
  const oldSource = githubPulseSource({ fetch: old.fetcher });
  await Promise.all(search.map((row) => readPulse(row, oldSource)));

  const fresh = stub();
  const cache = diskListingCache(mkdtempSync(join(tmpdir(), 'arp-cost-')));
  const first = githubPulseSource({ fetch: fresh.fetcher, withRepository: false, cache });
  await readWindow(search, first, { limit: LIMIT, hasToken: false, setAside: never });
  const firstCount = fresh.count();
  const again = githubPulseSource({ fetch: fresh.fetcher, withRepository: false, cache });
  await readWindow(search, again, { limit: LIMIT, hasToken: false, setAside: never });
  measured.push({ before: old.count(), after: firstCount, afterSameSearchAgain: fresh.count() - firstCount });
}
const mean = (key: 'before' | 'after' | 'afterSameSearchAgain') =>
  measured.reduce((sum, row) => sum + row[key], 0) / measured.length;
const summary = {
  at: new Date().toISOString(),
  searchesReplayed: measured.length,
  limit: LIMIT,
  hourlyQuotaWithNoToken: HOURLY,
  apiRequestsPerSearch: { before: mean('before'), after: mean('after'), afterSameSearchAgain: mean('afterSameSearchAgain') },
  worst: { before: Math.max(...measured.map((row) => row.before)), after: Math.max(...measured.map((row) => row.after)) },
  searchesPerHour: {
    before: Math.floor(HOURLY / mean('before')),
    after: Math.floor(HOURLY / mean('after')),
  },
};
console.log(JSON.stringify(summary, null, 1));

const remaining = async () => {
  const response = await fetch('https://api.github.com/rate_limit', { headers: { 'user-agent': 'arp-pulse' } });
  const body = (await response.json()) as { resources: { core: { remaining: number; limit: number; reset: number } } }; // GitHub's shape
  return body.resources.core;
};
const liveAt = process.argv.indexOf('--live');
if (liveAt !== -1) {
  // Recorded results, so this runs no search package: it measures what reading a search's results costs.
  const start = Number(process.argv[liveAt + 1] ?? 0);
  const results = github.slice(start, start + WINDOW);
  const home = mkdtempSync(join(tmpdir(), 'arp-cost-live-'));
  const before = await remaining();
  const source = githubPulseSource({ withRepository: false, cache: diskListingCache(join(home, 'cache')) });
  const pulses = await readWindow(results, source, { limit: LIMIT, hasToken: false, setAside: never });
  const after = await remaining();
  const statuses: Record<string, number> = {};
  for (const pulse of pulses) statuses[pulse.status] = (statuses[pulse.status] ?? 0) + 1;
  console.log(JSON.stringify({ live: `recorded results from ${start}`, results: results.length, read: pulses.length, statuses, before, after, quota: source.quota?.() }, null, 1));
}
const jsonAt = process.argv.indexOf('--json');
if (jsonAt !== -1 && process.argv[jsonAt + 1]) writeFileSync(process.argv[jsonAt + 1] as string, `${JSON.stringify({ summary, measured }, null, 1)}\n`);
