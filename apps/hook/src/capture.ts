import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * `arp hook --capture`: keep one runtime payload, redacted, so its adapter can be written from what
 * the runtime really sends rather than from its documentation (`docs/tasks/33-one-installer.md`
 * 33i). Nothing leaves the machine. The operator reads the file before handing it to anyone.
 *
 * **Deny by default**, because the formats being captured are the ones nobody has seen yet, so no
 * list of "content fields" can be trusted to be complete. The first version kept naming keys at any
 * depth and `mcp_server_url` verbatim; the verifier got a password, a token, a card number and
 * nested `name`/`type` strings through it.
 *
 * | where | strings | numbers | booleans | keys |
 * | --- | --- | --- | --- | --- |
 * | top level, a key in {@link TOP_LEVEL_NAMES} | kept | kept | kept | kept |
 * | top level, a URL key ({@link URL_KEYS}) | scheme and host only | — | — | kept |
 * | top level, any other key | `<string:N>` | kept | kept | kept if identifier-shaped |
 * | any deeper level | `<string:N>` | `<number>` | kept | kept if identifier-shaped, else `<key:N>` |
 *
 * **What is accepted, and why.**
 * - Top-level numbers are kept: durations, timestamps, exit codes.
 * - Booleans are kept at every depth: one bit, and `isError` is the field the adapter needs most.
 * - Identifier-shaped keys are kept: they are schema field names (`content`, `isError`, `repo`),
 *   and the adapter needs the structure. A key that is not identifier-shaped (`alice@corp.com`,
 *   `sk-live-…`) is data and is replaced.
 *
 * ADR `0090` records this residue.
 */
const TOP_LEVEL_NAMES = new Set([
  'hook_event_name',
  'hookEventName',
  'tool_name',
  'toolName',
  'tool_use_id',
  'toolUseId',
  'session_id',
  'sessionId',
  'conversation_id',
  'generation_id',
  'turn_id',
  'model',
  'model_id',
  'permission_mode',
  'permissionMode',
  'timestamp',
  'mcp_server_name',
  'original_request_name',
]);

/** Keys that can hold a URL, and so a credential: only the scheme and host survive. */
const URL_KEYS = new Set(['mcp_server_url', 'server_url', 'serverUrl', 'url']);

const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]{0,39}$/;

/** A long key mixing letters and digits is a credential used as a key (`AKIA…`, `ghp_…`), not a field name. */
const SECRET_SHAPED = /^(?=.*\d)(?=.*[A-Za-z]).{20,}$/;

function keyOf(key: string): string {
  return IDENTIFIER.test(key) && !SECRET_SHAPED.test(key) ? key : `<key:${key.length}>`;
}

function hostOnly(value: string): string {
  try {
    const url = new URL(value);
    return `${url.protocol}//${url.hostname}<rest:${value.length}>`;
  } catch {
    return `<string:${value.length}>`;
  }
}

function deep(value: unknown): unknown {
  if (typeof value === 'string') return `<string:${value.length}>`;
  if (typeof value === 'number') return '<number>';
  if (Array.isArray(value)) return value.map(deep);
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [keyOf(key), deep(item)]));
  }
  return value;
}

export function redact(payload: unknown): unknown {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    return deep(payload);
  }
  return Object.fromEntries(
    Object.entries(payload).map(([key, value]) => {
      if (typeof value === 'string') {
        if (URL_KEYS.has(key)) return [keyOf(key), hostOnly(value)];
        return [keyOf(key), TOP_LEVEL_NAMES.has(key) ? value : `<string:${value.length}>`];
      }
      if (typeof value === 'number' || typeof value === 'boolean' || value === null) {
        return [keyOf(key), value];
      }
      return [keyOf(key), deep(value)];
    }),
  );
}

/** Write one redacted payload as `<time>-<event>.json` in `dir`. Never throws. */
export function capture(payload: unknown, dir: string, now = new Date()): void {
  try {
    const record = redact(payload);
    const event =
      typeof record === 'object' && record !== null && !Array.isArray(record)
        ? Object.entries(record).find(
            ([key]) => key === 'hook_event_name' || key === 'hookEventName',
          )?.[1]
        : undefined;
    const name = `${now.toISOString().replace(/[:.]/g, '-')}-${String(event ?? 'event').replace(/[^A-Za-z]/g, '')}.json`;
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, name), `${JSON.stringify(record, null, 2)}\n`);
  } catch {
    // A capture is a convenience; it never costs the session the call it was watching.
  }
}
