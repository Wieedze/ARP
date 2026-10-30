import { describe, expect, test } from 'bun:test';

import { runSlice, unitsOf, type Store } from '../src/refresh.ts';
import { readRepo, readSkillPage, readTree, shorten } from '../src/sources.ts';
import { handle, type Env } from '../src/worker.ts';

function memoryStore(): Store & { data: Map<string, string>; writes: number } {
  const data = new Map<string, string>();
  const store = {
    data,
    writes: 0,
    async get(key: string) {
      const value = data.get(key);
      return value === undefined ? null : (JSON.parse(value) as unknown);
    },
    async put(key: string, value: string) {
      store.writes += 1;
      data.set(key, value);
    },
  };
  return store;
}

type Route = (url: string) => Response | undefined;
function fakeFetch(...routes: Route[]) {
  const calls: string[] = [];
  const fetcher = async (url: string) => {
    calls.push(url);
    for (const route of routes) {
      const response = route(url);
      if (response !== undefined) return response;
    }
    return new Response('not found', { status: 404 });
  };
  return { fetcher, calls };
}

const repoJson = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers });

const page = (description: string, installs: number) =>
  new Response(
    `<script type="application/ld+json">{"@type":"SoftwareApplication","description":${JSON.stringify(description)},` +
      `"interactionStatistic":{"userInteractionCount":${installs}}}</script>`,
  );

describe('the three reads', () => {
  test('a repository: stars, push date, archived, description', async () => {
    const { fetcher } = fakeFetch(() =>
      repoJson({
        stargazers_count: 12,
        pushed_at: '2026-10-01T00:00:00Z',
        archived: true,
        description: ' x ',
      }),
    );
    expect(await readRepo('a/b', fetcher)).toEqual({
      stars: 12,
      pushedAt: '2026-10-01T00:00:00Z',
      archived: true,
      gone: false,
      description: 'x',
    });
  });

  test('a 404 is a fact — the repository is gone — not a failed read', async () => {
    const { fetcher } = fakeFetch();
    expect(await readRepo('a/b', fetcher)).toMatchObject({ gone: true });
  });

  test('a spent quota is a limited failure', async () => {
    const { fetcher } = fakeFetch(() => repoJson({}, 403, { 'x-ratelimit-remaining': '0' }));
    expect(await readRepo('a/b', fetcher)).toEqual({ error: 'repo a/b: HTTP 403', limited: true });
  });

  test('a tree keeps blobs only, with their sha', async () => {
    const { fetcher } = fakeFetch(() =>
      repoJson({
        tree: [
          { path: 'skills/x/SKILL.md', type: 'blob', sha: 's1' },
          { path: 'skills', type: 'tree', sha: 't' },
        ],
      }),
    );
    expect(await readTree('a/b', fetcher)).toEqual([{ path: 'skills/x/SKILL.md', sha: 's1' }]);
  });

  test('a skill page: the JSON-LD description, unescaped and cut, and the install count', async () => {
    const { fetcher } = fakeFetch(() => page('says "hi"\n' + 'word '.repeat(60), 4100928));
    const fact = await readSkillPage('a/b', 'x', fetcher);
    expect(fact).toMatchObject({ installs: 4100928 });
    expect('description' in fact && fact.description.startsWith('says "hi"')).toBe(true);
    expect('description' in fact && fact.description.endsWith('…')).toBe(true);
  });

  test('a page with no figure has installs null, not zero', async () => {
    const { fetcher } = fakeFetch(() => new Response('<html></html>'));
    expect(await readSkillPage('a/b', 'x', fetcher)).toEqual({ description: '', installs: null });
  });

  test('shorten leaves a short text alone and cuts a long one on a word', () => {
    expect(shorten('short')).toBe('short');
    expect(shorten('a '.repeat(150)).length).toBeLessThanOrEqual(201);
  });
});

const REPOS = [
  { slug: 'o/r', kind: 'skill-repo' },
  { slug: 'o/s', kind: 'mcp-server' },
];
const SKILLS = [
  { repo: 'o/r', skill: 'one' },
  { repo: 'o/r', skill: 'two' },
];
const units = unitsOf(REPOS, SKILLS);

const upstream = () =>
  fakeFetch(
    (url) =>
      url.endsWith('/git/trees/HEAD?recursive=1')
        ? repoJson({
            tree: [
              { path: 'skills/one/SKILL.md', type: 'blob', sha: 'a' },
              { path: 'skills/two/SKILL.md', type: 'blob', sha: 'b' },
              { path: 'other/two/SKILL.md', type: 'blob', sha: 'c' },
            ],
          })
        : undefined,
    (url) =>
      url.startsWith('https://api.github.com/repos/')
        ? repoJson({ stargazers_count: 1, pushed_at: '2026-10-29T00:00:00Z' })
        : undefined,
    (url) => (url.startsWith('https://www.skills.sh/') ? page('d', 7) : undefined),
  );

