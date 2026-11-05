import { describe, expect, it } from 'vitest';

import { readNode } from '../src/handlers/agents.js';

const guard = { allowPrivate: false, resolveHost: async () => ['93.184.216.34'] };
const NOW = Date.parse('2026-11-05T17:00:00Z');
const read = (fetcher: (url: string) => Promise<Response>, createdAt: string | null = '2026-11-05T16:59:00Z', g = guard) =>
  readNode('https://node.example', createdAt, {
    fetch: fetcher as never, // the two-argument fetch, this stub reads the first
    guard: g,
    retryDelayMs: 0,
    now: () => NOW,
  });
const notFound = Object.assign(new Error('getaddrinfo ENOTFOUND'), { code: 'ENOTFOUND' });
const noName = { allowPrivate: false, resolveHost: async () => { throw notFound; } };

describe('readNode', () => {
  it('reads an answer and its offer, one line per field', async () => {
    const answer = await read(async () =>
      Response.json({ minBudgetWei: '1000', offer: { description: 'a\nb', input: 'i', output: 'o' } }),
    );
    expect(answer).toMatchObject({ answers: true, why: null, offer: { description: 'a b', min_budget_wei: '1000' } });
  });

  it('says a new name cannot be checked yet, and when to ask again', async () => {
    const answer = await read(async () => new Response('{}'), '2026-11-05T16:59:00Z', noName);
    expect(answer).toEqual({ answers: null, why: 'name_not_resolved_yet', retry_after_seconds: 60, offer: null });
  });

  it('says an old name that does not resolve is gone', async () => {
    const answer = await read(async () => new Response('{}'), '2026-11-05T10:00:00Z', noName);
    expect(answer).toEqual({ answers: false, why: 'name_no_longer_resolves', offer: null });
  });

  it('reads a 5xx as nothing behind the address, and a 404 as a server that answered', async () => {
    expect(await read(async () => new Response('', { status: 530 }))).toMatchObject({ answers: false, why: 'http 530' });
    expect(await read(async () => new Response('', { status: 404 }))).toMatchObject({ answers: true, why: 'http 404' });
  });

  it('retries once on a passing failure', async () => {
    let calls = 0;
    const answer = await read(async () => {
      calls += 1;
      if (calls === 1) throw new Error('socket closed');
      return Response.json({});
    });
    expect(calls).toBe(2);
    expect(answer.answers).toBe(true);
  });

  it('says the check failed when the retry fails too, which is not a node that did not answer', async () => {
    const answer = await read(async () => {
      throw new Error('socket closed');
    });
    expect(answer.answers).toBeNull();
    expect(answer.why).toContain('check_failed');
  });

  it('does not treat a body of null as a dead node', async () => {
    expect(await read(async () => new Response('null'))).toMatchObject({ answers: true, offer: null });
  });

  it('keeps refusing a name that resolves to a private address', async () => {
    const answer = await read(async () => new Response('{}'), null, {
      allowPrivate: false,
      resolveHost: async () => ['127.0.0.1'],
    });
    expect(answer.answers).toBe(false);
    expect(answer.why).toContain('refused');
  });
});
