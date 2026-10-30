import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, expect, test } from 'bun:test';

const HOOK = join(import.meta.dir, '..', 'src', 'hook.ts');

let dir: string;
let log: string;
let receipts: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'arp-hook-'));
  log = join(dir, 'session.jsonl');
  receipts = join(dir, 'receipts.jsonl');
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

/** Runs the hook the way a runtime does: a payload on stdin, nothing expected back. */
function run(payload: unknown): { exitCode: number; lines: Record<string, unknown>[] } {
  const proc = Bun.spawnSync(['bun', HOOK], {
    stdin: new TextEncoder().encode(
      typeof payload === 'string' ? payload : JSON.stringify(payload),
    ),
    env: { ...process.env, ARP_SESSION_LOG: log, ARP_RECEIPTS: receipts },
  });
  const lines = existsSync(log)
    ? readFileSync(log, 'utf8')
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line) as Record<string, unknown>)
    : [];
  return { exitCode: proc.exitCode, lines };
}

test('a skill call is recorded with its name, session and source', () => {
  const { exitCode, lines } = run({
    session_id: 's1',
    tool_name: 'Skill',
    tool_input: { skill: 'plugin:pdf', source: 'anthropics/skills' },
    tool_response: 'loaded',
  });
  expect(exitCode).toBe(0);
  expect(lines).toHaveLength(1);
  expect(lines[0]).toMatchObject({
    session: 's1',
    kind: 'skill',
    name: 'plugin:pdf',
    source: 'anthropics/skills',
  });
});

test('a fetched skill gets its atom from the receipts record', () => {
  writeFileSync(
    receipts,
    `${JSON.stringify({ skill: 'pdf', atom: '0xabc', url: 'https://github.com/a/b', at: '' })}\n`,
  );
  const { lines } = run({ tool_name: 'Skill', tool_input: { skill: 'pdf' } });
  expect(lines[0]?.ref).toBe('0xabc');
});

test('two atoms fetched under one name leave the ref empty rather than guessing', () => {
  writeFileSync(
    receipts,
    [
      JSON.stringify({ skill: 'pdf', atom: '0xabc', url: 'https://github.com/a/b', at: '' }),
      JSON.stringify({ skill: 'pdf', atom: '0xdef', url: 'https://github.com/c/d', at: '' }),
    ].join('\n'),
  );
  const { lines } = run({ tool_name: 'Skill', tool_input: { skill: 'pdf' } });
  expect(lines[0]?.ref).toBeNull();
});

test('an MCP call records the server, not the tool within it', () => {
  const { lines } = run({ tool_name: 'mcp__arp_graph__arp_discover', tool_input: {} });
  expect(lines[0]).toMatchObject({ kind: 'mcp', name: 'arp_graph' });
});

test('the response is reduced to its size and error flag, never its content', () => {
  const secret = 'sk-live-do-not-keep';
  const { lines } = run({
    tool_name: 'mcp__x__y',
    tool_response: { content: secret, is_error: true },
  });
  expect(lines[0]?.response).toEqual({
    answered: true,
    bytes: JSON.stringify({ content: secret, is_error: true }).length,
    failed: true,
  });
  expect(readFileSync(log, 'utf8')).not.toContain(secret);
});

test('no response field is null, not an empty response', () => {
  const { lines } = run({ tool_name: 'mcp__x__y' });
  expect(lines[0]?.response).toBeNull();
});

test('built-in tools are not recorded', () => {
  const { exitCode, lines } = run({ tool_name: 'Read', tool_input: { file_path: '/etc/passwd' } });
  expect(exitCode).toBe(0);
  expect(lines).toHaveLength(0);
});

test('a payload that is not JSON exits 0 and writes nothing — the session must not stop', () => {
  const { exitCode, lines } = run('not json');
  expect(exitCode).toBe(0);
  expect(lines).toHaveLength(0);
});
