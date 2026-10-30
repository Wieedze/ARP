import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';

import { doctor, EXIT, init, parseFlags, uninstall, type Flags } from '../src/install/commands.ts';
import { CLAUDE_HOOKS, withCodexServer, withHooks, withMcpServer } from '../src/install/edits.ts';
import type { InstallEnv, RunResult } from '../src/install/env.ts';

let home: string;
let dist: string;
let lines: string[];
let ran: string[][];

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'arp-install-'));
  dist = join(home, 'pkg', 'dist');
  mkdirSync(dist, { recursive: true });
  writeFileSync(join(dist, 'hook.js'), '// the hook\n');
  lines = [];
  ran = [];
});
afterEach(() => rmSync(home, { recursive: true, force: true }));

/** A machine with no runtime binary on PATH and no terminal, unless a test says otherwise. */
function env(over: Partial<InstallEnv> = {}): InstallEnv {
  return {
    home,
    cwd: join(home, 'project'),
    which: () => null,
    run: (argv): RunResult => {
      ran.push([...argv]);
      return { code: 0, stdout: '{"result":{"serverInfo":{"name":"ARP"}}}', stderr: '' };
    },
    interactive: false,
    ask: async () => false,
    out: (line) => lines.push(line),
    err: (line) => lines.push(line),
    now: () => new Date('2026-10-30T12:00:00Z'),
    node: '/usr/bin/node',
    dist,
    version: '0.0.1',
    ...over,
  };
}

const CLI = '/opt/arp/dist/cli.js';
function flags(args: string[] = []): Flags {
  const parsed = parseFlags(args);
  if (parsed instanceof Error) throw parsed;
  return parsed;
}
const json = (path: string): unknown => JSON.parse(readFileSync(path, 'utf8'));
/** Walk a parsed config by keys and indexes; `undefined` where the path does not exist. */
function at(value: unknown, ...path: (string | number)[]): unknown {
  let current = value;
  for (const key of path) {
    if (typeof current !== 'object' || current === null) return undefined;
    current = (current as Record<string | number, unknown>)[key]; // narrowed to an object above
  }
  return current;
}

describe('edits', () => {
  test('another server and another hook are kept, ours replaced not duplicated', () => {
    const settings = {
      hooks: {
        PostToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'theirs' }] }],
      },
      theme: 'dark',
    };
    const once = withHooks(
      settings,
      CLAUDE_HOOKS,
      '"node" "/h/.arp/bin/hook.js"',
      '/.arp/bin/hook.js',
    );
    const twice = withHooks(
      once,
      CLAUDE_HOOKS,
      '"node" "/h/.arp/bin/hook.js"',
      '/.arp/bin/hook.js',
    );
    expect(twice).toEqual(once);
    expect(JSON.stringify(once)).toContain('theirs');
    expect(withHooks(once, CLAUDE_HOOKS, null, '/.arp/bin/hook.js')).toEqual(settings);

    const servers = withMcpServer({ mcpServers: { github: { url: 'x' } } }, 'arp', {
      command: 'n',
    });
    // `as object`: withMcpServer always returns an object at this key.
    expect(Object.keys(servers.mcpServers as object)).toEqual(['github', 'arp']);
    expect(withMcpServer(servers, 'arp', null)).toEqual({ mcpServers: { github: { url: 'x' } } });
  });

  test('codex: our block between markers, a foreign [mcp_servers.arp] is refused', () => {
    const theirs = 'model = "o4"\n';
    const added = withCodexServer(theirs, { command: 'node', args: ['cli.js', 'mcp'] });
    if (typeof added !== 'string') throw added;
    expect(withCodexServer(added, { command: 'node', args: ['cli.js', 'mcp'] })).toBe(added);
    expect(withCodexServer(added, null)).toBe(theirs);
    expect(withCodexServer('[mcp_servers.arp]\ncommand = "x"\n', null)).toBeInstanceOf(Error);
  });
});

