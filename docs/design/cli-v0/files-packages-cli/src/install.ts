import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

/**
 * Register the hooks in Claude Code's settings, and nothing else in that file.
 *
 * | event | matcher | how |
 * | --- | --- | --- |
 * | `PreToolUse` | `mcp__.*` | `async`: never makes the agent wait |
 * | `PostToolUse` | `mcp__.*` | `async` |
 * | `PostToolUseFailure` | `mcp__.*` | `async` |
 * | `SessionStart` | all | synchronous, short timeout: its output is the context line the agent reads |
 *
 * **Idempotent**: running `arp init` twice leaves one copy of each hook. Ours are recognised by the
 * command pointing into `~/.arp/cli/`, and every other hook in the file is kept as it was.
 *
 * The command runs a copy of the CLI under `~/.arp/cli/` with the current `node`, rather than
 * `npx …`: `npx` costs hundreds of milliseconds per call and its cache can be cleaned, which would
 * silently disable the hook.
 */
export const HOOK_EVENTS = ['PreToolUse', 'PostToolUse', 'PostToolUseFailure'] as const;

export type HookCommand = { type: 'command'; command: string; timeout?: number; async?: boolean };
type MatcherGroup = { matcher?: string; hooks: HookCommand[] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function cliHome(arpHomeDir: string): string {
  return join(arpHomeDir, 'cli');
}

export function hookCommand(nodePath: string, arpHomeDir: string): string {
  return `"${nodePath}" "${join(cliHome(arpHomeDir), 'cli.js')}" hook`;
}

function isOurs(hook: unknown, marker: string): boolean {
  return isRecord(hook) && typeof hook.command === 'string' && hook.command.includes(marker);
}

/** Merge our hooks into a parsed settings object, dropping any earlier copy of ours. */
export function withArpHooks(
  settings: Record<string, unknown>,
  command: string,
  marker: string,
): Record<string, unknown> {
  const hooks: Record<string, unknown> = isRecord(settings.hooks) ? { ...settings.hooks } : {};
  const strip = (groups: unknown): MatcherGroup[] => {
    if (!Array.isArray(groups)) return [];
    const kept: MatcherGroup[] = [];
    for (const group of groups) {
      if (!isRecord(group) || !Array.isArray(group.hooks)) continue;
      const rest = group.hooks.filter((hook) => !isOurs(hook, marker));
      // Only the parsed shape changes; a group we did not write keeps its own fields.
      if (rest.length > 0) kept.push({ ...group, hooks: rest } as MatcherGroup); // safe: hooks is an array checked above
    }
    return kept;
  };
  for (const event of HOOK_EVENTS) {
    hooks[event] = [
      ...strip(hooks[event]),
      { matcher: 'mcp__.*', hooks: [{ type: 'command', command, timeout: 10, async: true }] },
    ];
  }
  hooks.SessionStart = [
    ...strip(hooks.SessionStart),
    { hooks: [{ type: 'command', command, timeout: 5 }] },
  ];
  return { ...settings, hooks };
}

/** Remove our hooks only. Used by `arp forget --uninstall` and by the tests. */
export function withoutArpHooks(
  settings: Record<string, unknown>,
  marker: string,
): Record<string, unknown> {
  if (!isRecord(settings.hooks)) return settings;
  const hooks: Record<string, unknown> = {};
  for (const [event, groups] of Object.entries(settings.hooks)) {
    if (!Array.isArray(groups)) {
      hooks[event] = groups;
      continue;
    }
    const kept = groups
      .filter(isRecord)
      .map((group) =>
        Array.isArray(group.hooks)
          ? { ...group, hooks: group.hooks.filter((hook) => !isOurs(hook, marker)) }
          : group,
      )
      .filter((group) => !Array.isArray(group.hooks) || group.hooks.length > 0);
    if (kept.length > 0) hooks[event] = kept;
  }
  if (Object.keys(hooks).length === 0) {
    const { hooks: _dropped, ...rest } = settings;
    return rest;
  }
  return { ...settings, hooks };
}

export function readSettings(path: string): Record<string, unknown> {
  if (!existsSync(path)) return {};
  const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'));
  if (!isRecord(parsed)) throw new Error(`${path} is not a JSON object`);
  return parsed;
}

export function writeSettings(path: string, settings: Record<string, unknown>): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(settings, null, 2)}\n`);
}

/** Copy the built CLI next to the database, so the hook does not depend on an `npx` cache. */
export function installCli(fromDir: string, arpHomeDir: string): string {
  const to = cliHome(arpHomeDir);
  mkdirSync(to, { recursive: true });
  cpSync(fromDir, to, {
    recursive: true,
    filter: (src) => !src.endsWith('.map') && !src.endsWith('.d.ts'),
  });
  writeFileSync(join(to, 'package.json'), `${JSON.stringify({ type: 'module' })}\n`);
  return to;
}
