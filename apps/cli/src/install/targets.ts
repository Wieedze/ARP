import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  arpHooksOf,
  codexBlockOf,
  formatJson,
  hasArpHook,
  hasCodexServer,
  parseJsonConfig,
  withArpHooks,
  withCodexServer,
  withMcpServer,
  type McpServer,
} from './edits.ts';
import type { InstallEnv } from './env.ts';

/**
 * The runtimes `arp init` writes to, and what it writes. `docs/tasks/33-one-installer.md` 33c.
 *
 * | runtime | MCP server | hook |
 * | --- | --- | --- |
 * | Claude Code | `claude mcp add-json … --scope user` if `claude` is on PATH, else `~/.claude.json` | `~/.claude/settings.json` |
 * | Grok Build | nothing of its own: it reads Claude Code's two files, written here if Claude Code is not | the same |
 * | Cursor | `~/.cursor/mcp.json` | none: its hook format could not be read (task 33 §3.5) |
 * | Gemini CLI | `~/.gemini/settings.json` | none yet: no Gemini payload adapter (task 33a) |
 * | Codex | `~/.codex/config.toml`, between marker comments | none yet: no Codex payload adapter (task 33a) |
 *
 * A hook is written only where the hook can read what the runtime sends. Installing one elsewhere
 * would record nothing and look as though it worked.
 */
export type RuntimeId = 'claude' | 'grok' | 'cursor' | 'gemini' | 'codex';
export const RUNTIME_IDS: readonly RuntimeId[] = ['claude', 'grok', 'cursor', 'gemini', 'codex'];

/** One change. A file step carries both texts so the caller can tell whether anything changes. */
export type Step =
  | {
      kind: 'file';
      path: string;
      before: string | null;
      after: string | null;
      summary: string;
      /** Only the part of the file we touch, as `- before` / `+ after` lines. */
      diff: string[];
    }
  | { kind: 'command'; argv: string[]; summary: string; diff: string[] }
  | { kind: 'skip'; summary: string };

export type Commands = {
  mcp: McpServer;
  /** The hook command line, quoted for a shell. */
  hook: string;
  /** Where `init` copies the hook. Its path is how our hook entries are recognised. */
  hookFile: string;
};

export const SERVER_NAME = 'arp';

function read(path: string): string | null {
  try {
    return existsSync(path) ? readFileSync(path, 'utf8') : null;
  } catch {
    return null;
  }
}

/** The commands `init` installs, from where this `arp` is running. */
export function commandsFor(env: InstallEnv, cliPath: string): Commands {
  const hookFile = join(env.home, '.arp', 'bin', 'hook.js');
  // Run from `npx`'s cache, a path written into a config would vanish with the cache. The MCP
  // server starts once per session, so launching it through `npx` is affordable; the hook runs on
  // every call and is copied out instead (ADR `0089` §2).
  const fromNpx = /[\\/]_npx[\\/]/.test(cliPath);
  const mcp: McpServer = fromNpx
    ? { command: 'npx', args: ['-y', `@arp-protocol/cli@${env.version}`, 'mcp'] }
    : { command: env.node, args: [cliPath, 'mcp'] };
  return { mcp, hook: `"${env.node}" "${hookFile}"`, hookFile };
}

/** `- ` lines for what was there, `+ ` lines for what will be. Nothing for an absent side. */
export function diffLines(before: unknown, after: unknown): string[] {
  const lines = (value: unknown, sign: string) =>
    value === undefined ||
    (typeof value === 'object' && value !== null && Object.keys(value).length === 0)
      ? []
      : JSON.stringify(value, null, 2)
          .split('\n')
          .map((line) => `${sign} ${line}`);
  return [...lines(before, '-'), ...lines(after, '+')];
}

function serversOf(config: Record<string, unknown>): Record<string, unknown> {
  // `as`: an object that is not an array, checked in the same expression.
  return typeof config.mcpServers === 'object' &&
    config.mcpServers !== null &&
    !Array.isArray(config.mcpServers)
    ? (config.mcpServers as Record<string, unknown>)
    : {};
}

function jsonStep(
  path: string,
  edit: (config: Record<string, unknown>) => Record<string, unknown>,
  summary: string,
  view: (config: Record<string, unknown>) => unknown,
): Step {
  const before = read(path);
  const parsed = parseJsonConfig(before);
  if (parsed instanceof Error) {
    return {
      kind: 'skip',
      summary: `${path} is not valid JSON (${parsed.message}); left as it is`,
    };
  }
  const next = edit(parsed);
  const after = Object.keys(next).length === 0 && before === null ? null : formatJson(next);
  return { kind: 'file', path, before, after, summary, diff: diffLines(view(parsed), view(next)) };
}

