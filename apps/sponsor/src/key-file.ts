/** Where the treasury key comes from, and the one chain this service runs on.
 *
 *  **A 0600 file, never the key itself in an environment variable** (ADR `0089` §3, task 37c). The
 *  environment names the file; the file holds the key. An environment is inherited by every child
 *  process and printed by every crash reporter that dumps it; a file readable by its owner alone is
 *  not. The mode is checked before the file is read, so a key left world-readable is refused without
 *  ever being loaded.
 */
import { readFileSync, statSync } from 'node:fs';

import type { Hex } from 'viem';

/** Intuition testnet. ADR `0092` item 1 and ADR `0094`: the service is testnet-only until a new ADR. */
export const SPONSOR_CHAIN_ID = 13579;

export class KeyFileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'KeyFileError';
  }
}

const KEY = /^0x[0-9a-fA-F]{64}$/;

/**
 * The private key in `path`, refused when the file can be read or written by anyone but its owner.
 * The error never includes the file's content.
 */
export function readKeyFile(path: string): Hex {
  const stat = statSync(path);
  if (!stat.isFile()) throw new KeyFileError(`${path} is not a file`);
  if ((stat.mode & 0o077) !== 0) {
    throw new KeyFileError(
      `${path} has mode ${(stat.mode & 0o777).toString(8)}; it must be 600 (chmod 600 ${path})`,
    );
  }
  const raw = readFileSync(path, 'utf8').trim();
  const key = raw.startsWith('0x') ? raw : `0x${raw}`;
  if (!KEY.test(key)) throw new KeyFileError(`${path} does not hold a 32-byte hex private key`);
  return key as Hex; // The regex above is the 0x + 64 hex check `Hex` stands for.
}

/** Refuse any chain but testnet 13579, whatever the RPC answers. */
export function assertSponsorChain(chainId: number): void {
  if (chainId !== SPONSOR_CHAIN_ID) {
    throw new Error(
      `the sponsoring service runs on testnet ${SPONSOR_CHAIN_ID} only; the RPC is on chain ${chainId}`,
    );
  }
}
