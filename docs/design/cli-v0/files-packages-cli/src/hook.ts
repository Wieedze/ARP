import { classifyCall } from './classify.js';
import type { Db } from './db.js';
import { readMcpServers, sourceOf, type ServerEntry, type ToolSource } from './mcp-config.js';
import { toolIdOf } from './tool-id.js';
import { parseMcpToolName } from './tool-name.js';

/**
 * What the hook does with one event. Pure apart from the database handed to it, so the tests drive
 * it in-process and the performance budget is measured on the work itself.
 *
 * | event | effect |
 * | --- | --- |
 * | `PreToolUse` | remember the start time under the call's id |
 * | `PostToolUse`, `PostToolUseFailure` | classify, measure, write one row in `calls`, forget the rest |
 * | `SessionStart` | read the MCP configuration, record each server's source, note a host change, and return the alerts to put in front of the agent |
 *
 * It never makes a network request, never modifies a call, and never sees more than it keeps for
 * longer than this function runs.
 */
export type HookInput = Record<string, unknown>;

export type HookResult = {
  /** Text for Claude Code to add to the session, `SessionStart` only. */
  context?: string;
};

type Clock = { now: () => number };

const PENDING_TTL_MS = 60 * 60 * 1000;

function str(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function upsertTool(
  db: Db,
  server: string,
  source: ToolSource,
  iso: string,
): { hostBefore: string | null; id: string } {
  const id = toolIdOf(server);
  const row = db.prepare('SELECT host FROM tools WHERE tool_id = ?').get(id);
  const hostBefore = row !== undefined && typeof row.host === 'string' ? row.host : null;
  const url = source.kind === 'private' ? '' : source.url;
  const host = source.kind === 'private' ? null : source.host;
  const kind = source.kind;
  const isPublic = source.kind === 'private' ? 0 : 1;
  if (row === undefined) {
    db.prepare(
      'INSERT INTO tools (tool_id, name, kind, url, public, host, first_seen, last_seen) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    ).run(id, server, kind, url, isPublic, host, iso, iso);
  } else {
    db.prepare(
      'UPDATE tools SET kind = ?, url = ?, public = ?, host = ?, last_seen = ? WHERE tool_id = ?',
    ).run(kind, url, isPublic, host, iso, id);
  }
  return { hostBefore, id };
}

/** A call to a server the session start did not see: resolve it now, from configuration only. */
function ensureTool(
  db: Db,
  server: string,
  cwd: string | null,
  iso: string,
  servers?: Map<string, ServerEntry>,
): string {
  const id = toolIdOf(server);
  const known = db.prepare('SELECT 1 AS x FROM tools WHERE tool_id = ?').get(id);
  if (known !== undefined) {
    db.prepare('UPDATE tools SET last_seen = ? WHERE tool_id = ?').run(iso, id);
    return id;
  }
  const map = servers ?? (cwd === null ? new Map<string, ServerEntry>() : readMcpServers({ cwd }));
  upsertTool(db, server, sourceOf(map.get(server)), iso);
  return id;
}

function onPre(db: Db, input: HookInput, clock: Clock): void {
  const id = str(input.tool_use_id);
  if (id === null || parseMcpToolName(String(input.tool_name ?? '')) === null) return;
  const now = clock.now();
  db.prepare('INSERT OR REPLACE INTO pending (call_id, started) VALUES (?, ?)').run(id, now);
  db.prepare('DELETE FROM pending WHERE started < ?').run(now - PENDING_TTL_MS);
}

function onPost(
  db: Db,
  event: string,
  input: HookInput,
  clock: Clock,
  servers?: Map<string, ServerEntry>,
): void {
  const name = parseMcpToolName(String(input.tool_name ?? ''));
  if (name === null) return;
  const classified = classifyCall(event, input);
  const callId = str(input.tool_use_id);
  const now = clock.now();

  let duration: number | null = null;
  if (callId !== null) {
    const started = db.prepare('SELECT started FROM pending WHERE call_id = ?').get(callId);
    if (started !== undefined && typeof started.started === 'number')
      duration = Math.max(0, now - started.started);
    db.prepare('DELETE FROM pending WHERE call_id = ?').run(callId);
  }
  // A cancelled call is not counted at all.
  if (classified === null) return;

  const iso = new Date(now).toISOString();
  const toolId = ensureTool(db, name.server, str(input.cwd), iso, servers);
  db.prepare(
    'INSERT INTO calls (ts, tool_id, function, outcome, code, duration_ms, session) VALUES (?, ?, ?, ?, ?, ?, ?)',
  ).run(iso, toolId, name.fn, classified.outcome, classified.code, duration, str(input.session_id));
}

function onSessionStart(
  db: Db,
  input: HookInput,
  clock: Clock,
  servers?: Map<string, ServerEntry>,
): HookResult {
  const cwd = str(input.cwd);
  const map = servers ?? (cwd === null ? new Map<string, ServerEntry>() : readMcpServers({ cwd }));
  const iso = new Date(clock.now()).toISOString();
  for (const [server, entry] of map) {
    const source = sourceOf(entry);
    const { hostBefore, id } = upsertTool(db, server, source, iso);
    const hostAfter = source.kind === 'private' ? null : source.host;
    if (hostBefore !== null && hostAfter !== null && hostBefore !== hostAfter) {
      db.prepare(
        "INSERT INTO changes (ts, tool_id, kind, before, after) VALUES (?, ?, 'host_changed', ?, ?)",
      ).run(iso, id, hostBefore, hostAfter);
    }
  }
  return { context: pendingAlerts(db) };
}

/**
 * The changes the agent has not been told about, once each, as one line per tool. Marked shown in
 * the same breath, so the next session does not repeat them.
 */
function pendingAlerts(db: Db): string | undefined {
  const rows = db
    .prepare(
      'SELECT c.rowid AS id, t.name AS name, c.kind AS kind, c.before AS before, c.after AS after FROM changes c JOIN tools t ON t.tool_id = c.tool_id WHERE c.shown = 0 ORDER BY c.ts',
    )
    .all();
  if (rows.length === 0) return undefined;
  const lines = rows.map((row) => {
    const name = String(row.name);
    if (row.kind === 'host_changed')
      return `ARP: MCP server ${name} moved from ${String(row.before)} to ${String(row.after)}.`;
    return `ARP: MCP server ${name} changed (${String(row.kind)}).`;
  });
  db.prepare('UPDATE changes SET shown = 1 WHERE shown = 0').run();
  return lines.join('\n');
}

export function handleHookEvent(
  db: Db,
  input: HookInput,
  {
    clock = { now: () => Date.now() },
    servers,
  }: { clock?: Clock; servers?: Map<string, ServerEntry> } = {},
): HookResult {
  const event = String(input.hook_event_name ?? '');
  switch (event) {
    case 'PreToolUse':
      onPre(db, input, clock);
      return {};
    case 'PostToolUse':
    case 'PostToolUseFailure':
      onPost(db, event, input, clock, servers);
      return {};
    case 'SessionStart':
      return onSessionStart(db, input, clock, servers);
    default:
      return {};
  }
}
