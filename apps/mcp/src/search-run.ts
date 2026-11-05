import { type ChildProcess, spawn } from 'node:child_process';

import { redactUrls } from '@arp-protocol/core/node';

/**
 * Running the search package, and stopping it.
 *
 * `npx` starts `sh`, which starts the package, so killing `npx` alone leaves the package running and
 * holding the pipes. The child gets its own process group and the whole group is killed. A server
 * killed with SIGKILL runs no code at all, so that one case still leaves it behind.
 */
const open = new Set<ChildProcess>();
const openCalls = new Set<AbortController>();

function killGroup(child: ChildProcess): void {
  if (child.pid === undefined) return;
  try {
    process.kill(-child.pid, 'SIGKILL');
  } catch {
    child.kill('SIGKILL'); // the group is already gone, or the platform has none
  }
}

let hooked = false;
function killOnExit(): void {
  if (hooked) return;
  hooked = true;
  const killAll = () => {
    for (const child of open) killGroup(child);
  };
  process.once('exit', killAll);
  for (const [signal, code] of [
    ['SIGTERM', 143],
    ['SIGINT', 130],
    ['SIGHUP', 129],
  ] as const) {
    process.once(signal, () => process.exit(code));
  }
}

/** A call that a client can cancel, or that a closing session stops. `end` when it has answered. */
export function openCall(): { signal: AbortSignal; end: () => void } {
  const call = new AbortController();
  openCalls.add(call);
  return { signal: call.signal, end: () => openCalls.delete(call) };
}

export function stopOpenSearches(): void {
  for (const call of openCalls) call.abort();
}

const MAX_OUTPUT = 4_000_000;
const MAX_STDERR = 16_000;

type Failure = {
  why: 'timed_out' | 'cancelled' | null;
  timeoutMs: number;
  code: unknown;
  stderr: string;
};

/** Paths and URLs out, because this goes to the agent and from there anywhere. */
export function withoutPaths(text: string): string {
  return redactUrls(text)
    .replace(/(?<![\w:/.…])(?:~|\.{1,2})?\/[^\s'"`]+/g, '<path>')
    .replace(/\b[A-Za-z]:\\[^\s'"`]+/g, '<path>')
    .replace(/\b(token|authorization|password|secret)\b\S*\s*[=:]\s*\S+/gi, '$1=<hidden>');
}

/** The cause, in a sentence. `Command failed: npx …` says only what ran, and it says it with the words searched. */
export function describeSearchFailure({ why, timeoutMs, code, stderr }: Failure): string {
  if (why === 'cancelled') return 'the call was cancelled';
  if (why === 'timed_out')
    return `the search package did not answer within ${Math.round(timeoutMs / 1000)} s`;
  if (code === 'ENOENT') return 'npx was not found on PATH';
  if (code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER')
    return `the search package printed more than ${MAX_OUTPUT} bytes`;
  const lines = stderr
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '');
  const npm = lines
    .filter((line) => line.startsWith('npm error'))
    .map((line) => line.slice('npm error'.length).trim());
  const npmCode = npm.find((line) => line.startsWith('code '))?.slice('code '.length);
  // The lines after these are where npm's log is, which says nothing about the cause.
  const npmWhy = npm.find((line) => !/^(code|errno|syscall|path|dest|A complete log|$)/.test(line));
  const cause =
    npm.length > 0
      ? `npm failed: ${[npmCode, npmWhy].filter((part) => part !== undefined).join(', ')}`
      : (lines.at(-1) ?? `the search package exited with code ${String(code)}`);
  return withoutPaths(cause).slice(0, 240);
}

/**
 * What the search package printed, or a rejection whose message is its cause. `spawn` and not
 * `execFile`, which passes on a fixed list of options and `detached` is not on it.
 */
export function runSearch(
  invocation: { file: string; args: string[]; cwd: string; env: Record<string, string> },
  limit: { timeoutMs: number; stop: AbortSignal },
): Promise<string> {
  killOnExit();
  return new Promise((resolve, reject) => {
    let why: Failure['why'] = null;
    let code: unknown = null;
    let stdout = '';
    let stderr = '';
    const child = spawn(invocation.file, invocation.args, {
      cwd: invocation.cwd,
      env: invocation.env,
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    open.add(child);
    const stopFor = (reason: NonNullable<Failure['why']>) => {
      why = reason;
      killGroup(child);
    };
    const onStop = () => stopFor('cancelled');
    const timer = setTimeout(() => stopFor('timed_out'), limit.timeoutMs);
    if (limit.stop.aborted) onStop();
    else limit.stop.addEventListener('abort', onStop, { once: true });

    const settle = () => {
      clearTimeout(timer);
      limit.stop.removeEventListener('abort', onStop);
      open.delete(child);
      killGroup(child); // what `npx` started may outlive it, a clean exit included
      if (why === null && code === 0) resolve(stdout);
      else
        reject(new Error(describeSearchFailure({ why, timeoutMs: limit.timeoutMs, code, stderr })));
    };
    child.stdout.setEncoding('utf8').on('data', (chunk: string) => {
      stdout += chunk;
      if (stdout.length > MAX_OUTPUT) {
        code = 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER';
        killGroup(child);
      }
    });
    // Only the tail is kept: npm's cause is in its last lines, and nothing here may grow without a limit.
    child.stderr.setEncoding('utf8').on('data', (chunk: string) => {
      stderr = (stderr + chunk).slice(-MAX_STDERR);
    });
    child.once('error', (error: NodeJS.ErrnoException) => {
      code = error.code;
      settle();
    });
    child.once('close', (exit) => {
      code ??= exit;
      settle();
    });
  });
}
