import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';

import type { InstallEnv } from './env.ts';
import {
  commandsFor,
  RUNTIME_IDS,
  RUNTIMES,
  type Commands,
  type Runtime,
  type RuntimeId,
  type Step,
} from './targets.ts';

/**
 * `arp init`, `arp uninstall`, `arp doctor` and `arp init --print`.
 *
 * What they share is the order clig.dev and the Sentry wizard agree on (`docs/23` §4): find what is
 * installed, compute every change, show it, ask, back up, then write. A run that changes nothing
 * says so and writes nothing, so running it twice is safe.
 */
export const EXIT = {
  ok: 0,
  /** `doctor` found something wrong. */
  problems: 1,
  usage: 2,
  /** A change was needed and nobody agreed to it. */
  refused: 3,
  /** No supported runtime on this machine. */
  nothingFound: 4,
  writeFailed: 5,
} as const;

export type Flags = {
  yes: boolean;
  noInput: boolean;
  dryRun: boolean;
  project: boolean;
  print: boolean;
  capture: boolean;
  runtimes: RuntimeId[] | null;
};

export function parseFlags(args: readonly string[]): Flags | Error {
  const flags: Flags = {
    yes: false,
    noInput: false,
    dryRun: false,
    project: false,
    print: false,
    capture: false,
    runtimes: null,
  };
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--yes' || arg === '-y') flags.yes = true;
    else if (arg === '--no-input') flags.noInput = true;
    else if (arg === '--dry-run' || arg === '-n') flags.dryRun = true;
    else if (arg === '--project') flags.project = true;
    else if (arg === '--print') flags.print = true;
    else if (arg === '--capture') flags.capture = true;
    else if (arg === '--runtime') {
      const list = (args[i + 1] ?? '').split(',').filter((name) => name.length > 0);
      i += 1;
      // `as`: only to call includes; the result is what checks the name.
      const unknown = list.filter((name) => !RUNTIME_IDS.includes(name as RuntimeId));
      if (list.length === 0 || unknown.length > 0) {
        return new Error(`--runtime takes a comma list of: ${RUNTIME_IDS.join(', ')}`);
      }
      // `as`: every name was checked against RUNTIME_IDS just above.
      flags.runtimes = list as RuntimeId[];
    } else return new Error(`unknown option ${String(arg)}`);
  }
  return flags;
}

function selected(env: InstallEnv, flags: Flags): Runtime[] {
  return RUNTIMES.filter((runtime) =>
    flags.runtimes === null ? runtime.detect(env) : flags.runtimes.includes(runtime.id),
  );
}

function installsHook(runtimes: readonly Runtime[], capture: boolean): boolean {
  return capture
    ? runtimes.length > 0
    : runtimes.some((runtime) => runtime.id === 'claude' || runtime.id === 'grok');
}

function read(path: string): string | null {
  try {
    return existsSync(path) ? readFileSync(path, 'utf8') : null;
  } catch {
    return null;
  }
}

/** A command step is planned only when something must change, so it always counts. */
function changes(step: Step): boolean {
  return step.kind === 'command' || (step.kind === 'file' && step.before !== step.after);
}

function stamp(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').replace(/\..+$/, '').replace('T', '-');
}

/** Write one file: a backup of the old one first, then a temp file renamed over it. */
function apply(env: InstallEnv, step: Step): string | null {
  try {
    if (step.kind === 'command') {
      const result = env.run(step.argv);
      return result.code === 0
        ? null
        : `${step.argv.join(' ')}: ${result.stderr.trim() || `exit ${String(result.code)}`}`;
    }
    if (step.kind !== 'file') return null;
    if (step.before !== null)
      copyFileSync(step.path, `${step.path}.arp-backup-${stamp(env.now())}`);
    if (step.after === null) {
      rmSync(step.path, { force: true });
      return null;
    }
    mkdirSync(dirname(step.path), { recursive: true });
    // The file keeps its mode. These files can hold an API key in an `env` or `headers` block, and
    // a temp file is created with the umask's mode: renamed over a 0600 file, it made it 0644.
    const mode = step.before === null ? undefined : statSync(step.path).mode & 0o777;
    const temp = `${step.path}.arp-tmp`;
    writeFileSync(temp, step.after, mode === undefined ? undefined : { mode });
    if (mode !== undefined) chmodSync(temp, mode); // `mode` above is masked by the umask
    renameSync(temp, step.path);
    return null;
  } catch (error) {
    return `${step.kind === 'file' ? step.path : ''}: ${String(error)}`;
  }
}

function hookFileStep(env: InstallEnv, commands: Commands, remove: boolean): Step {
  const before = read(commands.hookFile);
  const after = remove ? null : read(join(env.dist, 'hook.js'));
  if (!remove && after === null) {
    return { kind: 'skip', summary: `no hook.js next to this arp (${env.dist}); build it first` };
  }
  return {
    kind: 'file',
    path: commands.hookFile,
    before,
    after,
    summary: remove ? 'removed' : `the hook, ${after?.length ?? 0} bytes, run by ${env.node}`,
    diff: [],
  };
}

async function consent(env: InstallEnv, flags: Flags, question: string): Promise<boolean> {
  if (flags.yes) return true;
  if (flags.noInput || !env.interactive) {
    env.err(
      'arp: changes needed and no terminal to ask. Re-run with --yes, or --dry-run to look first.',
    );
    return false;
  }
  return env.ask(question);
}

