import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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
function run(
  payload: unknown,
  env: Record<string, string> = {},
): { exitCode: number; lines: Record<string, unknown>[] } {
  const proc = Bun.spawnSync(['bun', HOOK], {
    stdin: new TextEncoder().encode(
      typeof payload === 'string' ? payload : JSON.stringify(payload),
    ),
    // HOME points at an empty directory unless a test sets it, so the machine's own MCP
    // configuration never leaks into a result.
    env: { ...process.env, HOME: dir, ARP_SESSION_LOG: log, ARP_RECEIPTS: receipts, ...env },
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

test('a failed MCP call is recorded with its category, code and duration, never its text', () => {
  const secret = 'sk-live-in-the-error';
  const { lines } = run({
    session_id: 's1',
    hook_event_name: 'PostToolUseFailure',
    tool_name: 'mcp__github__list',
    tool_input: { token: 'arg-secret' },
    tool_use_id: 'toolu_1',
    error: `HTTP 401 Unauthorized ${secret}`,
    is_interrupt: false,
    duration_ms: 812,
  });
  expect(lines[0]).toMatchObject({
    call: 'toolu_1',
    format: 'claude',
    kind: 'mcp',
    name: 'github',
    outcome: 'auth',
    code: '401',
    ms: 812,
    response: null,
  });
  const text = readFileSync(log, 'utf8');
  expect(text).not.toContain(secret);
  expect(text).not.toContain('arg-secret');
});

test('an interrupted call writes nothing', () => {
  const { lines } = run({
    hook_event_name: 'PostToolUseFailure',
    tool_name: 'mcp__x__y',
    error: 'aborted',
    is_interrupt: true,
  });
  expect(lines).toHaveLength(0);
});

test('a Grok Build payload is recorded like a Claude Code one', () => {
  const { lines } = run({
    hookEventName: 'PostToolUse',
    sessionId: 'g1',
    toolName: 'mcp__x__y',
    toolUseId: 'call_9',
    toolResult: 'ok',
  });
  expect(lines[0]).toMatchObject({
    session: 'g1',
    call: 'call_9',
    format: 'grok',
    kind: 'mcp',
    name: 'x',
    outcome: 'ok',
  });
});

test("an MCP call's ref is its server's configured URL, not an argument", () => {
  writeFileSync(
    join(dir, '.claude.json'),
    JSON.stringify({ mcpServers: { github: { url: 'https://www.api.githubcopilot.com/mcp/' } } }),
  );
  const { lines } = run(
    { tool_name: 'mcp__github__get', tool_input: { url: 'https://a-page-the-agent-read.example' } },
    { HOME: dir },
  );
  expect(lines[0]?.ref).toBe('https://api.githubcopilot.com/mcp');
});

test('a key in a configured server URL never reaches the log', () => {
  writeFileSync(
    join(dir, '.claude.json'),
    JSON.stringify({
      mcpServers: {
        query: {
          url: 'https://user:pass-SENTINEL@mcp.example.com/mcp?apiKey=SENTINEL_Q#SENTINEL_F',
        },
        path: { url: 'https://mcp.example.com/s/SENTINEL0path0token0abc123/mcp' },
      },
    }),
  );
  const first = run({ tool_name: 'mcp__query__x' }, { HOME: dir });
  expect(first.lines[0]?.ref).toBe('https://mcp.example.com/mcp');
  const second = run({ tool_name: 'mcp__path__x' }, { HOME: dir });
  expect(second.lines[1]?.ref).toBe('https://mcp.example.com');
  expect(readFileSync(log, 'utf8')).not.toContain('SENTINEL');
});

test('the log directory ignores itself, so an operator repository never commits it', () => {
  // The default path, so no ARP_SESSION_LOG: only ARP's own directory gets the file.
  const { ARP_SESSION_LOG: _unset, ...env } = process.env;
  const proc = Bun.spawnSync(['bun', HOOK], {
    stdin: new TextEncoder().encode(JSON.stringify({ tool_name: 'mcp__x__y', cwd: dir })),
    env: { ...env, HOME: dir, ARP_RECEIPTS: receipts },
  });
  expect(proc.exitCode).toBe(0);
  expect(readFileSync(join(dir, '.arp', '.gitignore'), 'utf8')).toBe('*\n');
  expect(existsSync(join(dir, '.arp', 'session.jsonl'))).toBe(true);
});

test('a payload that is not JSON exits 0 and writes nothing — the session must not stop', () => {
  const { exitCode, lines } = run('not json');
  expect(exitCode).toBe(0);
  expect(lines).toHaveLength(0);
});

test('--capture keeps the shape and the names, and redacts every argument, response and error', () => {
  const proc = Bun.spawnSync(['bun', HOOK, '--capture'], {
    stdin: new TextEncoder().encode(
      JSON.stringify({
        hook_event_name: 'PostToolUseFailure',
        tool_name: 'mcp__github__create_issue',
        tool_use_id: 't9',
        tool_input: { name: 'SENTINEL-in-args', body: 'SENTINEL-body' },
        error: 'HTTP 401 SENTINEL-in-error',
        duration_ms: 12,
      }),
    ),
    env: { ...process.env, HOME: dir, ARP_SESSION_LOG: log, ARP_RECEIPTS: receipts },
  });
  expect(proc.exitCode).toBe(0);
  const captures = join(dir, '.arp', 'captures');
  const files = readdirSync(captures);
  expect(files).toHaveLength(1);
  expect(files[0]).toEndWith('-PostToolUseFailure.json');
  const text = readFileSync(join(captures, files[0] ?? ''), 'utf8');
  expect(text).not.toContain('SENTINEL');
  expect(JSON.parse(text)).toMatchObject({
    hook_event_name: 'PostToolUseFailure',
    tool_name: 'mcp__github__create_issue',
    tool_use_id: 't9',
    tool_input: { name: '<string:16>', body: '<string:13>' },
    duration_ms: 12,
  });
  // The normal record is still written: capture is in addition, not instead.
  expect(readFileSync(log, 'utf8')).toContain('"call":"t9"');
});
