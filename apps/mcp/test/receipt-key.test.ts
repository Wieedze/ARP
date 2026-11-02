import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';

import { MovedStateError } from '@arp-protocol/core/node';

import { receiptSigner } from '../src/content.js';

let dir: string;
let state: string;
const start = process.cwd();
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'arp-receipt-key-'));
  state = join(dir, 'home');
  process.chdir(dir);
  process.env['ARP_HOME'] = state;
  delete process.env['ARP_RECEIPT_KEY'];
  delete process.env['ARP_NO_RECEIPTS'];
});
afterEach(() => {
  process.chdir(start);
  delete process.env['ARP_HOME'];
  if (existsSync(state)) chmodSync(state, 0o700);
  rmSync(dir, { recursive: true, force: true });
});

test('a generated key lands under ARP_HOME, beside a .gitignore, and not in the working directory', () => {
  expect(receiptSigner()).not.toBeNull();
  expect(statSync(join(state, 'receipt-key')).mode & 0o777).toBe(0o600);
  expect(readFileSync(join(state, '.gitignore'), 'utf8')).toBe('*\n');
  expect(existsSync(join(dir, '.arp'))).toBe(false);
});

test('one key, whatever directory the server is started in', () => {
  const first = receiptSigner()?.address;
  mkdirSync(join(dir, 'elsewhere'));
  process.chdir(join(dir, 'elsewhere'));
  expect(receiptSigner()?.address).toBe(first);
});

test('a key left in <cwd>/.arp by an older server stops it, and is not replaced', () => {
  const old = generatePrivateKey();
  mkdirSync(join(dir, '.arp'));
  writeFileSync(join(dir, '.arp', 'receipt-key'), `${old}\n`, { mode: 0o600 });
  expect(() => receiptSigner()).toThrow(MovedStateError);
  expect(existsSync(join(state, 'receipt-key'))).toBe(false);
  // Moved by hand, it is the same signer as before.
  mkdirSync(state);
  writeFileSync(join(state, 'receipt-key'), `${old}\n`, { mode: 0o600 });
  expect(receiptSigner()?.address).toBe(privateKeyToAccount(old).address);
});

test('a key left by an older server gets its .gitignore on the next start', () => {
  receiptSigner();
  rmSync(join(state, '.gitignore'));
  receiptSigner();
  expect(existsSync(join(state, '.gitignore'))).toBe(true);
});

// Root writes through a read-only directory, so the failure this test needs cannot happen there.
test.skipIf(process.getuid?.() === 0)(
  'a kept key still signs when its directory refuses the .gitignore',
  () => {
    mkdirSync(state);
    writeFileSync(join(state, 'receipt-key'), `${generatePrivateKey()}\n`, { mode: 0o600 });
    chmodSync(state, 0o500);
    const stderr = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      expect(receiptSigner()).not.toBeNull();
      expect(existsSync(join(state, '.gitignore'))).toBe(false);
      expect(stderr).toHaveBeenCalledWith(expect.stringContaining('cannot be written'));
    } finally {
      stderr.mockRestore();
    }
  },
);
