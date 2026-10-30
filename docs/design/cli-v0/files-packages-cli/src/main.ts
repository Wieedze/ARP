import { existsSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { openDb, type Db } from './db.js';
import { handleHookEvent } from './hook.js';
import {
  hookCommand,
  installCli,
  readSettings,
  withArpHooks,
  withoutArpHooks,
  writeSettings,
} from './install.js';
import { arpHome, dbPath } from './paths.js';
import { compact, readStatus, renderStatus, renderToolDetail } from './status.js';

const USAGE = `arp: see what your agent's tools do.

  arp init [--project]       install the Claude Code hooks and the local database
  arp status [tool]          every tool over 7 days, or one tool in detail
             [--days N] [--json]
  arp ignore <tool>          never publish this tool
  arp forget [--uninstall]   erase the local database (and remove the hooks)
  arp sync                   publish now (arrives in a later version)
`;

function readStdin(limitMs: number): Promise<string> {
  return new Promise((resolve) => {
    if (process.stdin.isTTY) {
      resolve('');
      return;
    }
    let data = '';
    const done = () => resolve(data);
    const timer = setTimeout(done, limitMs);
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk: string) => {
      data += chunk;
    });
    process.stdin.on('end', () => {
      clearTimeout(timer);
      done();
    });
    process.stdin.on('error', () => {
      clearTimeout(timer);
      done();
    });
  });
}

/**
 * The hook entry point. **It always exits 0**: a locked or missing database, a malformed payload,
 * a full disk, all end here in silence, and the agent's call is never affected (ADR `0045`).
 * `ARP_DEBUG=1` writes the reason to stderr, which Claude Code shows nobody on exit 0.
 */
async function runHook(): Promise<number> {
  try {
    const raw = await readStdin(2000);
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return 0;
    const db = openDb(dbPath());
    try {
      // Narrowed to a non-array object above; the handler reads every field defensively.
      const result = handleHookEvent(db, parsed as Record<string, unknown>);
      if (result.context !== undefined) {
        process.stdout.write(
          JSON.stringify({
            hookSpecificOutput: {
              hookEventName: 'SessionStart',
              additionalContext: result.context,
            },
          }),
        );
      }
    } finally {
      db.close();
    }
  } catch (error) {
    if (process.env.ARP_DEBUG === '1') process.stderr.write(`arp hook: ${String(error)}\n`);
  }
  return 0;
}

function flag(args: string[], name: string): boolean {
  return args.includes(name);
}

function option(args: string[], name: string): string | undefined {
  const at = args.indexOf(name);
  return at >= 0 ? args[at + 1] : undefined;
}

function withDb<T>(fn: (db: Db) => T): T {
  const db = openDb(dbPath(), { busyMs: 1000 });
  try {
    return fn(db);
  } finally {
    db.close();
  }
}

function settingsPath(project: boolean): string {
  return project
    ? join(process.cwd(), '.claude', 'settings.json')
    : join(homedir(), '.claude', 'settings.json');
}

function init(args: string[]): number {
  const home = arpHome();
  const project = flag(args, '--project');
  withDb(() => undefined);
  installCli(dirname(fileURLToPath(import.meta.url)), home);
  const path = settingsPath(project);
  const marker = join(home, 'cli');
  writeSettings(
    path,
    withArpHooks(readSettings(path), hookCommand(process.execPath, home), marker),
  );
  process.stdout.write(
    [
      `Hooks installed in ${path}.`,
      `Local database: ${dbPath()}. Calls are recorded here and nothing leaves this machine in this version.`,
      'Restart Claude Code, use your agent, then run: arp status',
      '',
    ].join('\n'),
  );
  return 0;
}

function status(args: string[]): number {
  const daysRaw = option(args, '--days');
  const days = daysRaw === undefined ? 7 : Number(daysRaw);
  if (!Number.isInteger(days) || days <= 0) {
    process.stderr.write('--days takes a positive whole number of days.\n');
    return 1;
  }
  const json = flag(args, '--json');
  const tool = args.find((arg, i) => !arg.startsWith('--') && args[i - 1] !== '--days');
  if (!existsSync(dbPath())) {
    process.stdout.write(json ? '[]\n' : 'Nothing recorded yet. Run arp init first.\n');
    return 0;
  }
  return withDb((db) => {
    compact(db, new Date());
    if (tool !== undefined) {
      const detail = renderToolDetail(db, tool, { days });
      if (detail === null) {
        process.stderr.write(`No tool named ${tool}. Run arp status to see the names.\n`);
        return 1;
      }
      process.stdout.write(detail);
      return 0;
    }
    const result = readStatus(db, { days });
    process.stdout.write(
      json ? `${JSON.stringify(result, null, 2)}\n` : renderStatus(result, days),
    );
    return 0;
  });
}

function ignore(args: string[]): number {
  const tool = args[0];
  if (tool === undefined) {
    process.stderr.write('Usage: arp ignore <tool>\n');
    return 1;
  }
  return withDb((db) => {
    const changed = db.prepare('UPDATE tools SET ignored = 1 WHERE name = ?').run(tool);
    if (changed.changes === 0) {
      process.stderr.write(`No tool named ${tool}.\n`);
      return 1;
    }
    process.stdout.write(`${tool} will never be published.\n`);
    return 0;
  });
}

function forget(args: string[]): number {
  const path = dbPath();
  for (const file of [path, `${path}-wal`, `${path}-shm`]) rmSync(file, { force: true });
  if (flag(args, '--uninstall')) {
    const home = arpHome();
    for (const project of [false, true]) {
      const settings = settingsPath(project);
      if (existsSync(settings))
        writeSettings(settings, withoutArpHooks(readSettings(settings), join(home, 'cli')));
    }
    rmSync(join(home, 'cli'), { recursive: true, force: true });
    process.stdout.write('Local database erased and hooks removed.\n');
    return 0;
  }
  process.stdout.write('Local database erased.\n');
  return 0;
}

export async function main(argv: string[]): Promise<number> {
  const [command, ...args] = argv;
  switch (command) {
    case 'hook':
      return runHook();
    case 'init':
      return init(args);
    case 'status':
      return status(args);
    case 'ignore':
      return ignore(args);
    case 'forget':
      return forget(args);
    case 'sync':
      process.stdout.write(
        'Publishing arrives in a later version. Nothing has left this machine.\n',
      );
      return 0;
    default:
      process.stdout.write(USAGE);
      return command === undefined || command === 'help' || command === '--help' ? 0 : 1;
  }
}
