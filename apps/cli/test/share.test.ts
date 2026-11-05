import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, expect, test } from 'bun:test';

import { decide, describe as describeShare, sendShared, setSharing, type ShareEnv } from '../src/share.ts';

let dir: string;
let env: ShareEnv;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'arp-share-'));
  env = { arpHome: join(dir, 'arp'), home: dir, cwd: dir };
  mkdirSync(env.arpHome);
  mkdirSync(join(dir, '.agents'));
  writeFileSync(
    join(dir, '.agents', '.skill-lock.json'),
    JSON.stringify({ skills: { clip: { source: 'a/b', sourceType: 'github' } } }),
  );
  writeFileSync(
    join(env.arpHome, 'failures.jsonl'),
    [
      { at: '2026-11-05T10:00:00Z', session: 'SESSION-ID', skill: 'clip', source: null, reason: 'missing-key' },
      { at: '2026-11-05T10:00:00Z', session: 'SESSION-ID', skill: 'my-private-skill', source: null, reason: 'missing-file' },
    ]
      .map((row) => JSON.stringify(row))
      .join('\n'),
  );
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

test('by default nothing leaves: the writer is never called and nothing is recorded', async () => {
  let calls = 0;
  const result = await sendShared(env, async () => {
    calls += 1;
  });
  expect(result).toEqual({ sent: 0, failed: 0, firstError: null });
  expect(calls).toBe(0);
  expect(existsSync(join(env.arpHome, 'shared-failures.jsonl'))).toBe(false);
  expect(existsSync(join(env.arpHome, 'sharing.json'))).toBe(false);
  expect(decide(env).lines).toEqual([]);
});

test('turned on, only the public skill goes, in closed words', async () => {
  setSharing(env, true);
  const written: unknown[] = [];
  const result = await sendShared(env, async (line) => {
    written.push(line);
  });
  expect(result).toEqual({ sent: 1, failed: 0, firstError: null });
  expect(written).toEqual([{ toolUrl: 'https://github.com/a/b?skill=clip', outcome: 'failed', reason: 'missing-key' }]);
  expect(JSON.stringify(written)).not.toContain('SESSION-ID');
  expect(JSON.stringify(written)).not.toContain('my-private-skill');
});

test('a line goes once, and one that failed to write is tried again', async () => {
  setSharing(env, true);
  expect(await sendShared(env, () => Promise.reject(new Error('down')))).toEqual({ sent: 0, failed: 1, firstError: 'down' });
  expect(await sendShared(env, async () => {})).toEqual({ sent: 1, failed: 0, firstError: null });
  expect(await sendShared(env, async () => {})).toEqual({ sent: 0, failed: 0, firstError: null });
});

test('a skill fetched through ARP is recognised from its receipt', () => {
  setSharing(env, true);
  writeFileSync(join(env.arpHome, 'receipts.jsonl'), JSON.stringify({ receipt: { url: 'https://github.com/o/r?skill=my-private-skill' } }));
  expect(decide(env).lines.map((line) => line.toolUrl)).toContain('https://github.com/o/r?skill=my-private-skill');
});

test('turned off again, nothing leaves', async () => {
  setSharing(env, true);
  setSharing(env, false);
  expect(await sendShared(env, () => Promise.reject(new Error('must not be called')))).toEqual({ sent: 0, failed: 0, firstError: null });
  expect(readFileSync(join(env.arpHome, 'sharing.json'), 'utf8')).toContain('false');
});

test('the summary says what would be public and what stays', () => {
  const off = describeShare(decide(env));
  expect(off).toContain('sharing is off');
  expect(off).not.toContain('would be public');
  setSharing(env, true);
  const on = describeShare(decide(env));
  expect(on).toContain('https://github.com/a/b?skill=clip  failed  missing-key');
  expect(on).toContain('my-private-skill: no known public source');
});
