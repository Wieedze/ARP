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

import { generatePrivateKey } from 'viem/accounts';

import { receiptSigner } from '../src/content.js';

let dir: string;
const home = process.cwd();
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'arp-receipt-key-'));
  process.chdir(dir);
  delete process.env['ARP_RECEIPT_KEY'];
  delete process.env['ARP_NO_RECEIPTS'];
});
afterEach(() => {
  process.chdir(home);
  if (existsSync(join(dir, '.arp'))) chmodSync(join(dir, '.arp'), 0o700);
  rmSync(dir, { recursive: true, force: true });
});

test('a generated key lands beside a .gitignore that ignores the whole directory', () => {
  expect(receiptSigner()).not.toBeNull();
  expect(statSync(join(dir, '.arp', 'receipt-key')).mode & 0o777).toBe(0o600);
  expect(readFileSync(join(dir, '.arp', '.gitignore'), 'utf8')).toBe('*\n');
});

test('a key left by an older server gets its .gitignore on the next start', () => {
  mkdirSync(join(dir, '.arp'));
  receiptSigner();
  rmSync(join(dir, '.arp', '.gitignore'));
  receiptSigner();
  expect(existsSync(join(dir, '.arp', '.gitignore'))).toBe(true);
});

// Root writes through a read-only directory, so the failure this test needs cannot happen there.
test.skipIf(process.getuid?.() === 0)(
  'a kept key still signs when its directory refuses the .gitignore',
  () => {
    mkdirSync(join(dir, '.arp'));
    writeFileSync(join(dir, '.arp', 'receipt-key'), `${generatePrivateKey()}\n`, { mode: 0o600 });
    chmodSync(join(dir, '.arp'), 0o500);
    const stderr = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      expect(receiptSigner()).not.toBeNull();
      expect(existsSync(join(dir, '.arp', '.gitignore'))).toBe(false);
      expect(stderr).toHaveBeenCalledWith(expect.stringContaining('cannot be written'));
    } finally {
      stderr.mockRestore();
    }
  },
);
