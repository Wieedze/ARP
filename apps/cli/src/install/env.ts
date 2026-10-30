import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { delimiter, join } from 'node:path';
import { createInterface } from 'node:readline/promises';

/**
 * Everything `init`, `uninstall` and `doctor` touch outside their own logic, so the tests drive
 * them against a temporary home with no runtime binary on the path and no terminal.
 */
export type InstallEnv = {
  home: string;
  cwd: string;
  /** The absolute path of a binary on PATH, or `null`. */
  which: (command: string) => string | null;
  /** Runs a command, no shell. `stdin` is written then closed. */
  run: (argv: readonly string[], stdin?: string, timeoutMs?: number) => RunResult;
  /** Whether a human can answer a prompt: stdin and stdout are both terminals. */
  interactive: boolean;
  ask: (question: string) => Promise<boolean>;
  out: (line: string) => void;
  err: (line: string) => void;
  now: () => Date;
  /** The Node binary running `arp`, written into every command `init` installs. */
  node: string;
  /** This package's `dist/`. */
  dist: string;
  version: string;
};

export type RunResult = { code: number | null; stdout: string; stderr: string };

function which(command: string): string | null {
  for (const dir of (process.env.PATH ?? '').split(delimiter)) {
    if (dir.length === 0) continue;
    const candidate = join(dir, command);
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

export function processEnv(dist: string, version: string): InstallEnv {
  return {
    home: homedir(),
    cwd: process.cwd(),
    which,
    run: (argv, stdin, timeoutMs = 15_000) => {
      const [command, ...args] = argv;
      const result = spawnSync(command ?? '', args, {
        input: stdin,
        encoding: 'utf8',
        timeout: timeoutMs,
      });
      return { code: result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
    },
    interactive: process.stdin.isTTY === true && process.stdout.isTTY === true,
    ask: async (question) => {
      const rl = createInterface({ input: process.stdin, output: process.stdout });
      try {
        const answer = await rl.question(`${question} [y/N] `);
        return /^y(es)?$/i.test(answer.trim());
      } finally {
        rl.close();
      }
    },
    out: (line) => process.stdout.write(`${line}\n`),
    err: (line) => process.stderr.write(`${line}\n`),
    now: () => new Date(),
    node: process.execPath,
    dist,
    version,
  };
}
