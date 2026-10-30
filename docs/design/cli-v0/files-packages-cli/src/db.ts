import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

/**
 * The local database, `~/.arp/arp.db`.
 *
 * Everything the hook sees stays here. **What is never stored**: an argument, a response, a full
 * error message, a header, a key. An error is reduced to its category and at most a short code
 * (`502`). `test/privacy.test.ts` passes a known string through a call and searches the file for
 * it.
 *
 * `node:sqlite` rather than a native module: `npx @arp-protocol/cli` must work without a compiler,
 * and the hook must start fast, so nothing heavier than the runtime itself is loaded on its path.
 */
export type Db = DatabaseSync;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS tools (
    tool_id        TEXT PRIMARY KEY,
    name           TEXT NOT NULL,
    kind           TEXT NOT NULL,
    url            TEXT NOT NULL DEFAULT '',
    public         INTEGER NOT NULL DEFAULT 0,
    ignored        INTEGER NOT NULL DEFAULT 0,
    atom_id        TEXT,
    functions_hash TEXT,
    host           TEXT,
    first_seen     TEXT NOT NULL,
    last_seen      TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS calls (
    ts          TEXT NOT NULL,
    tool_id     TEXT NOT NULL REFERENCES tools(tool_id),
    function    TEXT NOT NULL,
    outcome     TEXT NOT NULL,
    code        TEXT,
    duration_ms INTEGER,
    session     TEXT
);
CREATE INDEX IF NOT EXISTS calls_tool_ts ON calls(tool_id, ts);
CREATE TABLE IF NOT EXISTS calls_daily (
    day       TEXT NOT NULL,
    tool_id   TEXT NOT NULL,
    calls     INTEGER NOT NULL,
    ok        INTEGER NOT NULL,
    PRIMARY KEY (day, tool_id)
);
CREATE TABLE IF NOT EXISTS changes (
    ts      TEXT NOT NULL,
    tool_id TEXT NOT NULL REFERENCES tools(tool_id),
    kind    TEXT NOT NULL,
    before  TEXT,
    after   TEXT,
    shown   INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS sync (
    ts      TEXT NOT NULL,
    tool_id TEXT NOT NULL,
    triple  TEXT,
    tx      TEXT,
    status  TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS pending (
    call_id TEXT PRIMARY KEY,
    started INTEGER NOT NULL
);
`;

/**
 * Open (and create) the database.
 *
 * `busy_timeout` is short on purpose: the hook would rather drop one event than make the agent
 * wait, and the caller treats any throw as "skip this event".
 */
export function openDb(path: string, { busyMs = 50 }: { busyMs?: number } = {}): Db {
  mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(`PRAGMA busy_timeout = ${Math.max(0, Math.floor(busyMs))};`);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec(SCHEMA);
  return db;
}
