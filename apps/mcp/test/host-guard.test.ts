import { probeEndpoint, type FetchLike, type ResolveHost } from '@arp-protocol/core';
import { describe, expect, it } from 'vitest';

import { hostGuard } from '../src/host-guard.js';
import { readRegistrationDocument } from '../src/registration-document.js';

/** A stub resolver: `public.example` is public, `inside.example` points at the metadata service. */
const resolveHost: ResolveHost = async (hostname) => {
  if (hostname === 'public.example') return ['93.184.216.34'];
  if (hostname === 'inside.example') return ['93.184.216.34', '169.254.169.254'];
  throw new Error(`stub resolver: unknown host ${hostname}`);
};

/** Records every URL it was asked for, and answers with what `route` returns. */
function recordingFetch(route: (url: string) => Response): { fetch: FetchLike; asked: string[] } {
  const asked: string[] = [];
  return {
    asked,
    fetch: async (input) => {
      const url = String(input);
      asked.push(url);
      return route(url);
    },
  };
}

const DOCUMENT = { name: 'agent', endpoints: [] };

describe('hostGuard', () => {
  it('resolves every name by default, and resolves nothing once private probes are allowed', () => {
    expect(hostGuard({}, resolveHost)).toEqual({ allowPrivate: false, resolveHost });
    expect(hostGuard({ ARP_ALLOW_PRIVATE_PROBE: '1' }, resolveHost)).toEqual({
      allowPrivate: true,
    });
  });
});

describe('readRegistrationDocument', () => {
  it('reads a document from a public name', async () => {
    const { fetch, asked } = recordingFetch(() => Response.json(DOCUMENT));
    const read = await readRegistrationDocument('https://public.example/agent.json', {
      fetch,
      guard: hostGuard({}, resolveHost),
    });
    expect(read).toEqual({ status: 'read', document: DOCUMENT });
    expect(asked).toEqual(['https://public.example/agent.json']);
  });

  it('refuses a public name that resolves to a private address, and sends nothing', async () => {
    const { fetch, asked } = recordingFetch(() => Response.json(DOCUMENT));
    const read = await readRegistrationDocument('https://inside.example/agent.json', {
      fetch,
      guard: hostGuard({}, resolveHost),
    });
    expect(read.status).toBe('refused');
    expect(read.status === 'refused' && read.reason).toMatch(/resolves to 169\.254\.169\.254/);
    expect(asked).toEqual([]);
  });

  it('refuses a redirect to such a name before following it', async () => {
    const { fetch, asked } = recordingFetch((url) =>
      url.startsWith('https://public.example')
        ? new Response(null, { status: 302, headers: { location: 'https://inside.example/x' } })
        : Response.json(DOCUMENT),
    );
    const read = await readRegistrationDocument('https://public.example/agent.json', {
      fetch,
      guard: hostGuard({}, resolveHost),
    });
    expect(read.status).toBe('refused');
    expect(asked).toEqual(['https://public.example/agent.json']);
  });

  it('fetches the same name when ARP_ALLOW_PRIVATE_PROBE=1', async () => {
    const { fetch } = recordingFetch(() => Response.json(DOCUMENT));
    const read = await readRegistrationDocument('https://inside.example/agent.json', {
      fetch,
      guard: hostGuard({ ARP_ALLOW_PRIVATE_PROBE: '1' }, resolveHost),
    });
    expect(read).toEqual({ status: 'read', document: DOCUMENT });
  });

  it('decodes an inline data: document without fetching or resolving anything', async () => {
    const { fetch, asked } = recordingFetch(() => Response.json({}));
    const file = `data:application/json,${encodeURIComponent(JSON.stringify(DOCUMENT))}`;
    const read = await readRegistrationDocument(file, {
      fetch,
      guard: hostGuard({}, async () => {
        throw new Error('resolved a data: URI');
      }),
    });
    expect(read).toEqual({ status: 'read', document: DOCUMENT });
    expect(asked).toEqual([]);
  });

  it('reports a 3xx with no Location and a non-2xx as unreadable', async () => {
    const guard = hostGuard({}, resolveHost);
    const bare = await readRegistrationDocument('https://public.example/a', {
      fetch: async () => new Response(null, { status: 302 }),
      guard,
    });
    expect(bare).toEqual({
      status: 'unreadable',
      reason: 'the host answered 302 with no Location header',
    });
    const missing = await readRegistrationDocument('https://public.example/a', {
      fetch: async () => new Response('no', { status: 404 }),
      guard,
    });
    expect(missing).toEqual({ status: 'unreadable', reason: 'the host answered 404' });
  });
});

describe('the probe, with the same guard', () => {
  it('refuses an endpoint whose name resolves to a private address, and sends nothing', async () => {
    const { fetch, asked } = recordingFetch(() => Response.json({}));
    const outcome = await probeEndpoint(
      {
        declaredUnder: 'endpoints',
        name: 'mcp',
        protocol: 'mcp',
        version: null,
        capabilities: [],
        classification: {
          status: 'probeable',
          url: 'https://inside.example/mcp',
          declared: 'https://inside.example/mcp',
        },
      },
      { fetch, ...hostGuard({}, resolveHost) },
    );
    expect(JSON.stringify(outcome)).toMatch(/refused/);
    expect(asked).toEqual([]);
  });
});

describe('readRegistrationDocument on an ipfs document', () => {
  const guard = { allowPrivate: false, resolveHost: async () => ['93.184.216.34'] };

  it('asks the next gateway when one refuses', async () => {
    const urls: string[] = [];
    const read = await readRegistrationDocument('ipfs://cid', {
      guard,
      fetch: (async (url: string) => {
        urls.push(url);
        return urls.length === 1 ? new Response('no', { status: 429 }) : Response.json({ name: 'agent' });
      }) as never, // the two-argument fetch, this stub reads the first
    });
    expect(read).toEqual({ status: 'read', document: { name: 'agent' } });
    expect(urls).toEqual(['https://gateway.pinata.cloud/ipfs/cid', 'https://ipfs.io/ipfs/cid']);
  });

  it('says it could not read when no gateway serves it', async () => {
    const read = await readRegistrationDocument('ipfs://cid', {
      guard,
      fetch: (async () => new Response('no', { status: 429 })) as never, // as above
    });
    expect(read.status).toBe('unreadable');
  });
});

