/** The node's key: the one the install handshake binds to the agent, and the one receipts are signed
 *  with (ADR `0095`).
 *
 *  Generated on first use and kept with the operator, never sent: the handshake carries its
 *  **public** key. It signs receipts and the handshake message, and no transaction is ever signed
 *  with it (ADR `0038`).
 *
 *  **It is also the address a hirer pays**, because `task.ts` accepts a payment only when it was
 *  sent to the key that signs the receipt. So a generated key accumulates what hirers pay, and the
 *  file is worth what that address holds. A hirer learns the address from the binding
 *  (`nodeAddress`), where before task 39 it was the registry's `agentWallet`.
 *
 *  `AGENT_PRIVATE_KEY`, when set, is used instead, which is what the node did before task 39. It is
 *  kept because `docs/22` documents it as supported; it is the one key in ARP's programs that may
 *  come from the environment, and the file is the default. One key either way, so the key the
 *  handshake binds is the key that signs every receipt.
 *
 *  **The file is refused if anyone but its owner can read it**, the rule `ssh` applies to a private
 *  key: a key another local user could copy is a key that can sign as this agent. The policy is
 *  `loadOrCreateKeyFile` in `@arp-protocol/core/node`, the same for every ARP key file (ADR `0116`).
 */
import { homedir } from 'node:os';
import { join } from 'node:path';

import { arpHome, loadOrCreateKeyFile } from '@arp-protocol/core/node';

import { isHex, type Hex } from 'viem';
import { privateKeyToAccount, type PrivateKeyAccount } from 'viem/accounts';

/** Reads `AGENT_PRIVATE_KEY` and `ARP_NODE_KEY_FILE`. `process.env` is one. */
type Env = Readonly<Record<string, string | undefined>>;

export type NodeKey = {
  account: PrivateKeyAccount;
  /** `env` for `AGENT_PRIVATE_KEY`, otherwise the file it was read from or written to. */
  source: 'env' | 'file';
  path: string | null;
  created: boolean;
};

/** Where the key file lives: `ARP_NODE_KEY_FILE`, else `node.key` under `ARP_HOME` or `~/.arp`. */
export function nodeKeyPath(env: Env, home = homedir()): string {
  return env['ARP_NODE_KEY_FILE'] ?? join(arpHome(env, home), 'node.key');
}

function asPrivateKey(raw: string, where: string): Hex {
  const trimmed = raw.trim();
  const key = trimmed.startsWith('0x') ? trimmed : `0x${trimmed}`;
  if (!isHex(key) || key.length !== 66)
    throw new Error(`${where} is not a 32-byte hex private key`);
  return key;
}

/** Read the key at `path`, or create one there with mode 0600 in a 0700 directory. */
export function loadOrCreateNodeKey(
  path: string,
  options: { generate?: () => Hex; platform?: NodeJS.Platform } = {},
): NodeKey {
  const { key, created } = loadOrCreateKeyFile(path, options);
  return { account: privateKeyToAccount(key), source: 'file', path, created };
}

/** `AGENT_PRIVATE_KEY` if set, else the node key file. */
export function resolveNodeKey(
  env: Env,
  options: { home?: string; generate?: () => Hex; platform?: NodeJS.Platform } = {},
): NodeKey {
  const raw = env['AGENT_PRIVATE_KEY'];
  if (raw !== undefined && raw.trim() !== '') {
    return {
      account: privateKeyToAccount(asPrivateKey(raw, 'AGENT_PRIVATE_KEY')),
      source: 'env',
      path: null,
      created: false,
    };
  }
  return loadOrCreateNodeKey(nodeKeyPath(env, options.home), options);
}