function claudeFiles(env: InstallEnv, project: boolean) {
  const root = project ? env.cwd : env.home;
  return {
    mcp: project ? join(env.cwd, '.mcp.json') : join(env.home, '.claude.json'),
    settings: join(root, '.claude', 'settings.json'),
  };
}

function mcpEntry(server: McpServer, typed: boolean): Record<string, unknown> {
  return typed
    ? { type: 'stdio', command: server.command, args: server.args }
    : { command: server.command, args: server.args };
}

export type Runtime = {
  id: RuntimeId;
  name: string;
  detect: (env: InstallEnv) => boolean;
  install: (env: InstallEnv, commands: Commands, project: boolean) => Step[];
  remove: (env: InstallEnv, commands: Commands, project: boolean) => Step[];
  /** Each check: what it is and whether it holds. */
  check: (env: InstallEnv, commands: Commands, project: boolean) => [string, boolean][];
};

function claudeMcpSteps(
  env: InstallEnv,
  commands: Commands,
  project: boolean,
  remove: boolean,
  allowCli: boolean,
): Step[] {
  const files = claudeFiles(env, project);
  // The CLI writes `~/.claude.json` itself, which a running Claude Code also rewrites; going
  // through it avoids the two writers racing. Without it, the file is edited directly.
  if (allowCli && !project && env.which('claude') !== null) {
    // Decided now, not at write time, so a second run finds nothing to do. `claude mcp add-json`
    // refuses a name that exists, so a changed entry is removed and added again.
    const got = env.run(['claude', 'mcp', 'get', SERVER_NAME]);
    const present = got.code === 0;
    const same =
      present &&
      [commands.mcp.command, ...commands.mcp.args].every((part) => got.stdout.includes(part));
    const removeStep: Step = {
      kind: 'command',
      argv: ['claude', 'mcp', 'remove', SERVER_NAME, '--scope', 'user'],
      summary: 'claude mcp remove arp --scope user',
      diff: [],
    };
    const entry = mcpEntry(commands.mcp, true);
    const addStep: Step = {
      kind: 'command',
      argv: ['claude', 'mcp', 'add-json', SERVER_NAME, JSON.stringify(entry), '--scope', 'user'],
      summary: 'claude mcp add-json arp … --scope user',
      diff: diffLines(undefined, entry),
    };
    if (remove)
      return present
        ? [removeStep]
        : [{ kind: 'skip', summary: 'MCP server "arp" not declared (claude mcp get arp)' }];
    if (same)
      return [
        {
          kind: 'skip',
          summary: 'MCP server "arp" already declared with this command (claude mcp get arp)',
        },
      ];
    return present ? [removeStep, addStep] : [addStep];
  }
  return [
    jsonStep(
      files.mcp,
      (config) => withMcpServer(config, SERVER_NAME, remove ? null : mcpEntry(commands.mcp, false)),
      remove
        ? 'mcpServers.arp removed'
        : `mcpServers.arp → ${commands.mcp.command} ${commands.mcp.args.join(' ')}`,
      (config) => serversOf(config)[SERVER_NAME],
    ),
  ];
}

function claudeHookStep(
  env: InstallEnv,
  commands: Commands,
  project: boolean,
  remove: boolean,
): Step {
  return jsonStep(
    claudeFiles(env, project).settings,
    (settings) => withArpHooks(settings, remove ? null : commands.hook, commands.hookFile),
    remove
      ? 'hooks: arp removed from PostToolUse and PostToolUseFailure'
      : 'hooks: arp on PostToolUse and PostToolUseFailure, async',
    (settings) => arpHooksOf(settings, commands.hookFile),
  );
}

function claudeChecks(env: InstallEnv, commands: Commands, project: boolean): [string, boolean][] {
  const files = claudeFiles(env, project);
  const mcp = parseJsonConfig(read(files.mcp));
  const settings = parseJsonConfig(read(files.settings));
  const servers = mcp instanceof Error ? {} : serversOf(mcp);
  const viaCli =
    !project && env.which('claude') !== null
      ? env.run(['claude', 'mcp', 'get', SERVER_NAME]).code === 0
      : false;
  return [
    [
      `MCP server "arp" declared (${viaCli ? 'claude mcp get' : files.mcp})`,
      viaCli || SERVER_NAME in servers,
    ],
    [
      `hook on PostToolUse and PostToolUseFailure (${files.settings})`,
      !(settings instanceof Error) && hasArpHook(settings, commands.hookFile),
    ],
  ];
}

