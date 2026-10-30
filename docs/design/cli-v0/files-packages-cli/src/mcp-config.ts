import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

/**
 * Which MCP servers this user has configured, and what each one **is**, so a call to
 * `mcp__github__create_issue` can be tied to a tool somebody else can name too.
 *
 * Read at session start, never per call. Sources, later ones winning for the same name, which is
 * how Claude Code scopes them:
 *
 * 1. `~/.claude.json` → `mcpServers` (user scope),
 * 2. `~/.claude.json` → `projects[<cwd>].mcpServers` (local scope),
 * 3. `<cwd>/.mcp.json` → `mcpServers` (project scope).
 *
 * A file that is missing or unreadable is skipped: the hook never fails because of configuration.
 */
export type ServerEntry =
  | { transport: 'remote'; url: string }
  | { transport: 'local'; command: string; args: string[] };

export type ToolSource =
  /** A remote MCP server: its URL is the tool. */
  | { kind: 'mcp_remote'; url: string; host: string }
  /** A local server started from a published package: the package page is the tool. */
  | { kind: 'mcp_local'; url: string; host: string }
  /** A script, a private path, anything nobody else can name. Shown locally, never published. */
  | { kind: 'private' };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readJson(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return undefined;
  }
}

function entryOf(raw: unknown): ServerEntry | null {
  if (!isRecord(raw)) return null;
  if (typeof raw.url === 'string' && raw.url.length > 0)
    return { transport: 'remote', url: raw.url };
  if (typeof raw.command === 'string' && raw.command.length > 0) {
    const args = Array.isArray(raw.args)
      ? raw.args.filter((a): a is string => typeof a === 'string')
      : [];
    return { transport: 'local', command: raw.command, args };
  }
  return null;
}

function collect(into: Map<string, ServerEntry>, servers: unknown): void {
  if (!isRecord(servers)) return;
  for (const [name, raw] of Object.entries(servers)) {
    const entry = entryOf(raw);
    if (entry !== null) into.set(name, entry);
  }
}

export function readMcpServers({
  cwd,
  home = homedir(),
}: {
  cwd: string;
  home?: string;
}): Map<string, ServerEntry> {
  const servers = new Map<string, ServerEntry>();
  const user = readJson(join(home, '.claude.json'));
  if (isRecord(user)) {
    collect(servers, user.mcpServers);
    if (isRecord(user.projects)) {
      const project = user.projects[cwd];
      if (isRecord(project)) collect(servers, project.mcpServers);
    }
  }
  const shared = readJson(join(cwd, '.mcp.json'));
  if (isRecord(shared)) collect(servers, shared.mcpServers);
  return servers;
}

/**
 * The package a launcher runs: the first argument that is not a flag.
 *
 * `npx -y @scope/pkg@1.2 --stdio` → `@scope/pkg`. The version is dropped: the tool is the package,
 * and a version bump must not become a new atom.
 */
function packageArg(args: readonly string[]): string | null {
  const first = args.find((arg) => !arg.startsWith('-'));
  if (first === undefined) return null;
  const at = first.lastIndexOf('@');
  return at > 0 ? first.slice(0, at) : first;
}

const NPM_LAUNCHERS = new Set(['npx', 'bunx', 'pnpx']);
const PYPI_LAUNCHERS = new Set(['uvx', 'pipx']);

/**
 * What a configured server is, in the order the spec resolves it: a remote URL, then a published
 * package's page on npm or PyPI, else private.
 *
 * The URL is returned raw. Normalising it (ADR `0054`) is `@arp-protocol/core`'s job and happens
 * outside the hook, so the hook never loads that package.
 */
export function sourceOf(entry: ServerEntry | undefined): ToolSource {
  if (entry === undefined) return { kind: 'private' };
  if (entry.transport === 'remote') {
    try {
      const url = new URL(entry.url);
      if (url.protocol !== 'https:' && url.protocol !== 'http:') return { kind: 'private' };
      if (url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '::1') {
        return { kind: 'private' };
      }
      return { kind: 'mcp_remote', url: entry.url, host: url.hostname };
    } catch {
      return { kind: 'private' };
    }
  }
  const launcher = entry.command.split(/[\\/]/).pop() ?? entry.command;
  const args = launcher === 'pipx' && entry.args[0] === 'run' ? entry.args.slice(1) : entry.args;
  const pkg = packageArg(args);
  if (pkg === null || pkg.startsWith('.') || pkg.startsWith('/')) return { kind: 'private' };
  if (NPM_LAUNCHERS.has(launcher)) {
    return {
      kind: 'mcp_local',
      url: `https://www.npmjs.com/package/${pkg}`,
      host: 'www.npmjs.com',
    };
  }
  if (PYPI_LAUNCHERS.has(launcher)) {
    return { kind: 'mcp_local', url: `https://pypi.org/project/${pkg}`, host: 'pypi.org' };
  }
  return { kind: 'private' };
}
