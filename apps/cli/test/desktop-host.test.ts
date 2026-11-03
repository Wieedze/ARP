import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, expect, test } from 'bun:test';

const CLI = join(import.meta.dir, '..', 'dist', 'cli.js');

/**
 * Claude Desktop's built-in Node, as far as `arp mcp` can tell (found live on Windows, 2026-11-02):
 * it imports the entry file, starts it in a directory it cannot write, and hands it a stdin that
 * emits each message once and keeps nothing. Each of the three broke the server before it answered.
 */
const HOST = `
import { Readable } from 'node:stream';
const entry = process.argv[2];
process.argv = [process.argv[0], entry, 'mcp'];
const stdin = new Readable({ read() {} });
Object.defineProperty(process, 'stdin', { value: stdin, configurable: true });
let out = '';
process.stdout.write = (chunk) => { out += String(chunk); return true; };
let settled = false;
import(entry).then(() => { settled = true; });
setTimeout(() => stdin.emit('data', Buffer.from(JSON.stringify({
  jsonrpc: '2.0', id: 0, method: 'initialize',
  params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'host', version: '0' } },
}) + '\\n')), 2);
setTimeout(() => {
  process.stderr.write(JSON.stringify({ settled, answered: out.includes('"id":0,"result"') }) + '\\n');
  process.exit(0);
}, 3000);
`;

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'arp-host-'));
});
afterEach(() => {
  chmodSync(dir, 0o755);
  rmSync(dir, { recursive: true, force: true });
});

test('answers initialize under a host that imports it, from a read-only directory, on an unbuffered stdin', () => {
  const host = join(tmpdir(), `arp-host-${process.pid}.mjs`);
  writeFileSync(host, HOST);
  chmodSync(dir, 0o555);
  const proc = Bun.spawnSync(['node', host, CLI], {
    cwd: dir,
    env: { ...process.env, ARP_TARGET: 'testnet', HOME: tmpdir() },
  });
  rmSync(host, { force: true });
  const verdict = proc.stderr
    .toString()
    .split('\n')
    .find((line) => line.startsWith('{"settled"'));
  expect(verdict).toBeDefined();
  expect(JSON.parse(verdict ?? '{}')).toEqual({ settled: true, answered: true });
}, 15_000);
