import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PULSE_BUDGET, pulse, saysNothingFound, searchServiceTrouble } from '../src/handlers/pulse.js';
import { describeSearchFailure, openCall, runSearch, stopOpenSearches, withoutPaths } from '../src/search-run.js';

/**
 * What `arp_pulse` says when a part of it fails. The search is a real child process, an `npx` written
 * into a folder on PATH, because killing it and reading its stderr is what is being tested. Only
 * `fetch` is stubbed.
 */
let dir: string;
const saved = { PATH: process.env['PATH'], ARP_HOME: process.env['ARP_HOME'] };

function fakeNpx(script: string): void {
  const bin = join(dir, 'bin');
  mkdirSync(bin, { recursive: true });
  const file = join(bin, 'npx');
  writeFileSync(file, `#!/bin/sh\nfor last; do :; done\n${script}\n`);
  chmodSync(file, 0o755);
  process.env['PATH'] = `${bin}:${saved.PATH ?? ''}`;
}

/** The skills.sh probe by `service`, the graph and GitHub refused unless a test says otherwise. */
function stubFetch(
  service: 'up' | 'down' | 'changed',
  others: (url: string, init?: RequestInit) => Promise<unknown> = () => Promise.reject(new TypeError('fetch failed')),
) {
  vi.stubGlobal('fetch', (url: unknown, init?: RequestInit) => {
    if (!String(url).includes('skills.sh')) return others(String(url), init);
    if (service === 'down') return Promise.reject(new TypeError('fetch failed'));
    return Promise.resolve(new Response(service === 'up' ? '{"skills":[]}' : '{"hits":[]}', { status: 200 }));
  });
}

async function call(args: Record<string, unknown>, budget = PULSE_BUDGET): Promise<Record<string, unknown>> {
  const response = await pulse(1, args, budget);
  // `as`: the JSON-RPC envelope `text()` writes in this repo.
  const body = (await response.json()) as { result: { content: { text: string }[] } };
  return JSON.parse(body.result.content[0]?.text ?? '{}') as Record<string, unknown>;
}

const NOTHING = 'echo "No skills found for \\"$last\\""';
const ONE_RESULT = 'echo "a/b@s 12 installs"; echo "└ https://skills.sh/a/b/s"';

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'arp-pulse-failures-'));
  process.env['ARP_HOME'] = join(dir, 'arp');
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => {
  process.env['PATH'] = saved.PATH;
  process.env['ARP_HOME'] = saved.ARP_HOME;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  rmSync(dir, { recursive: true, force: true });
});

describe('an empty list', () => {
  it('is "unavailable" when the CLI said nothing found because skills.sh is down', async () => {
    fakeNpx(NOTHING);
    stubFetch('down');
    const said = await call({ query: 'video editing' });
    expect(said['search']).toBe('unavailable');
    expect(String(said['detail'])).toContain('skills.sh did not answer');
    expect(said['nothing_found']).toBeUndefined();
    expect(said['next']).toBeDefined();
  });

  it('is an answer when skills.sh answers', async () => {
    fakeNpx(NOTHING);
    stubFetch('up');
    const said = await call({ query: 'video editing' });
    expect(said['search']).toBe('npx skills find');
    expect(said['results']).toEqual([]);
    expect(said['nothing_found']).toBeDefined();
  });

  it('is not an answer when the service replies in a form the package cannot read', async () => {
    fakeNpx(NOTHING);
    stubFetch('changed');
    expect((await call({ query: 'x y' }))['search']).toBe('unavailable');
  });

  it('is "unavailable" when the text is neither a result nor the CLI\'s empty sentence', async () => {
    fakeNpx('echo "<html>a changed format</html>"');
    stubFetch('up');
    const said = await call({ query: 'video editing' });
    expect(said['search']).toBe('unavailable');
    expect(String(said['detail'])).toContain('format');
  });

  it('says that the public record did not answer, when it did not', async () => {
    fakeNpx(NOTHING);
    stubFetch('up');
    expect((await call({ query: 'x y' }))['public_record']).toBe('did not answer');
  });

  it('with `search_output` given, names that and runs no probe', async () => {
    const probe = vi.fn((_url: string) => Promise.reject(new TypeError('no')));
    vi.stubGlobal('fetch', probe);
    const said = await call({ search_output: '' });
    expect(said['search']).toBe('search_output');
    expect(String(said['detail'])).toContain('search_output');
    expect(probe.mock.calls.some(([url]) => String(url).includes('skills.sh'))).toBe(false);
  });
});

