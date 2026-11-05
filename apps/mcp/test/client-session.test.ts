import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { SkillPrompt } from '@arp-protocol/core';

const PROMPT: SkillPrompt = {
  message: 'Install the skill "x" from a/b?',
  confirm: 'Install x into .claude/skills/x',
  confirmHelp: 'Nothing is written unless you tick this and press Accept.',
};

/** A fresh module per test: what the client declared is module state. */
async function session() {
  vi.resetModules();
  return import('../src/client-session.js');
}

const ELICITATION = { capabilities: { elicitation: { form: {} } } };

describe('askPerson', () => {
  it('is accepted only on an accept with the box ticked', async () => {
    const s = await session();
    s.recordClientCapabilities(ELICITATION);
    s.setRequester(async () => ({ action: 'accept', content: { install: true } }));
    expect(await s.askPerson(PROMPT)).toBe('accepted');
  });

  it.each([
    ['an accept with the box unticked', { action: 'accept', content: { install: false } }],
    ['an accept with no content', { action: 'accept' }],
    ['a decline', { action: 'decline' }],
    ['a cancel', { action: 'cancel' }],
    ['nothing recognisable', null],
  ])('is declined on %s', async (_, answer) => {
    const s = await session();
    s.recordClientCapabilities(ELICITATION);
    s.setRequester(async () => answer);
    expect(await s.askPerson(PROMPT)).toBe('declined');
  });

  it('is unavailable when the client errors', async () => {
    const s = await session();
    s.recordClientCapabilities(ELICITATION);
    s.setRequester(async () => {
      throw new Error('method not found');
    });
    expect(await s.askPerson(PROMPT)).toBe('unavailable');
  });

  it('is unavailable, and asks nothing, when the client never declared elicitation', async () => {
    const s = await session();
    s.recordClientCapabilities({ capabilities: {} });
    const asked = vi.fn(async () => ({ action: 'accept', content: { install: true } }));
    s.setRequester(asked);
    expect(await s.askPerson(PROMPT)).toBe('unavailable');
    expect(asked).not.toHaveBeenCalled();
  });

  it('is unavailable over a transport that cannot send a request back', async () => {
    const s = await session();
    s.recordClientCapabilities(ELICITATION);
    s.setRequester(null);
    expect(await s.askPerson(PROMPT)).toBe('unavailable');
  });

  it('is unavailable when no answer comes in time', async () => {
    const s = await session();
    s.recordClientCapabilities(ELICITATION);
    s.setRequester(() => new Promise(() => {}));
    expect(await s.askPerson(PROMPT, 10)).toBe('unavailable');
  });

  it('sends the message, and the box with its label and its one sentence', async () => {
    const s = await session();
    s.recordClientCapabilities(ELICITATION);
    const asked = vi.fn(async () => ({ action: 'decline' }));
    s.setRequester(asked);
    await s.askPerson(PROMPT);
    expect(asked).toHaveBeenCalledWith('elicitation/create', {
      message: PROMPT.message,
      requestedSchema: {
        type: 'object',
        properties: {
          install: { type: 'boolean', title: PROMPT.confirm, description: PROMPT.confirmHelp },
        },
        required: ['install'],
      },
    });
  });
});

describe('stdioRouter', () => {
  let out: string[];
  beforeEach(() => {
    out = [];
  });
  afterEach(() => vi.restoreAllMocks());

  it('lets a call that waits on the person receive the reply from the same input', async () => {
    const s = await session();
    s.recordClientCapabilities(ELICITATION);
    const send = async (line: string) => {
      out.push(line);
    };
    const router = s.stdioRouter(async (line) => {
      const request = JSON.parse(line) as { id: number };
      out.push(JSON.stringify({ id: request.id, answer: await s.askPerson(PROMPT) }));
    }, send);

    router.receive(JSON.stringify({ jsonrpc: '2.0', id: 7, method: 'tools/call', params: {} }));
    await vi.waitFor(() => expect(out).toHaveLength(1));
    const asked = JSON.parse(out[0] ?? '') as { id: string; method: string };
    expect(asked.method).toBe('elicitation/create');

    router.receive(
      JSON.stringify({
        jsonrpc: '2.0',
        id: asked.id,
        result: { action: 'accept', content: { install: true } },
      }),
    );
    await router.close();
    expect(JSON.parse(out[1] ?? '')).toEqual({ id: 7, answer: 'accepted' });
  });

  it('turns an error reply into unavailable, and handles requests one at a time, in order', async () => {
    const s = await session();
    s.recordClientCapabilities(ELICITATION);
    const order: string[] = [];
    const router = s.stdioRouter(
      async (line) => {
        const request = JSON.parse(line) as { id: number };
        order.push(`start ${request.id}`);
        if (request.id === 1) order.push(await s.askPerson(PROMPT));
        order.push(`end ${request.id}`);
      },
      async (line) => {
        out.push(line);
      },
    );
    router.receive(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call' }));
    router.receive(JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' }));
    await vi.waitFor(() => expect(out).toHaveLength(1));
    const asked = JSON.parse(out[0] ?? '') as { id: string };
    router.receive(
      JSON.stringify({ jsonrpc: '2.0', id: asked.id, error: { code: -32601, message: 'no' } }),
    );
    await router.close();
    expect(order).toEqual(['start 1', 'unavailable', 'end 1', 'start 2', 'end 2']);
  });

  it('answers ping and takes a cancellation while a tool call holds the line', async () => {
    const s = await session();
    let release = () => {};
    const handled: number[] = [];
    let cancelled = 0;
    const router = s.stdioRouter(
      async (line) => {
        handled.push((JSON.parse(line) as { id: number }).id);
        await new Promise<void>((resolve) => {
          release = resolve;
        });
      },
      async (line) => {
        out.push(line);
      },
      () => {
        cancelled += 1;
      },
    );
    router.receive(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call' }));
    await vi.waitFor(() => expect(handled).toEqual([1]));

    router.receive(JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'ping' }));
    expect(JSON.parse(out[0] ?? '')).toEqual({ jsonrpc: '2.0', id: 2, result: {} });

    // A cancellation of some other request is not about this call.
    router.receive(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/cancelled', params: { requestId: 9 } }));
    expect(cancelled).toBe(0);
    router.receive(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/cancelled', params: { requestId: 1 } }));
    expect(cancelled).toBe(1);

    release();
    await router.close();
    expect(handled).toEqual([1]);
  });

  it('answers an open question with unavailable when the client closes', async () => {
    const s = await session();
    s.recordClientCapabilities(ELICITATION);
    let answer: string | undefined;
    const router = s.stdioRouter(
      async () => {
        answer = await s.askPerson(PROMPT);
      },
      async (line) => {
        out.push(line);
      },
    );
    router.receive(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call' }));
    await vi.waitFor(() => expect(out).toHaveLength(1));
    await router.close();
    expect(answer).toBe('unavailable');
  });
});
