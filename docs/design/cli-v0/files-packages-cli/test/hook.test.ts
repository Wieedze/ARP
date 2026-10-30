import { readFileSync } from 'node:fs';

import { handleHookEvent } from '../src/hook.js';
import type { ServerEntry } from '../src/mcp-config.js';
import { failure, fakeClock, post, pre, tempDb } from './helpers.js';

const servers = new Map<string, ServerEntry>([
  ['github', { transport: 'remote', url: 'https://api.githubcopilot.com/mcp/' }],
  ['notes', { transport: 'local', command: 'node', args: ['./notes.js'] }],
]);

describe('the hook', () => {
  it('records one call with its duration, from the start time noted before it', () => {
    const { db } = tempDb();
    const clock = fakeClock();
    handleHookEvent(db, pre('mcp__github__create_issue', 'c1'), { clock, servers });
    clock.advance(340);
    handleHookEvent(db, post('mcp__github__create_issue', 'c1'), { clock, servers });
    const rows = db.prepare('SELECT function, outcome, duration_ms, session FROM calls').all();
    expect(rows).toEqual([
      { function: 'create_issue', outcome: 'ok', duration_ms: 340, session: 's1' },
    ]);
    expect(db.prepare('SELECT COUNT(*) AS n FROM pending').get()).toEqual({ n: 0 });
    const tool = db.prepare('SELECT name, kind, url, public, host FROM tools').get();
    expect(tool).toEqual({
      name: 'github',
      kind: 'mcp_remote',
      url: 'https://api.githubcopilot.com/mcp/',
      public: 1,
      host: 'api.githubcopilot.com',
    });
  });

  it('records a call with no start time, without a duration', () => {
    const { db } = tempDb();
    handleHookEvent(db, post('mcp__github__list', 'c9'), { clock: fakeClock(), servers });
    expect(db.prepare('SELECT duration_ms FROM calls').get()).toEqual({ duration_ms: null });
  });

  it('records a failure in its category', () => {
    const { db } = tempDb();
    handleHookEvent(db, failure('mcp__github__list', 'c2', 'Request failed with status 401'), {
      clock: fakeClock(),
      servers,
    });
    expect(db.prepare('SELECT outcome, code FROM calls').get()).toEqual({
      outcome: 'auth',
      code: '401',
    });
  });

  it('does not count a cancelled call', () => {
    const { db } = tempDb();
    handleHookEvent(db, failure('mcp__github__list', 'c3', 'x', { is_interrupt: true }), {
      clock: fakeClock(),
      servers,
    });
    expect(db.prepare('SELECT COUNT(*) AS n FROM calls').get()).toEqual({ n: 0 });
  });

  it('ignores tools that are not MCP tools', () => {
    const { db } = tempDb();
    handleHookEvent(db, post('Bash', 'c4'), { clock: fakeClock(), servers });
    expect(db.prepare('SELECT COUNT(*) AS n FROM calls').get()).toEqual({ n: 0 });
  });

  it('keeps a script-launched server private', () => {
    const { db } = tempDb();
    handleHookEvent(db, post('mcp__notes__add', 'c5'), { clock: fakeClock(), servers });
    expect(db.prepare('SELECT kind, url, public FROM tools').get()).toEqual({
      kind: 'private',
      url: '',
      public: 0,
    });
  });

  it('never stores an argument or a response', () => {
    const { db, path } = tempDb();
    const secret = 'SENTINEL-7f3a9c-do-not-store';
    const clock = fakeClock();
    handleHookEvent(db, pre('mcp__github__search', 'c6', { tool_input: { query: secret } }), {
      clock,
      servers,
    });
    handleHookEvent(
      db,
      post('mcp__github__search', 'c6', {
        tool_input: { query: secret },
        tool_response: { content: [{ type: 'text', text: secret }] },
      }),
      { clock, servers },
    );
    handleHookEvent(
      db,
      failure('mcp__github__search', 'c7', `HTTP 500 while handling ${secret}`, {
        tool_input: { query: secret },
      }),
      { clock, servers },
    );
    db.close();
    for (const file of [path, `${path}-wal`]) {
      let bytes = '';
      try {
        bytes = readFileSync(file).toString('latin1');
      } catch {
        continue;
      }
      expect(bytes.includes(secret)).toBe(false);
    }
  });
});

describe('session start', () => {
  it('notes a host change once, and tells the agent once', () => {
    const { db } = tempDb();
    const clock = fakeClock();
    const before = new Map<string, ServerEntry>([
      ['search', { transport: 'remote', url: 'https://api.foo.dev/mcp' }],
    ]);
    const after = new Map<string, ServerEntry>([
      ['search', { transport: 'remote', url: 'https://api.foo.io/mcp' }],
    ]);
    expect(
      handleHookEvent(
        db,
        { hook_event_name: 'SessionStart', cwd: '/x' },
        { clock, servers: before },
      ),
    ).toEqual({ context: undefined });
    clock.advance(1000);
    const first = handleHookEvent(
      db,
      { hook_event_name: 'SessionStart', cwd: '/x' },
      { clock, servers: after },
    );
    expect(first.context).toBe('ARP: MCP server search moved from api.foo.dev to api.foo.io.');
    const second = handleHookEvent(
      db,
      { hook_event_name: 'SessionStart', cwd: '/x' },
      { clock, servers: after },
    );
    expect(second.context).toBeUndefined();
  });
});