describe('a refresh cycle, a slice at a time', () => {
  test('two repos, one tree, two pages: five units, in that order', () => {
    expect(units.map((unit) => unit.kind)).toEqual(['repo', 'repo', 'tree', 'page', 'page']);
  });

  test('a slice reads at most its budget and writes each document once', async () => {
    const store = memoryStore();
    const { fetcher, calls } = upstream();
    const first = await runSlice({
      store,
      fetch: fetcher,
      now: () => 0,
      budget: 3,
      pauseMs: 0,
      units,
    });
    expect(first.ran).toBe(3);
    expect(calls).toHaveLength(3);
    expect(store.writes).toBe(4);
    expect(first.state.completedAt).toBeNull();

    const second = await runSlice({
      store,
      fetch: fetcher,
      now: () => 1000,
      budget: 3,
      pauseMs: 0,
      units,
    });
    expect(second.ran).toBe(2);
    expect(second.state.completedAt).not.toBeNull();

    const paths = JSON.parse(store.data.get('paths') ?? '{}') as Record<string, { path: string }>;
    expect(paths['github.com/o/r?skill=one']?.path).toBe('skills/one/SKILL.md');
    // Two different files under one name: no entry, rather than somebody else's file.
    expect(paths['github.com/o/r?skill=two']).toBeUndefined();
  });

  test('a finished cycle idles until the interval has passed, then starts again', async () => {
    const store = memoryStore();
    const { fetcher } = upstream();
    await runSlice({
      store,
      fetch: fetcher,
      now: () => 0,
      budget: 10,
      pauseMs: 0,
      units,
      everyHours: 1,
    });
    expect(
      (
        await runSlice({
          store,
          fetch: fetcher,
          now: () => 1_000,
          pauseMs: 0,
          units,
          everyHours: 1,
        })
      ).idle,
    ).toBe(true);
    const again = await runSlice({
      store,
      fetch: fetcher,
      now: () => 3_600_001,
      budget: 10,
      pauseMs: 0,
      units,
      everyHours: 1,
    });
    expect(again.idle).toBe(false);
    expect(again.ran).toBe(5);
  });

  test('a rate limit stops the slice on the unit, which the next slice retries', async () => {
    const store = memoryStore();
    let limited = true;
    const fetcher = async (url: string) =>
      limited && url.endsWith('/o/s') ? repoJson({}, 429) : repoJson({ stargazers_count: 1 });
    const first = await runSlice({
      store,
      fetch: fetcher,
      now: () => 0,
      budget: 10,
      pauseMs: 0,
      units,
    });
    expect(first.state.cursor).toBe(1);
    expect(first.state.lastErrors).toEqual(['repo o/s: HTTP 429']);
    limited = false;
    const second = await runSlice({
      store,
      fetch: fetcher,
      now: () => 1,
      budget: 1,
      pauseMs: 0,
      units,
    });
    expect(second.state.cursor).toBe(2);
  });

  test('a failed read keeps the previous value', async () => {
    const store = memoryStore();
    const { fetcher } = upstream();
    await runSlice({
      store,
      fetch: fetcher,
      now: () => 0,
      budget: 10,
      pauseMs: 0,
      units,
      everyHours: 1,
    });
    const failing = async () => new Response('down', { status: 500 });
    await runSlice({
      store,
      fetch: failing,
      now: () => 3_600_001,
      budget: 10,
      pauseMs: 0,
      units,
      everyHours: 1,
    });
    const skills = JSON.parse(store.data.get('skills') ?? '{}') as Record<
      string,
      { installs: number }
    >;
    expect(skills['github.com/o/r?skill=one']?.installs).toBe(7);
  });
});

describe('the HTTP surface', () => {
  const env = (store: Store, secret?: string): Env => ({ FACTS: store, REFRESH_SECRET: secret });

  test('GET /facts serves each fact with when it was read, and computes days now', async () => {
    const store = memoryStore();
    await store.put(
      'repos',
      JSON.stringify({
        'github.com/o/r': {
          stars: 3,
          pushedAt: new Date(Date.now() - 2 * 86_400_000).toISOString(),
          archived: false,
          gone: false,
          description: null,
          fetchedAt: '2026-10-30T00:00:00.000Z',
        },
      }),
    );
    const response = await handle(new Request('http://api/facts'), env(store));
    expect(response.headers.get('access-control-allow-origin')).toBe('*');
    const body = (await response.json()) as {
      repos: Record<string, { days: number }>;
      read: { repos: { oldest: string } };
    };
    expect(body.repos['github.com/o/r']?.days).toBe(2);
    expect(body.read.repos.oldest).toBe('2026-10-30T00:00:00.000Z');
  });

  test('POST /refresh is off without a secret, and refused with the wrong one', async () => {
    const store = memoryStore();
    expect(
      (await handle(new Request('http://api/refresh', { method: 'POST' }), env(store))).status,
    ).toBe(404);
    const wrong = new Request('http://api/refresh', {
      method: 'POST',
      headers: { authorization: 'Bearer no' },
    });
    expect((await handle(wrong, env(store, 'yes'))).status).toBe(401);
  });
});
