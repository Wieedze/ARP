/** ARP's one backend: a cache in front of GitHub and skills.sh, never a source.
 *
 *  ```
 *  GET  /facts     every repository's and skill's facts, each with the moment it was read
 *  GET  /healthz   the refresh cycle's state
 *  POST /refresh   one slice now (`?all=1`: until the cycle ends). Off unless REFRESH_SECRET is set
 *  cron            one slice every ten minutes while a cycle runs (`wrangler.jsonc`)
 *  ```
 *
 *  **Why it exists.** The web app used to carry a dated copy of these facts in its bundle, because a
 *  browser cannot read them itself: skills.sh sends no CORS header, and the GitHub API allows 60
 *  requests an hour per visitor's IP and a token must never ship to a browser. A Worker holds the
 *  token, reads on a schedule, and every visitor reads its cache instead of GitHub.
 *
 *  **What it is not.** Not a source of truth and nothing ARP stakes: every value is somebody else's
 *  number, served with the URL family it came from and when it was read, so a reader can check it
 *  without asking us. Chain data does not pass through here — the front reads the indexer itself.
 *
 *  **It holds no key that moves value.** `GITHUB_TOKEN` is a classic token with no scopes: public
 *  read and nothing else.
 */
import { readDocuments, readState, runSlice, type Documents, type Store } from './refresh.ts';

export type Env = {
  FACTS: Store;
  GITHUB_TOKEN?: string;
  REFRESH_SECRET?: string;
  REFRESH_EVERY_HOURS?: string;
};

type ExecutionContext = { waitUntil(promise: Promise<unknown>): void };

const SOURCES = {
  repos: 'api.github.com/repos/{owner}/{repo}',
  paths: 'api.github.com/repos/{owner}/{repo}/git/trees/HEAD?recursive=1',
  skills: 'www.skills.sh/{owner}/{repo}/{skill}, the JSON-LD it publishes for machines',
} as const;

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, OPTIONS',
};

function json(value: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json', ...CORS, ...extra },
  });
}

/** The oldest and newest read in a document, which is what "how fresh is this" honestly means. */
function span(entries: Record<string, { fetchedAt: string }>): {
  oldest: string | null;
  newest: string | null;
} {
  const dates = Object.values(entries)
    .map((entry) => entry.fetchedAt)
    .sort();
  return { oldest: dates[0] ?? null, newest: dates[dates.length - 1] ?? null };
}

/**
 * The answer, in the shapes the front already reads from its bundled copy, plus the dates.
 * `days` is computed now from `pushedAt` — stored, it would be wrong by tomorrow.
 */
export function factsAnswer(docs: Documents, now: number) {
  const repos = Object.fromEntries(
    Object.entries(docs.repos).map(([label, fact]) => [
      label,
      {
        stars: fact.stars,
        days:
          fact.pushedAt === null
            ? null
            : Math.floor((now - Date.parse(fact.pushedAt)) / 86_400_000),
        archived: fact.archived,
        gone: fact.gone,
        description: fact.description,
        fetchedAt: fact.fetchedAt,
      },
    ]),
  );
  const paths = Object.fromEntries(
    Object.entries(docs.paths).map(([label, entry]) => [label, entry.path]),
  );
  return {
    sources: SOURCES,
    read: { repos: span(docs.repos), skills: span(docs.skills), paths: span(docs.paths) },
    repos,
    skills: docs.skills,
    paths,
  };
}

function everyHours(env: Env): number {
  const value = Number(env.REFRESH_EVERY_HOURS ?? '24');
  return Number.isFinite(value) && value > 0 ? value : 24;
}

export async function handle(
  request: Request,
  env: Env,
  fetcher: typeof fetch = fetch,
): Promise<Response> {
  const url = new URL(request.url);

  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

  if (request.method === 'GET' && url.pathname === '/healthz') {
    return json({ ok: true, state: await readState(env.FACTS) });
  }

  if (request.method === 'GET' && url.pathname === '/facts') {
    // Five minutes at the edge and in the browser: the data moves once a day at most.
    return json(factsAnswer(await readDocuments(env.FACTS), Date.now()), 200, {
      'cache-control': 'public, max-age=300',
    });
  }

  if (request.method === 'POST' && url.pathname === '/refresh') {
    const secret = env.REFRESH_SECRET?.trim();
    if (!secret) return json({ error: 'refresh is disabled: REFRESH_SECRET is not set' }, 404);
    if (request.headers.get('authorization') !== `Bearer ${secret}`)
      return json({ error: 'unauthorised' }, 401);
    const all = url.searchParams.get('all') === '1';
    let result = await runSlice({
      store: env.FACTS,
      fetch: fetcher,
      now: Date.now,
      githubToken: env.GITHUB_TOKEN,
      everyHours: everyHours(env),
    });
    // `all` runs slices back to back, which only makes sense where there is no subrequest ceiling —
    // `wrangler dev`. Bounded, so a cycle stuck on a rate limit returns instead of spinning.
    for (
      let slices = 1;
      all && !result.idle && result.state.completedAt === null && slices < 40;
      slices += 1
    ) {
      if (result.ran === 0) break;
      result = await runSlice({
        store: env.FACTS,
        fetch: fetcher,
        now: Date.now,
        githubToken: env.GITHUB_TOKEN,
        everyHours: everyHours(env),
      });
    }
    return json(result);
  }

  return json({ error: 'GET /facts, GET /healthz, or POST /refresh' }, 404);
}

export default {
  fetch(request: Request, env: Env): Promise<Response> {
    return handle(request, env);
  },
  scheduled(_controller: unknown, env: Env, context: ExecutionContext): void {
    context.waitUntil(
      runSlice({
        store: env.FACTS,
        fetch,
        now: Date.now,
        githubToken: env.GITHUB_TOKEN,
        everyHours: everyHours(env),
      }),
    );
  },
};