describe('init', () => {
  test('finds nothing on a bare machine, exits 4, and points at --print', async () => {
    expect(await init(env(), flags(['--yes']), CLI)).toBe(EXIT.nothingFound);
    expect(lines.join('\n')).toContain('--print');
  });

  test('without a terminal and without --yes it writes nothing and exits 3', async () => {
    mkdirSync(join(home, '.claude'));
    expect(await init(env(), flags(), CLI)).toBe(EXIT.refused);
    expect(existsSync(join(home, '.claude.json'))).toBe(false);
  });

  test('--dry-run shows every change and writes nothing', async () => {
    mkdirSync(join(home, '.claude'));
    expect(await init(env(), flags(['--dry-run']), CLI)).toBe(EXIT.ok);
    expect(lines.join('\n')).toContain('nothing written');
    expect(existsSync(join(home, '.arp'))).toBe(false);
  });

  test('Claude Code without its CLI: MCP in ~/.claude.json, the hook on both events, the hook file copied', async () => {
    mkdirSync(join(home, '.claude'));
    expect(await init(env(), flags(['--yes']), CLI)).toBe(EXIT.ok);
    expect(at(json(join(home, '.claude.json')), 'mcpServers', 'arp')).toEqual({
      command: '/usr/bin/node',
      args: [CLI, 'mcp'],
    });
    const hooks = at(json(join(home, '.claude', 'settings.json')), 'hooks');
    expect(at(hooks, 'PostToolUse', 0, 'hooks', 0)).toMatchObject({ async: true });
    expect(at(hooks, 'PostToolUseFailure')).toHaveLength(1);
    expect(readFileSync(join(home, '.arp', 'bin', 'hook.js'), 'utf8')).toBe('// the hook\n');
  });

  test('a second run changes nothing', async () => {
    mkdirSync(join(home, '.claude'));
    await init(env(), flags(['--yes']), CLI);
    lines = [];
    expect(await init(env(), flags(['--yes']), CLI)).toBe(EXIT.ok);
    expect(lines.join('\n')).toContain('Nothing to change');
  });

  test('a file is backed up before it is changed', async () => {
    mkdirSync(join(home, '.cursor'));
    writeFileSync(join(home, '.cursor', 'mcp.json'), '{"mcpServers":{"other":{"command":"x"}}}');
    await init(env(), flags(['--yes']), CLI);
    expect(
      readdirSync(join(home, '.cursor')).some((f) => f.startsWith('mcp.json.arp-backup-')),
    ).toBe(true);
    // `as object`: Object.keys needs one, and the assertion fails if the value is not.
    const servers = at(json(join(home, '.cursor', 'mcp.json')), 'mcpServers') as object;
    expect(Object.keys(servers)).toEqual(['other', 'arp']);
  });

  test('a config that is not JSON is left alone, never overwritten', async () => {
    mkdirSync(join(home, '.cursor'));
    writeFileSync(join(home, '.cursor', 'mcp.json'), '{broken');
    await init(env(), flags(['--yes']), CLI);
    expect(readFileSync(join(home, '.cursor', 'mcp.json'), 'utf8')).toBe('{broken');
  });

  /**
   * A `claude` that behaves as the real one is expected to: `add-json` refuses a name that exists,
   * `remove` fails on one that does not, `get` reports what is declared.
   */
  function strictClaude() {
    let declared: string | null = null;
    return env({
      which: (cmd) => (cmd === 'claude' ? '/usr/bin/claude' : null),
      run: (argv): RunResult => {
        ran.push([...argv]);
        const [, , verb, , json] = argv;
        if (verb === 'get')
          return declared === null
            ? { code: 1, stdout: '', stderr: 'not found' }
            : { code: 0, stdout: declared, stderr: '' };
        if (verb === 'add-json') {
          if (declared !== null) return { code: 1, stdout: '', stderr: 'already exists' };
          declared = json ?? '';
          return { code: 0, stdout: '', stderr: '' };
        }
        if (verb === 'remove') {
          if (declared === null) return { code: 1, stdout: '', stderr: 'not found' };
          declared = null;
          return { code: 0, stdout: '', stderr: '' };
        }
        return { code: 0, stdout: '{"name":"ARP"}', stderr: '' };
      },
    });
  }

  test('with `claude` on PATH: add-json once, nothing the second time, remove once, nothing after', async () => {
    const claude = strictClaude();
    expect(await init(claude, flags(['--yes']), CLI)).toBe(EXIT.ok);
    const adds = () => ran.filter((argv) => argv[2] === 'add-json');
    expect(adds()).toHaveLength(1);
    expect(adds()[0]?.slice(-2)).toEqual(['--scope', 'user']);
    expect(existsSync(join(home, '.claude.json'))).toBe(false);

    lines = [];
    expect(await init(claude, flags(['--yes']), CLI)).toBe(EXIT.ok);
    expect(adds()).toHaveLength(1);
    expect(lines.join('\n')).toContain('Nothing to change');

    expect(await uninstall(claude, flags(['--yes', '--runtime', 'claude']), CLI)).toBe(EXIT.ok);
    lines = [];
    expect(await uninstall(claude, flags(['--yes', '--runtime', 'claude']), CLI)).toBe(EXIT.ok);
    expect(ran.filter((argv) => argv[2] === 'remove')).toHaveLength(1);
    expect(lines.join('\n')).toContain('Nothing to change');
  });

  test('with `claude` on PATH, a changed command is removed then added again', async () => {
    const claude = strictClaude();
    await init(claude, flags(['--yes']), CLI);
    expect(await init(claude, flags(['--yes']), '/elsewhere/dist/cli.js')).toBe(EXIT.ok);
    expect(ran.filter((argv) => argv[2] !== 'get').map((argv) => argv[2])).toEqual([
      'add-json',
      'remove',
      'add-json',
    ]);
  });

  test('a 0600 config stays 0600: it can hold an API key', async () => {
    mkdirSync(join(home, '.cursor'));
    const path = join(home, '.cursor', 'mcp.json');
    writeFileSync(path, '{"mcpServers":{"x":{"command":"y","env":{"API_KEY":"secret"}}}}', {
      mode: 0o600,
    });
    await init(env(), flags(['--yes']), CLI);
    expect(statSync(path).mode & 0o777).toBe(0o600);
  });

  test('before agreeing, the operator sees the entry that will be written', async () => {
    mkdirSync(join(home, '.claude'));
    await init(env(), flags(['--dry-run']), CLI);
    const shown = lines.join('\n');
    expect(shown).toContain(`+   "command": "/usr/bin/node"`);
    expect(shown).toContain('PostToolUseFailure');
    expect(shown).toContain('.arp/bin/hook.js');
  });

  test('run from npx, the MCP entry launches the pinned package, never a cache path', async () => {
    mkdirSync(join(home, '.gemini'));
    await init(
      env(),
      flags(['--yes']),
      '/root/.npm/_npx/abc/node_modules/@arp-protocol/cli/dist/cli.js',
    );
    expect(at(json(join(home, '.gemini', 'settings.json')), 'mcpServers', 'arp')).toEqual({
      command: 'npx',
      args: ['-y', '@arp-protocol/cli@0.0.1', 'mcp'],
    });
  });

  test("Grok alone writes Claude Code's files, which it reads", async () => {
    mkdirSync(join(home, '.grok'));
    await init(env(), flags(['--yes']), CLI);
    expect(at(json(join(home, '.claude.json')), 'mcpServers', 'arp')).toBeDefined();
  });

  test('--print writes the entry to stdout and no file', async () => {
    expect(await init(env(), flags(['--print']), CLI)).toBe(EXIT.ok);
    expect(at(JSON.parse(lines.join('\n')), 'mcpServers', 'arp', 'args')).toEqual([CLI, 'mcp']);
    expect(existsSync(join(home, '.arp'))).toBe(false);
  });
});

