import type { Db } from './db.js';
import {
  urgency,
  verdictFor,
  verdictText,
  type LocalStats,
  type NetworkReading,
  type Verdict,
} from './verdict.js';

/**
 * `arp status`: read from the local database only, under a second, with no network call.
 *
 * The `network` column is empty in this version: the reading of other agents' reports arrives with
 * week 3. The column is already in the output so the shape a script parses does not change.
 */
export type ToolStatus = {
  name: string;
  kind: string;
  url: string;
  isPublic: boolean;
  isIgnored: boolean;
  calls: number;
  /** `ok / calls`, or `null` with no calls. */
  you: number | null;
  medianMs: number | null;
  outcomes: Record<string, number>;
  network: NetworkReading | null;
  verdict: Verdict;
};

export type Alert = {
  tool: string;
  kind: string;
  before: string | null;
  after: string | null;
  ts: string;
};

export const RETENTION_DAYS = 90;

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : Math.round((sorted[mid - 1]! + sorted[mid]!) / 2);
}

/**
 * Calls older than the retention window become one row per day and per tool, then go. The daily
 * rows keep the counts `arp status --days 365` would need, and nothing else.
 */
export function compact(db: Db, now: Date): void {
  const cutoff = new Date(now.getTime() - RETENTION_DAYS * 86_400_000).toISOString();
  db.exec('BEGIN');
  try {
    db.prepare(
      `INSERT INTO calls_daily (day, tool_id, calls, ok)
             SELECT substr(ts, 1, 10), tool_id, COUNT(*), SUM(outcome = 'ok') FROM calls WHERE ts < ?
             GROUP BY substr(ts, 1, 10), tool_id
             ON CONFLICT(day, tool_id) DO UPDATE SET calls = calls + excluded.calls, ok = ok + excluded.ok`,
    ).run(cutoff);
    db.prepare('DELETE FROM calls WHERE ts < ?').run(cutoff);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

export function readStatus(
  db: Db,
  {
    days = 7,
    now = new Date(),
    network = new Map<string, NetworkReading>(),
  }: { days?: number; now?: Date; network?: Map<string, NetworkReading> } = {},
): { tools: ToolStatus[]; alerts: Alert[] } {
  const since = new Date(now.getTime() - days * 86_400_000).toISOString();
  const tools = db.prepare('SELECT tool_id, name, kind, url, public, ignored FROM tools').all();
  const out: ToolStatus[] = [];
  for (const tool of tools) {
    const id = String(tool.tool_id);
    const rows = db
      .prepare('SELECT outcome, duration_ms FROM calls WHERE tool_id = ? AND ts >= ?')
      .all(id, since);
    const outcomes: Record<string, number> = {};
    const durations: number[] = [];
    for (const row of rows) {
      const outcome = String(row.outcome);
      outcomes[outcome] = (outcomes[outcome] ?? 0) + 1;
      if (typeof row.duration_ms === 'number') durations.push(row.duration_ms);
    }
    const daily =
      days > RETENTION_DAYS
        ? db
            .prepare(
              'SELECT COALESCE(SUM(calls), 0) AS calls, COALESCE(SUM(ok), 0) AS ok FROM calls_daily WHERE tool_id = ? AND day >= ?',
            )
            .get(id, since.slice(0, 10))
        : undefined;
    const calls = rows.length + Number(daily?.calls ?? 0);
    const ok = (outcomes.ok ?? 0) + Number(daily?.ok ?? 0);
    const change = db
      .prepare('SELECT MAX(ts) AS ts FROM changes WHERE tool_id = ? AND ts >= ?')
      .get(id, since);
    const local: LocalStats = {
      calls,
      ok,
      auth: outcomes.auth ?? 0,
      medianMs: median(durations),
      lastChange: typeof change?.ts === 'string' ? change.ts : null,
    };
    const reading = network.get(id) ?? null;
    out.push({
      name: String(tool.name),
      kind: String(tool.kind),
      url: String(tool.url),
      isPublic: tool.public === 1,
      isIgnored: tool.ignored === 1,
      calls,
      you: calls === 0 ? null : ok / calls,
      medianMs: local.medianMs,
      outcomes,
      network: reading,
      verdict: verdictFor(local, reading, now),
    });
  }
  out.sort(
    (a, b) =>
      urgency(a.verdict) - urgency(b.verdict) || b.calls - a.calls || a.name.localeCompare(b.name),
  );

  const alerts = db
    .prepare(
      'SELECT t.name AS tool, c.kind AS kind, c.before AS before, c.after AS after, c.ts AS ts FROM changes c JOIN tools t ON t.tool_id = c.tool_id WHERE c.ts >= ? ORDER BY c.ts DESC',
    )
    .all(since)
    .map((row) => ({
      tool: String(row.tool),
      kind: String(row.kind),
      before: typeof row.before === 'string' ? row.before : null,
      after: typeof row.after === 'string' ? row.after : null,
      ts: String(row.ts),
    }));
  return { tools: out, alerts };
}

const pct = (value: number | null) => (value === null ? '' : `${Math.round(value * 100)} %`);

function alertLine(alert: Alert): string {
  if (alert.kind === 'host_changed')
    return `! ${alert.tool} moved from ${alert.before ?? '?'} to ${alert.after ?? '?'} (${alert.ts.slice(0, 10)})`;
  return `! ${alert.tool}: ${alert.kind} (${alert.ts.slice(0, 10)})`;
}

/** The plain text table. Columns: tool, calls, you, network, median, verdict. */
export function renderStatus(
  { tools, alerts }: { tools: ToolStatus[]; alerts: Alert[] },
  days: number,
): string {
  if (tools.length === 0) {
    return 'No MCP tool call recorded yet. Use your agent with an MCP server, then run arp status again.\n';
  }
  const lines: string[] = [];
  for (const alert of alerts) lines.push(alertLine(alert));
  if (alerts.length > 0) lines.push('');
  const header = ['tool', 'calls', 'you', 'network', 'median', 'verdict'];
  const body = tools.map((tool) => [
    tool.name + (tool.isPublic && !tool.isIgnored ? '' : ' (private)'),
    String(tool.calls),
    pct(tool.you),
    tool.network === null
      ? 'not read yet'
      : `${pct(tool.network.success)} of ${tool.network.operators}`,
    tool.medianMs === null ? '' : `${tool.medianMs} ms`,
    verdictText(tool.verdict),
  ]);
  const widths = header.map((h, i) => Math.max(h.length, ...body.map((row) => row[i]!.length)));
  const fmt = (row: string[]) =>
    row
      .map((cell, i) =>
        i === 0 || i === row.length - 1 ? cell.padEnd(widths[i]!) : cell.padStart(widths[i]!),
      )
      .join('   ')
      .trimEnd();
  lines.push(fmt(header), ...body.map(fmt), '', `Last ${days} days, this machine only.`);
  return `${lines.join('\n')}\n`;
}

/** `arp status <tool>`: one tool, by day, by error category. */
export function renderToolDetail(
  db: Db,
  name: string,
  { days = 7, now = new Date() }: { days?: number; now?: Date } = {},
): string | null {
  const tool = db
    .prepare('SELECT tool_id, name, kind, url, public, ignored FROM tools WHERE name = ?')
    .get(name);
  if (tool === undefined) return null;
  const since = new Date(now.getTime() - days * 86_400_000).toISOString();
  const id = String(tool.tool_id);
  const byDay = db
    .prepare(
      "SELECT substr(ts, 1, 10) AS day, COUNT(*) AS calls, SUM(outcome = 'ok') AS ok FROM calls WHERE tool_id = ? AND ts >= ? GROUP BY day ORDER BY day",
    )
    .all(id, since);
  const byOutcome = db
    .prepare(
      "SELECT outcome, code, COUNT(*) AS n FROM calls WHERE tool_id = ? AND ts >= ? AND outcome != 'ok' GROUP BY outcome, code ORDER BY n DESC",
    )
    .all(id, since);
  const changes = db
    .prepare(
      'SELECT ts, kind, before, after FROM changes WHERE tool_id = ? ORDER BY ts DESC LIMIT 10',
    )
    .all(id);
  const lines = [
    `${String(tool.name)}  ${String(tool.kind)}  ${tool.url === '' ? 'private, never published' : String(tool.url)}${tool.ignored === 1 ? '  (ignored)' : ''}`,
    '',
    'day          calls   you',
    ...byDay.map(
      (row) =>
        `${String(row.day)}   ${String(row.calls).padStart(5)}   ${pct(Number(row.ok) / Number(row.calls)).padStart(5)}`,
    ),
    '',
    byOutcome.length === 0 ? 'No failure in the window.' : 'failures',
    ...byOutcome.map(
      (row) =>
        `  ${String(row.outcome)}${typeof row.code === 'string' ? ` ${row.code}` : ''}   ${String(row.n)}`,
    ),
  ];
  if (changes.length > 0) {
    lines.push(
      '',
      'changes',
      ...changes.map(
        (row) =>
          `  ${String(row.ts).slice(0, 10)}  ${String(row.kind)}  ${String(row.before ?? '')} -> ${String(row.after ?? '')}`,
      ),
    );
  }
  lines.push('', 'What other agents switched to: not read yet in this version.');
  return `${lines.join('\n')}\n`;
}