describe('searchServiceTrouble', () => {
  const answering = (body: string, status = 200) => (async () => new Response(body, { status })) as unknown as typeof fetch; // no argument is read

  it('asks with a fixed word, none of the person\'s', async () => {
    const seen: string[] = [];
    await searchServiceTrouble((async (url: string) => {
      seen.push(url);
      return new Response('{"skills":[]}');
    }) as unknown as typeof fetch, 100); // only the URL is read
    expect(seen).toEqual(['https://skills.sh/api/search?q=skill']);
  });

  it('tells each case apart', async () => {
    expect(await searchServiceTrouble(answering('{"skills":[]}'), 100)).toBeNull();
    expect(await searchServiceTrouble(answering('', 503), 100)).toContain('503');
    expect(await searchServiceTrouble(answering('<html>'), 100)).toContain('did not answer');
    expect(await searchServiceTrouble(answering('{"x":1}'), 100)).toContain('does not read');
  });

  it('holds to the CLI\'s own sentence', () => {
    expect(saysNothingFound('No skills found for "x"')).toBe(true);
    expect(saysNothingFound('')).toBe(false);
  });
});

describe('several phrases', () => {
  it('says which one failed, and keeps what the others found', async () => {
    fakeNpx(`if [ "$last" = "bad" ]; then echo "npm error code E500" >&2; exit 1; fi\n${ONE_RESULT}`);
    stubFetch('up');
    const said = await call({ queries: ['good', 'bad'] });
    expect(said['search']).toBe('npx skills find');
    expect(said['phrases_failed']).toEqual([{ phrase: 'bad', detail: 'npm failed: E500' }]);
    expect(said['results_found']).toBe(1);
  });

  it('never calls an empty list final while a phrase failed', async () => {
    fakeNpx(`if [ "$last" = "bad" ]; then exit 1; fi\n${NOTHING}`);
    stubFetch('up');
    const said = await call({ queries: ['good', 'bad'] });
    expect(said['nothing_found']).toBeUndefined();
    expect(said['phrases_failed']).toHaveLength(1);
  });

  it('lists all of them when none answered', async () => {
    fakeNpx('exit 1');
    stubFetch('up');
    const said = await call({ queries: ['a', 'b'] });
    expect(said['search']).toBe('unavailable');
    expect(said['phrases_failed']).toHaveLength(2);
  });
});

describe('the time limit', () => {
  const tight = { totalMs: 1_200, searchMs: 500, agentsMs: 150, filesMs: 150 };
  const silent = (_url: string, init?: RequestInit) =>
    new Promise((_, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
    });

  it('is under what an MCP client waits', () => {
    expect(PULSE_BUDGET.totalMs).toBeLessThan(60_000);
    expect(PULSE_BUDGET.searchMs + PULSE_BUDGET.agentsMs + PULSE_BUDGET.filesMs).toBeLessThan(PULSE_BUDGET.totalMs);
  });

  it('answers on time with a search that hangs, and names the wait', async () => {
    fakeNpx('sleep 30');
    stubFetch('up', silent);
    const at = Date.now();
    const said = await call({ query: 'x y' }, tight);
    expect(Date.now() - at).toBeLessThan(tight.totalMs + 300);
    expect(said['search']).toBe('unavailable');
    expect(said['detail']).toBe('the search package did not answer within 1 s');
  });

  it('answers on time with everything after the search hanging, and says what it did not read', async () => {
    fakeNpx(ONE_RESULT);
    stubFetch('up', silent);
    const at = Date.now();
    const said = await call({ queries: ['x y', 'y z'], limit: 5 }, tight);
    expect(Date.now() - at).toBeLessThan(tight.totalMs + 300);
    expect(said['search']).toBe('npx skills find');
    expect(said['results_found']).toBe(1);
    expect(said['files_not_all_read']).toBeDefined();
  });
});