describe('init --capture (task 33i)', () => {
  test('without --capture, Cursor, Gemini, Codex and Copilot get no hook', async () => {
    for (const dir of ['.cursor', '.gemini', '.codex', '.copilot']) mkdirSync(join(home, dir));
    await init(env(), flags(['--yes']), CLI);
    expect(existsSync(join(home, '.cursor', 'hooks.json'))).toBe(false);
    expect(at(json(join(home, '.gemini', 'settings.json')), 'hooks')).toBeUndefined();
    expect(existsSync(join(home, '.codex', 'hooks.json'))).toBe(false);
    expect(existsSync(join(home, '.copilot', 'hooks', 'arp.json'))).toBe(false);
    expect(existsSync(join(home, '.arp', 'bin', 'hook.js'))).toBe(false);
  });

  test('with --capture, each runtime gets a capturing hook in its own format', async () => {
    for (const dir of ['.cursor', '.gemini', '.codex', '.copilot']) mkdirSync(join(home, dir));
    expect(await init(env(), flags(['--yes', '--capture']), CLI)).toBe(EXIT.ok);
    const cursor = json(join(home, '.cursor', 'hooks.json'));
    expect(at(cursor, 'version')).toBe(1);
    expect(String(at(cursor, 'hooks', 'afterMCPExecution', 0, 'command'))).toEndWith(
      'hook.js" --capture',
    );
    const gemini = json(join(home, '.gemini', 'settings.json'));
    expect(at(gemini, 'mcpServers', 'arp')).toBeDefined();
    expect(at(gemini, 'hooks', 'AfterTool', 0, 'matcher')).toBe('mcp_.*');
    expect(at(gemini, 'hooks', 'AfterTool', 0, 'hooks', 0, 'timeout')).toBe(10_000);
    expect(at(json(join(home, '.codex', 'hooks.json')), 'hooks', 'PostToolUse', 0, 'matcher')).toBe(
      'mcp__.*',
    );
    expect(
      at(
        json(join(home, '.copilot', 'hooks', 'arp.json')),
        'hooks',
        'postToolUse',
        0,
        'timeoutSec',
      ),
    ).toBe(10);
    expect(existsSync(join(home, '.arp', 'bin', 'hook.js'))).toBe(true);
  });

  test('uninstall removes every capturing hook and the files that held only ours', async () => {
    for (const dir of ['.cursor', '.gemini', '.codex', '.copilot']) mkdirSync(join(home, dir));
    writeFileSync(join(home, '.gemini', 'settings.json'), '{"theme":"x"}');
    await init(env(), flags(['--yes', '--capture']), CLI);
    expect(await uninstall(env(), flags(['--yes']), CLI)).toBe(EXIT.ok);
    expect(json(join(home, '.gemini', 'settings.json'))).toEqual({ theme: 'x' });
    expect(existsSync(join(home, '.cursor', 'hooks.json'))).toBe(false);
    expect(existsSync(join(home, '.copilot', 'hooks', 'arp.json'))).toBe(false);
    expect(existsSync(join(home, '.codex', 'hooks.json'))).toBe(false);
  });
});

