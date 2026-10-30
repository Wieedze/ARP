import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, test } from 'bun:test';

import { classifyCall } from '../src/classify.ts';
import { readMcpServers, serverUrlOf } from '../src/mcp-config.ts';
import { type ToolCall, toolCallOf } from '../src/payload.ts';

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});
function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'arp-hook-unit-'));
  dirs.push(dir);
  return dir;
}

/** A Claude-format call, overridable field by field. */
function call(over: Partial<ToolCall> = {}): ToolCall {
  return {
    format: 'claude',
    event: 'PostToolUse',
    session: 's1',
    id: 't1',
    tool: 'mcp__x__y',
    input: {},
    hasResponse: true,
    response: 'done',
    error: null,
    interrupted: false,
    ms: null,
    cwd: null,
    ...over,
  };
}

describe('toolCallOf', () => {
  test('reads the Claude Code failure payload as documented', () => {
    // code.claude.com/docs/en/hooks, PostToolUseFailure example input.
    const parsed = toolCallOf({
      session_id: 's1',
      hook_event_name: 'PostToolUseFailure',
      tool_name: 'mcp__github__list',
      tool_input: { q: 1 },
      tool_use_id: 'toolu_01',
      error: 'Exit code 1',
      is_interrupt: false,
      duration_ms: 4187,
    });
    expect(parsed).toMatchObject({
      format: 'claude',
      event: 'PostToolUseFailure',
      id: 'toolu_01',
      error: 'Exit code 1',
      hasResponse: false,
      ms: 4187,
    });
  });

  test('reads the Grok Build camelCase envelope', () => {
    // xai-org/grok-build docs/user-guide/10-hooks.md, field names of the PreToolUse example.
    const parsed = toolCallOf({
      hookEventName: 'PostToolUse',
      sessionId: 'g1',
      toolName: 'mcp__github__list',
      toolInput: { q: 1 },
      toolUseId: 'call_9',
      toolResult: { content: [] },
      cwd: '/w',
    });
    expect(parsed).toMatchObject({
      format: 'grok',
      event: 'PostToolUse',
      session: 'g1',
      id: 'call_9',
      tool: 'mcp__github__list',
      hasResponse: true,
      cwd: '/w',
    });
  });

  test('a payload with no tool name is nothing', () => {
    expect(toolCallOf({ session_id: 's' })).toBeNull();
    expect(toolCallOf('text')).toBeNull();
    expect(toolCallOf(null)).toBeNull();
  });
});

describe('classifyCall', () => {
  test('a success is ok, even when its text mentions an error', () => {
    expect(classifyCall(call({ response: 'How to fix 401 Unauthorized' }))).toEqual({
      outcome: 'ok',
      code: null,
    });
  });

  test('the failure event is a failure even with no response', () => {
    expect(
      classifyCall(call({ event: 'PostToolUseFailure', hasResponse: false, error: 'boom' })),
    ).toEqual({ outcome: 'tool_error', code: null });
  });

  test('the MCP error flag is a tool error', () => {
    expect(classifyCall(call({ response: { isError: true } }))).toMatchObject({
      outcome: 'tool_error',
    });
  });

  test('categories: auth, payment, timeout, unreachable, with the status code only', () => {
    expect(classifyCall(call({ error: 'HTTP 401 Unauthorized: bad token sk-1' }))).toEqual({
      outcome: 'auth',
      code: '401',
    });
    expect(classifyCall(call({ error: '402 Payment Required' }))).toEqual({
      outcome: 'payment',
      code: '402',
    });
    expect(classifyCall(call({ error: 'request timed out' }))?.outcome).toBe('timeout');
    expect(classifyCall(call({ error: 'getaddrinfo ENOTFOUND api.x' }))?.outcome).toBe(
      'unreachable',
    );
    expect(classifyCall(call({ error: 'upstream 502' }))).toEqual({
      outcome: 'tool_error',
      code: '502',
    });
  });

  test('an interrupted or user-cancelled call is not classified', () => {
    expect(classifyCall(call({ interrupted: true, error: 'x' }))).toBeNull();
    expect(classifyCall(call({ error: 'The user rejected this call' }))).toBeNull();
  });
});

describe('mcp-config', () => {
  test('merges user, local and project scope, the project winning', () => {
    const home = tempDir();
    const cwd = join(home, 'proj');
    mkdirSync(cwd);
    writeFileSync(
      join(home, '.claude.json'),
      JSON.stringify({
        mcpServers: {
          github: { url: 'https://api.githubcopilot.com/mcp/' },
          shared: { url: 'https://old.example' },
        },
        projects: {
          [cwd]: { mcpServers: { time: { command: 'uvx', args: ['mcp-server-time'] } } },
        },
      }),
    );
    writeFileSync(
      join(cwd, '.mcp.json'),
      JSON.stringify({
        mcpServers: { shared: { command: 'npx', args: ['-y', '@scope/pkg@2.1.0'] } },
      }),
    );
    const servers = readMcpServers({ cwd, home });
    expect([...servers.keys()].sort()).toEqual(['github', 'shared', 'time']);
    expect(serverUrlOf(servers.get('shared'))).toBe('https://www.npmjs.com/package/@scope/pkg');
    expect(serverUrlOf(servers.get('time'))).toBe('https://pypi.org/project/mcp-server-time');
    expect(serverUrlOf(servers.get('github'))).toBe('https://api.githubcopilot.com/mcp/');
  });

  test('missing or broken files are nothing, never a throw', () => {
    const home = tempDir();
    writeFileSync(join(home, '.claude.json'), '{not json');
    expect(readMcpServers({ cwd: join(home, 'none'), home }).size).toBe(0);
  });

  test('a script, a local path or localhost names nothing', () => {
    expect(serverUrlOf({ transport: 'local', command: 'node', args: ['./server.js'] })).toBeNull();
    expect(serverUrlOf({ transport: 'local', command: 'npx', args: ['./local'] })).toBeNull();
    expect(serverUrlOf({ transport: 'remote', url: 'http://localhost:3000/mcp' })).toBeNull();
    expect(serverUrlOf({ transport: 'remote', url: 'file:///x' })).toBeNull();
    expect(serverUrlOf(undefined)).toBeNull();
  });
});
