import { chmodSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';

import { loadOrCreateNodeKey, nodeKeyPath, resolveNodeKey } from '../src/node-key.ts';

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'arp-node-key-'));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('nodeKeyPath', () => {
  test('defaults under ~/.arp and honours ARP_NODE_KEY_FILE', () => {
    expect(nodeKeyPath({}, '/home/op')).toBe('/home/op/.arp/node.key');
    expect(nodeKeyPath({ ARP_NODE_KEY_FILE: '/k' }, '/home/op')).toBe('/k');
  });
});

describe('loadOrCreateNodeKey', () => {
  test('creates a key readable by its owner only, then reads the same one back', () => {
    const path = join(dir, 'nested', 'node.key');
    const created = loadOrCreateNodeKey(path);
    expect(created.created).toBe(true);
    if (process.platform !== 'win32') {
      expect(statSync(path).mode & 0o777).toBe(0o600);
      expect(statSync(join(dir, 'nested')).mode & 0o777).toBe(0o700);
    }
    const again = loadOrCreateNodeKey(path);
    expect(again.created).toBe(false);
    expect(again.account.address).toBe(created.account.address);
  });

  test('refuses a key file other users can read', () => {
    const path = join(dir, 'node.key');
    writeFileSync(path, generatePrivateKey());
    chmodSync(path, 0o644);
    expect(() => loadOrCreateNodeKey(path, { platform: 'linux' })).toThrow(
      'readable by other users',
    );
  });

  test('refuses a file that is not a private key', () => {
    const path = join(dir, 'node.key');
    writeFileSync(path, 'hello', { mode: 0o600 });
    expect(() => loadOrCreateNodeKey(path)).toThrow('not a 32-byte hex private key');
  });

  test('accepts a key written without 0x', () => {
    const key = generatePrivateKey();
    const path = join(dir, 'node.key');
    writeFileSync(path, `${key.slice(2)}\n`, { mode: 0o600 });
    expect(loadOrCreateNodeKey(path).account.address).toBe(privateKeyToAccount(key).address);
  });
});

describe('resolveNodeKey', () => {
  test('AGENT_PRIVATE_KEY wins and nothing is written', () => {
    const key = generatePrivateKey();
    const resolved = resolveNodeKey({ AGENT_PRIVATE_KEY: key, ARP_NODE_KEY_FILE: join(dir, 'k') });
    expect(resolved).toMatchObject({ source: 'env', path: null, created: false });
    expect(resolved.account.address).toBe(privateKeyToAccount(key).address);
    expect(() => readFileSync(join(dir, 'k'))).toThrow();
  });

  test('a bad AGENT_PRIVATE_KEY is refused, an empty one falls through to the file', () => {
    expect(() => resolveNodeKey({ AGENT_PRIVATE_KEY: '0x12' })).toThrow('AGENT_PRIVATE_KEY');
    const resolved = resolveNodeKey({ AGENT_PRIVATE_KEY: ' ' }, { home: dir });
    expect(resolved).toMatchObject({
      source: 'file',
      path: join(dir, '.arp', 'node.key'),
      created: true,
    });
  });
});
