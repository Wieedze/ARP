/** One reading of one target. Pure apart from the `fetch` it is handed, so a test drives it.
 *
 *  **An endpoint** gets one MCP `initialize`, the first message any client sends. Nothing after it:
 *  no `tools/list`, no call. What comes back is classified, never stored — a body can carry
 *  anything, and this service keeps a fact about the server, not what the server said.
 *
 *  **A package** cannot be probed: `npx` runs on the operator's machine. So it gets its registry's
 *  record instead — the latest version, when it was published, and whether it is deprecated.
 *
 *  Neither outcome is good or bad here. `asks-for-auth` is a server answering; `no-answer` is a
 *  read that failed from Cloudflare at that minute. The page states which, and when (ADR `0089`).
 */
import type { Target } from './targets.ts';

export type Outcome =
  | 'answers' // an endpoint returned a JSON-RPC result to `initialize`
  | 'asks-for-auth' // 401 with the MCP authorization spec's `resource_metadata`: an MCP server behind OAuth
  | 'refuses' // 401 or 403 without it: something answered, nothing says it is MCP
  | 'http-error' // any other status
  | 'not-mcp' // 2xx, but no JSON-RPC result in the body
  | 'no-answer' // network failure or timeout
  | 'published' // a registry has the package
  | 'deprecated' // a registry has it, marked deprecated
  | 'not-found'; // a registry has no such package

export type Reading = {
  target: string;
  kind: Target['kind'];
  at: string;
  outcome: Outcome;
  http: number | null;
  ms: number;
  detail: string | null;
};

const TIMEOUT_MS = 10_000;

const INITIALIZE = JSON.stringify({
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: {
    protocolVersion: '2025-06-18',
    capabilities: {},
    clientInfo: { name: 'arp-probe', version: '0.0.1' },
  },
});

/** A JSON-RPC result, either as a JSON body or as one `data:` line of an SSE stream. */
function hasResult(body: string): boolean {
  const candidates = [
    body,
    ...body
      .split('\n')
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5)),
  ];
  return candidates.some((text) => {
    try {
      const parsed = JSON.parse(text) as { jsonrpc?: unknown; result?: unknown };
      return parsed.jsonrpc === '2.0' && parsed.result !== undefined;
    } catch {
      return false;
    }
  });
}

async function readEndpoint(
  target: Target,
  fetcher: typeof fetch,
): Promise<Omit<Reading, 'at' | 'ms'>> {
  const base = { target: target.label, kind: target.kind };
  let response: Response;
  try {
    response = await fetcher(target.url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
      },
      body: INITIALIZE,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    return {
      ...base,
      outcome: 'no-answer',
      http: null,
      detail: error instanceof Error ? error.name : 'unknown',
    };
  }
  const http = response.status;
  if (http === 401 || http === 403) {
    await response.body?.cancel();
    // The MCP authorization spec has a protected server name its metadata in this header. A bare
    // 401 is any API closed to anonymous callers, and reading it as an MCP server would be a guess.
    const isMcpAuth = /resource_metadata=/i.test(response.headers.get('www-authenticate') ?? '');
    return { ...base, outcome: isMcpAuth ? 'asks-for-auth' : 'refuses', http, detail: null };
  }
  if (!response.ok) {
    await response.body?.cancel();
    return { ...base, outcome: 'http-error', http, detail: null };
  }
  // A stream that stays open would hold the read until the timeout; the first result is enough.
  const body = await response.text();
  return { ...base, outcome: hasResult(body) ? 'answers' : 'not-mcp', http, detail: null };
}

async function readNpm(target: Target, fetcher: typeof fetch): Promise<Omit<Reading, 'at' | 'ms'>> {
  const name = target.label.slice('npmjs.com/package/'.length);
  const base = { target: target.label, kind: target.kind };
  const response = await fetcher(`https://registry.npmjs.org/${name.replace('/', '%2f')}`, {
    // The abbreviated document: dist-tags, `modified`, and each version's `deprecated`, without readmes.
    headers: { accept: 'application/vnd.npm.install-v1+json' },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (response.status === 404) return { ...base, outcome: 'not-found', http: 404, detail: null };
  if (!response.ok) return { ...base, outcome: 'http-error', http: response.status, detail: null };
  const record = (await response.json()) as {
    'dist-tags'?: { latest?: string };
    modified?: string;
    versions?: Record<string, { deprecated?: string }>;
  };
  const latest = record['dist-tags']?.latest ?? null;
  const deprecated = latest !== null && record.versions?.[latest]?.deprecated !== undefined;
  return {
    ...base,
    outcome: deprecated ? 'deprecated' : 'published',
    http: response.status,
    detail: JSON.stringify({ version: latest, modified: record.modified ?? null }),
  };
}

async function readPypi(
  target: Target,
  fetcher: typeof fetch,
): Promise<Omit<Reading, 'at' | 'ms'>> {
  const name = target.label.slice('pypi.org/project/'.length);
  const base = { target: target.label, kind: target.kind };
  const response = await fetcher(`https://pypi.org/pypi/${name}/json`, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (response.status === 404) return { ...base, outcome: 'not-found', http: 404, detail: null };
  if (!response.ok) return { ...base, outcome: 'http-error', http: response.status, detail: null };
  const record = (await response.json()) as {
    info?: { version?: string; yanked?: boolean };
    urls?: { upload_time_iso_8601?: string }[];
  };
  return {
    ...base,
    outcome: record.info?.yanked === true ? 'deprecated' : 'published',
    http: response.status,
    detail: JSON.stringify({
      version: record.info?.version ?? null,
      modified: record.urls?.[0]?.upload_time_iso_8601 ?? null,
    }),
  };
}

export async function read(
  target: Target,
  fetcher: typeof fetch,
  now: () => number,
): Promise<Reading> {
  const started = now();
  let partial: Omit<Reading, 'at' | 'ms'>;
  try {
    partial =
      target.kind === 'endpoint'
        ? await readEndpoint(target, fetcher)
        : target.kind === 'npm'
          ? await readNpm(target, fetcher)
          : await readPypi(target, fetcher);
  } catch (error) {
    // A registry that times out or sends something unparseable: the read failed, the target did not.
    partial = {
      target: target.label,
      kind: target.kind,
      outcome: 'no-answer',
      http: null,
      detail: error instanceof Error ? error.name : 'unknown',
    };
  }
  const finished = now();
  return { ...partial, at: new Date(finished).toISOString(), ms: finished - started };
}