describe('after --capture', () => {
  test('a plain init takes the capturing hooks out of the runtimes the hook cannot read yet', async () => {
    for (const dir of ['.cursor', '.gemini', '.codex', '.copilot']) mkdirSync(join(home, dir));
    await init(env(), flags(['--yes', '--capture']), CLI);
    expect(await init(env(), flags(['--yes']), CLI)).toBe(EXIT.ok);
    expect(existsSync(join(home, '.cursor', 'hooks.json'))).toBe(false);
    expect(existsSync(join(home, '.codex', 'hooks.json'))).toBe(false);
    expect(existsSync(join(home, '.copilot', 'hooks', 'arp.json'))).toBe(false);
    expect(at(json(join(home, '.gemini', 'settings.json')), 'hooks')).toBeUndefined();
    expect(at(json(join(home, '.gemini', 'settings.json')), 'mcpServers', 'arp')).toBeDefined();
  });

  test('uninstall says where the captures are and leaves them', async () => {
    mkdirSync(join(home, '.arp', 'captures'), { recursive: true });
    writeFileSync(join(home, '.arp', 'captures', 'one.json'), '{}');
    await uninstall(env(), flags(['--yes']), CLI);
    expect(lines.join('\n')).toContain('Captures kept in');
    expect(existsSync(join(home, '.arp', 'captures', 'one.json'))).toBe(true);
  });
});

describe('uninstall and doctor', () => {
  test('uninstall removes ours and only ours', async () => {
    mkdirSync(join(home, '.claude'));
    mkdirSync(join(home, '.codex'));
    writeFileSync(join(home, '.claude', 'settings.json'), '{"theme":"dark"}');
    await init(env(), flags(['--yes']), CLI);
    expect(await uninstall(env(), flags(['--yes']), CLI)).toBe(EXIT.ok);
    expect(json(join(home, '.claude', 'settings.json'))).toEqual({ theme: 'dark' });
    expect(existsSync(join(home, '.claude.json'))).toBe(false);
    expect(existsSync(join(home, '.codex', 'config.toml'))).toBe(false);
    expect(existsSync(join(home, '.arp', 'bin', 'hook.js'))).toBe(false);
  });

  test('doctor passes after init and fails before it', async () => {
    mkdirSync(join(home, '.claude'));
    expect(doctor(env(), flags(), CLI)).toBe(EXIT.problems);
    await init(env(), flags(['--yes']), CLI);
    lines = [];
    expect(doctor(env({ node: process.execPath }), flags(), CLI)).toBe(EXIT.ok);
    expect(lines.join('\n')).not.toContain('FAIL');
  });

  test('doctor fails when the MCP server does not answer', async () => {
    mkdirSync(join(home, '.claude'));
    await init(env(), flags(['--yes']), CLI);
    const silent = env({
      node: process.execPath,
      run: () => ({ code: 1, stdout: '', stderr: 'boom' }),
    });
    expect(doctor(silent, flags(), CLI)).toBe(EXIT.problems);
  });
});
