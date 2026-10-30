/**
 * Pure edits of another program's configuration: ours in, ours out, nothing else touched.
 *
 * Each function takes the file's current text (or `null` when it does not exist) and returns the
 * new text, so `init` can compare the two and write only when they differ. Running it twice
 * therefore changes nothing the second time (clig.dev, "Robustness": idempotent).
 */

export type McpServer = { command: string; args: string[] };

type Json = Record<string, unknown>;

function isRecord(value: unknown): value is Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Parse a config file. A file that exists and is not a JSON object is refused, never overwritten. */
export function parseJsonConfig(text: string | null): Json | Error {
  if (text === null || text.trim().length === 0) return {};
  try {
    const parsed: unknown = JSON.parse(text);
    return isRecord(parsed) ? parsed : new Error('not a JSON object');
  } catch (error) {
    return error instanceof Error ? error : new Error(String(error));
  }
}

export function formatJson(value: Json): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

/** `mcpServers.<name> = entry`, or removed when `entry` is `null`. Other servers are kept as they were. */
export function withMcpServer(config: Json, name: string, entry: Json | null): Json {
  const servers: Json = isRecord(config.mcpServers) ? { ...config.mcpServers } : {};
  if (entry === null) delete servers[name];
  else servers[name] = entry;
  const next: Json = { ...config, mcpServers: servers };
  if (entry === null && Object.keys(servers).length === 0) delete next.mcpServers;
  return next;
}

/**
 * How one runtime registers a hook. Two shapes exist in the docs read for task 33:
 *
 * | shape | file | runtimes |
 * | --- | --- | --- |
 * | `nested` | `hooks.<Event>: [{ matcher, hooks: [entry] }]` | Claude Code, Codex, Gemini CLI |
 * | `flat` | `{ version: 1, hooks: { <event>: [entry] } }` | Cursor, Copilot |
 */
export type HookSpec = {
  shape: 'nested' | 'flat';
  events: readonly { name: string; matcher?: string }[];
  /** The entry for one command, in this runtime's field names and timeout unit. */
  entry: (command: string) => Json;
};

/** Claude Code: a failed call reaches only `PostToolUseFailure` (ADR `0090`). */
export const CLAUDE_HOOKS: HookSpec = {
  shape: 'nested',
  events: [
    { name: 'PostToolUse', matcher: '*' },
    { name: 'PostToolUseFailure', matcher: '*' },
  ],
  entry: (command) => ({ type: 'command', command, async: true, timeout: 10 }),
};

function isOurs(hook: unknown, marker: string): boolean {
  return isRecord(hook) && typeof hook.command === 'string' && hook.command.includes(marker);
}

/** One event's list without our entries. Everything we did not write keeps every field it had. */
function strip(list: unknown, spec: HookSpec, marker: string): unknown[] {
  if (!Array.isArray(list)) return [];
  if (spec.shape === 'flat') return list.filter((entry) => !isOurs(entry, marker));
  const kept: unknown[] = [];
  for (const group of list) {
    if (!isRecord(group) || !Array.isArray(group.hooks)) {
      kept.push(group);
      continue;
    }
    const rest = group.hooks.filter((hook) => !isOurs(hook, marker));
    if (rest.length > 0) kept.push({ ...group, hooks: rest });
  }
  return kept;
}

function ours(list: unknown, spec: HookSpec, marker: string): unknown[] {
  if (!Array.isArray(list)) return [];
  if (spec.shape === 'flat') return list.filter((entry) => isOurs(entry, marker));
  return list.flatMap((group) =>
    isRecord(group) && Array.isArray(group.hooks)
      ? group.hooks.filter((hook) => isOurs(hook, marker))
      : [],
  );
}

/**
 * The runtime's `hooks` with ours on every event of `spec`, any earlier copy of ours dropped first,
 * or with ours removed when `command` is `null`. Ours are recognised by `marker`, a path only
 * `init` writes. Every other hook stays.
 */
export function withHooks(
  settings: Json,
  spec: HookSpec,
  command: string | null,
  marker: string,
): Json {
  const hooks: Json = isRecord(settings.hooks) ? { ...settings.hooks } : {};
  for (const event of spec.events) {
    const kept = strip(hooks[event.name], spec, marker);
    if (command !== null) {
      const entry = spec.entry(command);
      kept.push(
        spec.shape === 'flat'
          ? entry
          : { ...(event.matcher === undefined ? {} : { matcher: event.matcher }), hooks: [entry] },
      );
    }
    if (kept.length > 0) hooks[event.name] = kept;
    else delete hooks[event.name];
  }
  const next: Json = { ...settings, hooks };
  if (Object.keys(hooks).length === 0) {
    delete next.hooks;
    // A flat file we created holds only `version` once ours is gone; it is empty.
    if (spec.shape === 'flat' && Object.keys(next).length === 1 && 'version' in next) return {};
  } else if (spec.shape === 'flat' && next.version === undefined) {
    return { version: 1, ...next };
  }
  return next;
}

/** Our entries only, by event: what `init` shows the operator before writing. */
export function hooksOf(settings: Json, spec: HookSpec, marker: string): Json {
  if (!isRecord(settings.hooks)) return {};
  const out: Json = {};
  for (const event of spec.events) {
    const found = ours(settings.hooks[event.name], spec, marker);
    if (found.length > 0) out[event.name] = found;
  }
  return out;
}

export function hasHooks(settings: Json, spec: HookSpec, marker: string): boolean {
  const found = hooksOf(settings, spec, marker);
  return spec.events.every((event) => event.name in found);
}

const TOML_BEGIN = '# >>> arp — managed by `arp init`, removed by `arp uninstall` >>>';
const TOML_END = '# <<< arp <<<';

function tomlString(value: string): string {
  return JSON.stringify(value); // a TOML basic string has JSON's escapes for these characters
}

/**
 * Codex's `config.toml`: our `[mcp_servers.arp]` table between two marker comments, so it can be
 * replaced or removed without parsing TOML (clig.dev, "Configuration": delineate your additions).
 * Returns an `Error` when a table of that name exists outside the markers: it is not ours to change.
 */
export function withCodexServer(text: string | null, entry: McpServer | null): string | Error {
  const current = text ?? '';
  const begin = current.indexOf(TOML_BEGIN);
  const end = current.indexOf(TOML_END);
  const hasBlock = begin !== -1 && end > begin;
  const outside = hasBlock
    ? current.slice(0, begin) + current.slice(end + TOML_END.length)
    : current;
  if (/^\s*\[mcp_servers\.arp\]/m.test(outside)) {
    return new Error('an [mcp_servers.arp] table exists that `arp init` did not write');
  }
  let base = outside.replace(/\n{3,}/g, '\n\n').replace(/\s+$/, '');
  if (entry === null) return base.length === 0 ? '' : `${base}\n`;
  const block = [
    TOML_BEGIN,
    '[mcp_servers.arp]',
    `command = ${tomlString(entry.command)}`,
    `args = [${entry.args.map(tomlString).join(', ')}]`,
    TOML_END,
  ].join('\n');
  base = base.length === 0 ? '' : `${base}\n\n`;
  return `${base}${block}\n`;
}

/** Our block's lines in a Codex config, or none. */
export function codexBlockOf(text: string | null): string[] {
  if (text === null) return [];
  const begin = text.indexOf(TOML_BEGIN);
  const end = text.indexOf(TOML_END);
  return begin === -1 || end < begin ? [] : text.slice(begin, end + TOML_END.length).split('\n');
}

export function hasCodexServer(text: string | null): boolean {
  return text !== null && text.includes(TOML_BEGIN) && text.includes(TOML_END);
}
