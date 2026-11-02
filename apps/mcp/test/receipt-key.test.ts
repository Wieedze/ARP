import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, expect, test } from 'vitest';

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