const claude: Runtime = {
  id: 'claude',
  name: 'Claude Code',
  detect: (env) => env.which('claude') !== null || existsSync(join(env.home, '.claude')),
  install: (env, commands, project) => [
    ...claudeMcpSteps(env, commands, project, false, true),
    claudeHookStep(env, commands, project, false),
  ],
  remove: (env, commands, project) => [
    ...claudeMcpSteps(env, commands, project, true, true),
    claudeHookStep(env, commands, project, true),
  ],
  check: claudeChecks,
};

/**
 * Grok Build "automatically reads Claude Code marketplaces, plugins, skills, MCPs, agents, hooks"
 * (docs.x.ai/build/features/skills-plugins-marketplaces). So its install is Claude Code's two files,
 * edited directly: on a machine with Grok and no Claude Code there is no `claude` to race with.
 * When both are present, `claude` already wrote them and these steps change nothing.
 */
const grok: Runtime = {
  id: 'grok',
  name: 'Grok Build',
  detect: (env) => env.which('grok') !== null || existsSync(join(env.home, '.grok')),
  install: (env, commands, project) =>
    claude.detect(env)
      ? [{ kind: 'skip', summary: "reads Claude Code's files, written above" }]
      : [
          ...claudeMcpSteps(env, commands, project, false, false),
          claudeHookStep(env, commands, project, false),
        ],
  remove: (env, commands, project) =>
    claude.detect(env)
      ? [{ kind: 'skip', summary: "reads Claude Code's files, handled above" }]
      : [
          ...claudeMcpSteps(env, commands, project, true, false),
          claudeHookStep(env, commands, project, true),
        ],
  check: claudeChecks,
};

function jsonMcpRuntime(
  id: RuntimeId,
  name: string,
  dir: string,
  file: string,
  typed: boolean,
  binary: string,
): Runtime {
  const path = (env: InstallEnv, project: boolean) => join(project ? env.cwd : env.home, dir, file);
  return {
    id,
    name,
    detect: (env) => env.which(binary) !== null || existsSync(join(env.home, dir)),
    install: (env, commands, project) => [
      jsonStep(
        path(env, project),
        (config) => withMcpServer(config, SERVER_NAME, mcpEntry(commands.mcp, typed)),
        `mcpServers.arp → ${commands.mcp.command} ${commands.mcp.args.join(' ')}`,
        (config) => serversOf(config)[SERVER_NAME],
      ),
      { kind: 'skip', summary: 'no hook: not yet read for this runtime (task 33)' },
    ],
    remove: (env, _commands, project) => [
      jsonStep(
        path(env, project),
        (config) => withMcpServer(config, SERVER_NAME, null),
        'mcpServers.arp removed',
        (config) => serversOf(config)[SERVER_NAME],
      ),
    ],
    check: (env, _commands, project) => {
      const config = parseJsonConfig(read(path(env, project)));
      const present = !(config instanceof Error) && SERVER_NAME in serversOf(config);
      return [[`MCP server "arp" declared (${path(env, project)})`, present]];
    },
  };
}

function codexStep(env: InstallEnv, entry: McpServer | null, project: boolean): Step {
  const path = join(project ? env.cwd : env.home, '.codex', 'config.toml');
  const before = read(path);
  const after = withCodexServer(before, entry);
  if (after instanceof Error)
    return { kind: 'skip', summary: `${path}: ${after.message}; left as it is` };
  return {
    kind: 'file',
    path,
    before,
    // A file that held only our block was ours: removing the block removes the file.
    after: after.length === 0 ? null : after,
    summary:
      entry === null
        ? '[mcp_servers.arp] removed'
        : `[mcp_servers.arp] → ${entry.command} ${entry.args.join(' ')}`,
    diff: [
      ...codexBlockOf(before).map((line) => `- ${line}`),
      ...codexBlockOf(after).map((line) => `+ ${line}`),
    ],
  };
}

const codex: Runtime = {
  id: 'codex',
  name: 'Codex',
  detect: (env) => env.which('codex') !== null || existsSync(join(env.home, '.codex')),
  install: (env, commands, project) => [
    codexStep(env, commands.mcp, project),
    { kind: 'skip', summary: 'no hook: not yet read for this runtime (task 33)' },
  ],
  remove: (env, _commands, project) => [codexStep(env, null, project)],
  check: (env, _commands, project) => {
    const path = join(project ? env.cwd : env.home, '.codex', 'config.toml');
    return [[`MCP server "arp" declared (${path})`, hasCodexServer(read(path))]];
  },
};

export const RUNTIMES: readonly Runtime[] = [
  claude,
  grok,
  // Cursor's MCP docs list `type` for a stdio entry; Gemini's do not, so it is left out there.
  jsonMcpRuntime('cursor', 'Cursor', '.cursor', 'mcp.json', true, 'cursor'),
  jsonMcpRuntime('gemini', 'Gemini CLI', '.gemini', 'settings.json', false, 'gemini'),
  codex,
];
