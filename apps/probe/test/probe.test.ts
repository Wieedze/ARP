import { describe, expect, test } from 'bun:test';

import { read } from '../src/probe.ts';
import { memoryReadings } from '../src/store.ts';
import type { Target } from '../src/targets.ts';
import { TARGETS } from '../src/targets.ts';
import { handle, runCycle } from '../src/worker.ts';

const endpoint: Target = {
  label: 'mcp.example.com/mcp',
  kind: 'endpoint',
  repo: 'o/r',
  url: 'https://mcp.example.com/mcp',
};
const npm: Target = {
  label: 'npmjs.com/package/@o/server',
  kind: 'npm',
  repo: 'o/r',
  url: 'https://npmjs.com/package/@o/server',
};
const pypi: Target = {
  label: 'pypi.org/project/server',
  kind: 'pypi',
  repo: 'o/r',
  url: 'https://pypi.org/project/server',
};

function answering(response: () => Response): typeof fetch {
  return (async () => response()) as unknown as typeof fetch;
}

let clock = 1_800_000_000_000;
const now = () => (clock += 25);

describe('an endpoint', () => {
  test('a JSON-RPC result to initialize answers', async () => {
    const reading = await read(
      endpoint,
      answering(() => Response.json({ jsonrpc: '2.0', id: 1, result: { serverInfo: {} } })),
      now,
    );
    expect(reading.outcome).toBe('answers');
    expect(reading.http).toBe(200);
    expect(reading.ms).toBe(25);
  });

  test('a result inside an SSE stream answers too', async () => {
    const body = 'event: message\ndata: {"jsonrpc":"2.0","id":1,"result":{}}\n\n';
    const reading = await read(
      endpoint,
      answering(() => new Response(body, { headers: { 'content-type': 'text/event-stream' } })),
      now,
    );
    expect(reading.outcome).toBe('answers');
  });

  test('a 401 naming its OAuth metadata is an MCP server asking for auth, not a failure', async () => {
    const headers = {
      'www-authenticate':
        'Bearer resource_metadata="https://mcp.example.com/.well-known/oauth-protected-resource"',
    };
    const reading = await read(
      endpoint,
      answering(() => new Response('no', { status: 401, headers })),
      now,
    );
    expect(reading.outcome).toBe('asks-for-auth');
  });

  test('a bare 401 refuses, and is not taken for an MCP server', async () => {
    const reading = await read(
      endpoint,
      answering(() => new Response('no', { status: 401 })),
      now,
    );
    expect(reading.outcome).toBe('refuses');
  });

  test('a 200 with no JSON-RPC result is not MCP', async () => {
    const reading = await read(
      endpoint,
      answering(() => new Response('<html>docs</html>')),
      now,
    );
    expect(reading.outcome).toBe('not-mcp');
  });

  test('a network failure is no answer, and the body is never kept', async () => {
    const failing = (async () => {
      throw new TypeError('fetch failed');
    }) as unknown as typeof fetch;
    const reading = await read(endpoint, failing, now);
    expect(reading).toMatchObject({ outcome: 'no-answer', http: null, detail: 'TypeError' });
  });

  test('a 500 is an http error with its status', async () => {
    const reading = await read(
      endpoint,
      answering(() => new Response('boom', { status: 500 })),
      now,
    );
    expect(reading).toMatchObject({ outcome: 'http-error', http: 500, detail: null });
  });
});

describe('a package', () => {
  test('npm: the latest version and the date, and a deprecated latest says so', async () => {
    const record = {
      'dist-tags': { latest: '1.2.0' },
      modified: '2026-10-01T00:00:00Z',
      versions: { '1.2.0': {} },
    };
    expect(
      JSON.parse(
        (
          await read(
            npm,
            answering(() => Response.json(record)),
            now,
          )
        ).detail ?? '',
      ),
    ).toEqual({
      version: '1.2.0',
      modified: '2026-10-01T00:00:00Z',
    });
    const deprecated = { ...record, versions: { '1.2.0': { deprecated: 'use @o/other' } } };
    expect(
      (
        await read(
          npm,
          answering(() => Response.json(deprecated)),
          now,
        )
      ).outcome,
    ).toBe('deprecated');
  });

  test('npm: the scoped name is escaped in the registry URL', async () => {
    let asked = '';
    const recording = (async (url: string) => {
      asked = url;
      return Response.json({ 'dist-tags': { latest: '1.0.0' }, versions: { '1.0.0': {} } });
    }) as unknown as typeof fetch;
    await read(npm, recording, now);
    expect(asked).toBe('https://registry.npmjs.org/@o%2fserver');
  });

  test('pypi: a missing project is not found', async () => {
    expect(
      (
        await read(
          pypi,
          answering(() => new Response('', { status: 404 })),
          now,
        )
      ).outcome,
    ).toBe('not-found');
  });

  test('pypi: an unparseable record is a failed read, not a thrown cycle', async () => {
    expect(
      (
        await read(
          pypi,
          answering(() => new Response('not json')),
          now,
        )
      ).outcome,
    ).toBe('no-answer');
  });
});

describe('the service', () => {
  test('a cycle appends one reading per target, and /probe serves them per target', async () => {
    const store = memoryReadings();
    const fetcher = answering(() => new Response('', { status: 401 }));
    await runCycle([endpoint, npm], store, fetcher, now);
    expect(store.rows).toHaveLength(2);

    const response = await handle(new Request('https://probe.test/probe'), store, () => clock);
    const body = (await response.json()) as { measuredBy: string; targets: { label: string }[] };
    expect(body.measuredBy).toBe('ARP, from Cloudflare');
    expect(body.targets.map((target) => target.label)).toEqual(
      TARGETS.map((target) => target.label),
    );
  });

  test('the window is capped at 30 days', async () => {
    const response = await handle(
      new Request('https://probe.test/probe?days=400'),
      memoryReadings(),
      () => clock,
    );
    expect(((await response.json()) as { window: { days: number } }).window.days).toBe(30);
  });

  test('the bundled list holds the eight packages and the candidate endpoints, Zapier excluded', () => {
    expect(TARGETS.filter((target) => target.kind !== 'endpoint')).toHaveLength(8);
    expect(TARGETS.some((target) => target.url.includes('zapier'))).toBe(false);
  });
});
