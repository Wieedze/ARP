import { appendFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { ActivityTail, serveActivity } from '../src/activity-feed.js';

const dirs: string[] = [];
function dir(): string {
  const path = mkdtempSync(join(tmpdir(), 'arp-activity-'));
  dirs.push(path);
  return path;
}
afterEach(() => {
  for (const path of dirs.splice(0)) rmSync(path, { recursive: true, force: true });
});

const skillLine = (name: string, at = '2026-10-30T13:00:00Z') =>
  `${JSON.stringify({ at, kind: 'skill', name, ref: null, outcome: 'ok', ms: 4 })}\n`;

describe('ActivityTail', () => {
  it('reads each file once, then only what was appended, and waits for a line to finish', () => {
    const d = dir();
    writeFileSync(join(d, 'session.jsonl'), skillLine('brainstorming'));
    const tail = new ActivityTail(d);
    expect(tail.read().map((event) => event.source === 'session' && event.name)).toEqual([
      'brainstorming',
    ]);
    expect(tail.read()).toEqual([]);

    appendFileSync(join(d, 'session.jsonl'), skillLine('writing-plans').slice(0, 20));
    expect(tail.read()).toEqual([]);
    appendFileSync(join(d, 'session.jsonl'), skillLine('writing-plans').slice(20));
    expect(tail.read().map((event) => event.source === 'session' && event.name)).toEqual([
      'writing-plans',
    ]);
  });

  it('a file that does not exist yet is not an error, and a truncated one is read again', () => {
    const d = dir();
    const tail = new ActivityTail(d);
    expect(tail.read()).toEqual([]);
    writeFileSync(
      join(d, 'sent.jsonl'),
      `${JSON.stringify({ at: 't', chainId: 13579, status: 'dry' })}\n`,
    );
    expect(tail.read()).toHaveLength(1);
    writeFileSync(join(d, 'sent.jsonl'), '');
    writeFileSync(
      join(d, 'sent.jsonl'),
      `${JSON.stringify({ at: 'u', chainId: 13579, status: 'dry' })}\n`,
    );
    expect(tail.read()).toMatchObject([{ at: 'u' }]);
  });
});

describe('serveActivity', () => {
  it('serves the history as JSON, CORS only for an allowed origin', async () => {
    const d = dir();
    writeFileSync(join(d, 'session.jsonl'), skillLine('brainstorming'));
    const feed = await serveActivity({
      dir: d,
      port: 0,
      origins: ['http://localhost:5173'],
      pollMs: 20,
    });
    try {
      const allowed = await fetch(`http://127.0.0.1:${feed.port}/events.json`, {
        headers: { origin: 'http://localhost:5173' },
      });
      expect(allowed.headers.get('access-control-allow-origin')).toBe('http://localhost:5173');
      expect(await allowed.json()).toMatchObject([{ source: 'session', name: 'brainstorming' }]);

      const stranger = await fetch(`http://127.0.0.1:${feed.port}/events.json`, {
        headers: { origin: 'https://evil.example' },
      });
      expect(stranger.headers.get('access-control-allow-origin')).toBeNull();
      await stranger.body?.cancel();

      const post = await fetch(`http://127.0.0.1:${feed.port}/events.json`, { method: 'POST' });
      expect(post.status).toBe(405);
    } finally {
      await feed.close();
    }
  });

  it('streams the history, then each line appended after the stream opened', async () => {
    const d = dir();
    writeFileSync(join(d, 'session.jsonl'), skillLine('brainstorming'));
    const feed = await serveActivity({ dir: d, port: 0, pollMs: 20 });
    try {
      const response = await fetch(`http://127.0.0.1:${feed.port}/events`);
      expect(response.headers.get('content-type')).toBe('text/event-stream');
      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let text = '';
      appendFileSync(join(d, 'session.jsonl'), skillLine('writing-plans', '2026-10-30T13:01:00Z'));
      while (!text.includes('writing-plans')) {
        const { value, done } = await reader.read();
        if (done) break;
        text += decoder.decode(value);
      }
      const names = text
        .split('\n\n')
        .filter((chunk) => chunk.startsWith('data: '))
        .map((chunk) => (JSON.parse(chunk.slice(6)) as { name: string }).name);
      expect(names).toEqual(['brainstorming', 'writing-plans']);
      await reader.cancel();
    } finally {
      await feed.close();
    }
  });

  it('refuses a request whose Host is not this machine, which is what DNS rebinding sends', async () => {
    const d = dir();
    writeFileSync(join(d, 'session.jsonl'), skillLine('brainstorming'));
    const feed = await serveActivity({ dir: d, port: 0, pollMs: 20 });
    try {
      const { request } = await import('node:http');
      const status = await new Promise<number>((resolve, reject) => {
        const req = request(
          {
            host: '127.0.0.1',
            port: feed.port,
            path: '/events.json',
            headers: { host: 'attacker.example:3913', origin: 'http://attacker.example:3913' },
          },
          (res) => {
            res.resume();
            resolve(res.statusCode ?? 0);
          },
        );
        req.on('error', reject);
        req.end();
      });
      expect(status).toBe(403);
      const local = await fetch(`http://localhost:${feed.port}/events.json`);
      expect(local.status).toBe(200);
      await local.body?.cancel();
    } finally {
      await feed.close();
    }
  });
});
