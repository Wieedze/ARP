import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { openDb, type Db } from '../src/db.js';

export function tempDir(): string {
  return mkdtempSync(join(tmpdir(), 'arp-cli-'));
}

export function tempDb(): { db: Db; path: string; dir: string } {
  const dir = tempDir();
  const path = join(dir, 'arp.db');
  return { db: openDb(path), path, dir };
}

/** A clock the test moves by hand. */
export function fakeClock(start = Date.parse('2026-11-02T10:00:00Z')) {
  let t = start;
  return { now: () => t, advance: (ms: number) => (t += ms) };
}

export function pre(tool: string, id: string, extra: Record<string, unknown> = {}) {
  return {
    hook_event_name: 'PreToolUse',
    tool_name: tool,
    tool_use_id: id,
    session_id: 's1',
    cwd: '/nowhere',
    ...extra,
  };
}

export function post(tool: string, id: string, extra: Record<string, unknown> = {}) {
  return {
    hook_event_name: 'PostToolUse',
    tool_name: tool,
    tool_use_id: id,
    session_id: 's1',
    cwd: '/nowhere',
    ...extra,
  };
}

export function failure(
  tool: string,
  id: string,
  error: unknown,
  extra: Record<string, unknown> = {},
) {
  return {
    hook_event_name: 'PostToolUseFailure',
    tool_name: tool,
    tool_use_id: id,
    session_id: 's1',
    cwd: '/nowhere',
    error,
    ...extra,
  };
}