describe('runSearch', () => {
  const invocation = (args: string[] = ['x']) => ({ file: 'npx', args, cwd: dir, env: { PATH: process.env['PATH'] ?? '' } });
  const alive = (pid: number) => {
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  };
  /** The grandchild's pid, which `npx` leaves in a file, and the promise of the run. */
  async function started(limit: { timeoutMs: number; stop: AbortSignal }) {
    const pidFile = join(dir, 'pid');
    fakeNpx(`sleep 30 &\necho $! > ${pidFile}\nwait`);
    const run = runSearch(invocation(), limit);
    await vi.waitFor(() => expect(existsSync(pidFile) && readFileSync(pidFile, 'utf8').trim() !== '').toBe(true));
    return { run, pid: Number(readFileSync(pidFile, 'utf8').trim()) };
  }

  it('kills what `npx` started, not only `npx`, at the limit', async () => {
    const { run, pid } = await started({ timeoutMs: 150, stop: new AbortController().signal });
    await expect(run).rejects.toThrow('did not answer within');
    await vi.waitFor(() => expect(alive(pid)).toBe(false));
  });

  it('kills it when the call is cancelled or the session closes', async () => {
    const call = openCall();
    const { run, pid } = await started({ timeoutMs: 30_000, stop: call.signal });
    stopOpenSearches();
    await expect(run).rejects.toThrow('the call was cancelled');
    call.end();
    await vi.waitFor(() => expect(alive(pid)).toBe(false));
  });

  it('says so when there is no npx', async () => {
    process.env['PATH'] = join(dir, 'nowhere');
    await expect(runSearch(invocation(), { timeoutMs: 1_000, stop: new AbortController().signal })).rejects.toThrow('npx was not found on PATH');
  });

  it('stops a package that prints without end', async () => {
    fakeNpx('while :; do printf "%01000d\\n" 0; done');
    await expect(runSearch(invocation(), { timeoutMs: 20_000, stop: new AbortController().signal })).rejects.toThrow('printed more than');
  });
});

describe('the failure message', () => {
  const base = { why: null, timeoutMs: 25_000, code: 1 } as const;

  it('gives npm\'s cause, not its log', () => {
    const stderr = [
      'npm error code ENOTFOUND',
      'npm error syscall getaddrinfo',
      'npm error errno ENOTFOUND',
      'npm error network request to https://user:hunter2@registry.npmjs.org/skills failed, reason: getaddrinfo ENOTFOUND',
      'npm error A complete log of this run can be found in: /home/jo/.npm/_logs/x-debug.log',
    ].join('\n');
    const said = describeSearchFailure({ ...base, stderr });
    expect(said).toContain('ENOTFOUND');
    expect(said).toContain('registry.npmjs.org');
    expect(said).not.toContain('hunter2');
    expect(said).not.toContain('/home/jo');
    expect(said).not.toContain('Command failed');
  });

  it('holds no path or secret, whatever the package printed', () => {
    const stderr = "Error: EACCES: permission denied, open '/home/jo/.npmrc' token=abc123 C:\\Users\\Jo\\x";
    const said = describeSearchFailure({ ...base, stderr });
    expect(said).not.toContain('/home/jo');
    expect(said).not.toContain('abc123');
    expect(said).not.toContain('Users');
    expect(said).toContain('EACCES');
  });

  it('falls back on the exit code', () => {
    expect(describeSearchFailure({ ...base, stderr: '' })).toBe('the search package exited with code 1');
  });

  it('leaves ordinary words and a URL\'s host alone', () => {
    expect(withoutPaths('and/or see https://registry.npmjs.org/skills')).toBe('and/or see https://registry.npmjs.org/…');
  });
});
