import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

/**
 * What a configured MCP server **is**, so `mcp__github__create_issue` can be tied to a URL anybody
 * else can name too. Taken from the `arp-cli-v0` patch
 * (`docs/design/cli-v0/files-packages-cli/src/mcp-config.ts`).
 *
 * Sources, later ones winning for the same name, which is how Claude Code scopes them:
 *
 * 1. `~/.claude.json` → `mcpServers` (user scope),
 * 2. `~/.claude.json` → `projects[<cwd>].mcpServers` (local scope),
 * 3. `<cwd>/.mcp.json` → `mcpServers` (project scope).
 *
 * Grok Build reads the same files, so this covers it. A plugin's own servers
 * (`mcp__plugin_<plugin>_<server>__…`) are in the plugin's `.mcp.json` and are not found here: they
 * stay without a reference rather than being guessed at.
 *
 * A file that is missing or unreadable is skipped. The hook never fails because of configuration.
 */
export type ServerEntry =
  | { transport: 'remote'; url: string }
  | { transport: 'local'; command: string; args: string[] };

/** The URL that names a server, or `null` for a script, a local path or localhost. */
export type ServerUrl = string | null;

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
      ? raw.args.filter((arg): arg is string => typeof arg === 'string')
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
 * The package a launcher runs: the first argument that is not a flag, without its version.
 *
 * `npx -y @scope/pkg@1.2 --stdio` → `@scope/pkg`. A version bump must not become a new tool.
 */
function packageArg(args: readonly string[]): string | null {
  const first = args.find((arg) => !arg.startsWith('-'));
  if (first === undefined) return null;
  const at = first.lastIndexOf('@');
  return at > 0 ? first.slice(0, at) : first;
}

const NPM_LAUNCHERS = new Set(['npx', 'bunx', 'pnpx']);
const PYPI_LAUNCHERS = new Set(['uvx', 'pipx']);
const LOCALHOST = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

/**
 * A path segment shaped like a credential: long, and mixing letters with digits. Some servers put
 * the key in the path (`/s/<key>/mcp`), and that path is in the operator's configuration.
 */
const SECRET_SEGMENT = /^(?=[A-Za-z0-9_-]*[A-Za-z])(?=[A-Za-z0-9_-]*\d)[A-Za-z0-9_-]{24,}$/;

/**
 * A remote server's URL with nothing that could be a credential in it.
 *
 * The configured URL is the operator's, and it can carry a key — `?apiKey=…` in the query, `user:pass@`
 * before the host, or a token as a path segment. The log must not hold one, and an atom made from
 * one would publish it permanently. So the query, the fragment and the userinfo are always dropped,
 * and **a path with a credential-shaped segment is dropped whole**, leaving the origin. The cost,
 * accepted: two servers on one host that differ only by such a path name the same tool.
 */
function credentialFree(url: URL): string {
  const segments = url.pathname.split('/').filter((segment) => segment.length > 0);
  const path = segments.some((segment) => SECRET_SEGMENT.test(segment)) ? '' : url.pathname;
  const port = url.port === '' ? '' : `:${url.port}`;
  return `${url.protocol}//${url.hostname}${port}${path}`;
}

/**
 * A remote server's URL, else a published package's page on npm or PyPI, else `null`.
 *
 * Normalising it (ADR `0054`) is the caller's, through `normaliseToolUrl`.
 */
export function serverUrlOf(entry: ServerEntry | undefined): ServerUrl {
  if (entry === undefined) return null;
  if (entry.transport === 'remote') {
    try {
      const url = new URL(entry.url);
      if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
      return LOCALHOST.has(url.hostname) ? null : credentialFree(url);
    } catch {
      return null;
    }
  }
  const launcher = entry.command.split(/[\\/]/).pop() ?? entry.command;
  const args = launcher === 'pipx' && entry.args[0] === 'run' ? entry.args.slice(1) : entry.args;
  const pkg = packageArg(args);
  if (pkg === null || pkg.startsWith('.') || pkg.startsWith('/')) return null;
  if (NPM_LAUNCHERS.has(launcher)) return `https://www.npmjs.com/package/${pkg}`;
  if (PYPI_LAUNCHERS.has(launcher)) return `https://pypi.org/project/${pkg}`;
  return null;
}