async function change(
  env: InstallEnv,
  flags: Flags,
  plan: { runtime: string; steps: Step[] }[],
  verb: string,
): Promise<number> {
  const pending = plan.flatMap((group) => group.steps.filter(changes));
  for (const group of plan) {
    env.out(group.runtime);
    for (const step of group.steps) {
      if (step.kind === 'skip') env.out(`  --  ${step.summary}`);
      else if (step.kind === 'command') env.out(`  run ${step.summary}`);
      else
        env.out(
          `  ${changes(step) ? (step.after === null ? 'del' : 'set') : 'ok '} ${step.path}\n        ${step.summary}`,
        );
      // The part of another program's file we touch, before and after: what the operator agrees to.
      if (step.kind !== 'skip' && changes(step))
        for (const line of step.diff) env.out(`        ${line}`);
    }
  }
  if (pending.length === 0) {
    env.out(`\nNothing to change.`);
    return EXIT.ok;
  }
  if (flags.dryRun) {
    env.out(`\n--dry-run: ${pending.length} change(s) shown, nothing written.`);
    return EXIT.ok;
  }
  env.out(`\nEach file is backed up as <file>.arp-backup-<date> before it is written.`);
  if (!(await consent(env, flags, `${verb} ${pending.length} change(s)?`))) return EXIT.refused;

  const failures = pending.map((step) => apply(env, step)).filter((f): f is string => f !== null);
  for (const failure of failures) env.err(`arp: ${failure}`);
  if (failures.length > 0) return EXIT.writeFailed;
  env.out(
    `Done. ${verb === 'Install' ? 'Restart your agent runtime to load the MCP server; hooks load on their own.' : 'Removed.'}`,
  );
  return EXIT.ok;
}

export async function init(env: InstallEnv, flags: Flags, cliPath: string): Promise<number> {
  const commands = commandsFor(env, cliPath, flags.capture);
  if (flags.print) {
    env.out(JSON.stringify({ mcpServers: { arp: commands.mcp } }, null, 2));
    return EXIT.ok;
  }
  const runtimes = selected(env, flags);
  if (runtimes.length === 0) {
    env.err(`arp: no supported runtime found (${RUNTIME_IDS.join(', ')}).`);
    env.err('For any other MCP client, `arp init --print` prints the entry to paste.');
    return EXIT.nothingFound;
  }
  const plan = runtimes.map((runtime) => ({
    runtime: runtime.name,
    steps: runtime.install(env, commands, flags.project),
  }));
  if (installsHook(runtimes, flags.capture)) {
    plan.push({ runtime: 'hook', steps: [hookFileStep(env, commands, false)] });
  }
  return change(env, flags, plan, 'Install');
}

export async function uninstall(env: InstallEnv, flags: Flags, cliPath: string): Promise<number> {
  const commands = commandsFor(env, cliPath);
  const runtimes = selected(env, flags);
  const plan = runtimes.map((runtime) => ({
    runtime: runtime.name,
    steps: runtime.remove(env, commands, flags.project),
  }));
  plan.push({ runtime: 'hook', steps: [hookFileStep(env, commands, true)] });
  const code = await change(env, flags, plan, 'Remove');
  // Captures are the operator's to hand over or delete; uninstall says where they are, nothing more.
  const captures = join(env.home, '.arp', 'captures');
  if (existsSync(captures))
    env.out(`Captures kept in ${captures}. Delete them when you no longer need them.`);
  return code;
}

const INITIALIZE = `${JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} })}\n`;

export function doctor(env: InstallEnv, flags: Flags, cliPath: string): number {
  const commands = commandsFor(env, cliPath);
  const runtimes = selected(env, flags);
  const rows: [string, string, boolean][] = [];
  if (runtimes.length === 0)
    rows.push(['runtime', `none of ${RUNTIME_IDS.join(', ')} found`, false]);
  for (const runtime of runtimes) {
    for (const [what, ok] of runtime.check(env, commands, flags.project))
      rows.push([runtime.name, what, ok]);
  }
  if (installsHook(runtimes, false)) {
    const installed = read(commands.hookFile);
    const packaged = read(join(env.dist, 'hook.js'));
    rows.push(['hook', `${commands.hookFile} present`, installed !== null]);
    if (installed !== null && packaged !== null) {
      rows.push([
        'hook',
        'same version as this arp (else run arp init again)',
        installed === packaged,
      ]);
    }
    rows.push(['hook', `node at ${env.node}`, existsSync(env.node)]);
  }
  const answer = env.run([commands.mcp.command, ...commands.mcp.args], INITIALIZE, 30_000);
  rows.push([
    'MCP server',
    `answers initialize (${commands.mcp.command} ${commands.mcp.args.join(' ')})`,
    answer.stdout.includes('"name":"ARP"'),
  ]);
  const log = read(join(env.cwd, '.arp', 'session.jsonl'));
  const last = log?.trim().split('\n').pop();
  let lastAt: string | null = null;
  try {
    const parsed: unknown = last === undefined ? null : JSON.parse(last);
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'at' in parsed &&
      typeof parsed.at === 'string'
    )
      lastAt = parsed.at;
  } catch {
    lastAt = null;
  }
  for (const [where, what, ok] of rows)
    env.out(`${ok ? 'ok  ' : 'FAIL'}  ${where.padEnd(12)} ${what}`);
  // Information, not a check: a project where no tool has been called yet has no log, and that is fine.
  env.out(
    `--    session log  ${lastAt === null ? `no call recorded in ${join(env.cwd, '.arp')}` : `last call recorded ${lastAt}`}`,
  );
  return rows.every(([, , ok]) => ok) ? EXIT.ok : EXIT.problems;
}
