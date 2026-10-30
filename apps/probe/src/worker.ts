/** The probe: whether each remote MCP endpoint answers, and what each package's registry says.
 *
 *  ```
 *  GET  /probe            every target's latest reading, and its last 24 hours
 *  GET  /probe?days=7     the same over 7 days (at most 30)
 *  GET  /healthz          how many targets, and when the last cycle ran
 *  cron                   one cycle every five minutes (`wrangler.jsonc`)
 *  ```
 *
 *  **What it is.** A dated fact measured by ARP: "this server answered ARP from Cloudflare at
 *  14:10". It is not the pulse — whether a tool works for the operators who use it comes from their
 *  signed reports and the `uses` triples (ADR `0089`). A server can answer `initialize` and fail
 *  every real call.
 *
 *  **What it is not.** Never written on chain, never a score, never a colour. It holds no key and
 *  sends nothing but one `initialize` per endpoint and one registry read per package.
 */
import { read, type Reading } from './probe.ts';
import { d1Readings, type D1Like, type Readings } from './store.ts';
import { TARGETS, type Target } from './targets.ts';

export type Env = { PROBES: D1Like };

type ExecutionContext = { waitUntil(promise: Promise<unknown>): void };

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

/** One cycle: every target, in parallel — each read has its own timeout, so one slow host holds nobody. */
export async function runCycle(
  targets: readonly Target[],
  store: Readings,
  fetcher: typeof fetch,
  now: () => number,
): Promise<Reading[]> {
  const readings = await Promise.all(targets.map((target) => read(target, fetcher, now)));
  await store.append(readings);
  return readings;
}

/** Per target: the latest reading, and the history over the window, oldest first. */
export function probeAnswer(targets: readonly Target[], rows: readonly Reading[], days: number) {
  return {
    measuredBy: 'ARP, from Cloudflare',
    window: { days },
    targets: targets.map((target) => {
      const history = rows.filter((row) => row.target === target.label);
      return {
        label: target.label,
        kind: target.kind,
        repo: target.repo,
        latest: history[history.length - 1] ?? null,
        history: history.map(({ at, outcome, http, ms }) => ({ at, outcome, http, ms })),
      };
    }),
  };
}

export async function handle(
  request: Request,
  store: Readings,
  now: () => number = Date.now,
): Promise<Response> {
  const url = new URL(request.url);

  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

  if (request.method === 'GET' && url.pathname === '/probe') {
    const asked = Number(url.searchParams.get('days') ?? '1');
    const days = Number.isFinite(asked) && asked > 0 ? Math.min(asked, 30) : 1;
    const rows = await store.since(new Date(now() - days * 86_400_000).toISOString());
    // A minute at the edge: a cycle lands every five.
    return json(probeAnswer(TARGETS, rows, days), 200, { 'cache-control': 'public, max-age=60' });
  }

  if (request.method === 'GET' && url.pathname === '/healthz') {
    const rows = await store.since(new Date(now() - 3_600_000).toISOString());
    return json({
      ok: true,
      targets: TARGETS.length,
      lastReading: rows[rows.length - 1]?.at ?? null,
    });
  }

  return json({ error: 'GET /probe or GET /healthz' }, 404);
}

export default {
  fetch(request: Request, env: Env): Promise<Response> {
    return handle(request, d1Readings(env.PROBES));
  },
  scheduled(_controller: unknown, env: Env, context: ExecutionContext): void {
    context.waitUntil(runCycle(TARGETS, d1Readings(env.PROBES), fetch, Date.now));
  },
};
