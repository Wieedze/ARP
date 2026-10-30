import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, expect, test } from 'bun:test';

import pkg from '../package.json';

/**
 * The built binary, as a runtime launches it. Under Bun here; `bun run check:node` runs the packed
 * tarball under Node with no Bun on PATH, which is the gate for the claim this package exists for.
 */
const CLI = join(import.meta.dir, '..', 'dist', 'cli.js');

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'arp-cli-'));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

function arp(args: string[], stdin = '', env: Record<string, string> = {}) {
  const { ARP_SESSION_LOG: _unset, ...base } = process.env;
  const proc = Bun.spawnSync(['bun', CLI, ...args], {
    cwd: dir,
    stdin: new TextEncoder().encode(stdin),
    env: { ...base, HOME: dir, ...env },
  });
  return { code: proc.exitCode, out: proc.stdout.toString(), err: proc.stderr.toString() };
}

test('--help prints the usage and exits 0', () => {
  const { code, out } = arp(['--help']);
  expect(code).toBe(0);
  expect(out).toContain('arp mcp');
  expect(out).toContain('arp hook');
  expect(out).toContain('arp node');
});

test('--version prints the package version', () => {
  expect(arp(['--version']).out.trim()).toBe(pkg.version);
});

test('an unknown command exits 2 with the usage on stderr', () => {
  const { code, err } = arp(['nope']);
  expect(code).toBe(2);
  expect(err).toContain("unknown command 'nope'");
});

test('hook reads one payload and writes one line in the project', () => {
  const { code } = arp(
    ['hook'],
    JSON.stringify({ tool_name: 'mcp__x__y', tool_use_id: 't1', tool_response: 'ok', cwd: dir }),
  );
  expect(code).toBe(0);
  const log = join(dir, '.arp', 'session.jsonl');
  expect(existsSync(log)).toBe(true);
  expect(readFileSync(log, 'utf8')).toContain('"call":"t1"');
});

test('mcp speaks stdio by default', () => {
  const { out } = arp(
    ['mcp'],
    `${JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} })}\n`,
    { ARP_NO_RECEIPTS: '1' },
  );
  expect(out).toContain('"name":"ARP"');
});

test('the bundle leaves the optional delegation kit out: it is a peer, not 1 MB of payload', () => {
  // `--external @metamask/smart-accounts-kit` in the build script. Without it the kit and its ABIs
  // are bundled into a 1.1 MB chunk, measured 2026-10-30. Delegated mode imports the kit lazily and
  // asks for it to be installed, as `@arp-protocol/core` declares it an optional peer.
  const files = new Bun.Glob('**/*.js').scanSync(join(import.meta.dir, '..', 'dist'));
  for (const file of files) {
    const text = readFileSync(join(import.meta.dir, '..', 'dist', file), 'utf8');
    expect(text.includes('node_modules/.bun/@metamask+delegation-abis')).toBe(false);
  }
});

test('packaging/ is what `bun run packages` writes from this build: nothing stale is committed', () => {
  const proc = Bun.spawnSync([
    'bun',
    join(import.meta.dir, '..', 'scripts', 'packages.ts'),
    '--check',
  ]);
  expect(proc.stderr.toString()).toBe('');
  expect(proc.exitCode).toBe(0);
});
