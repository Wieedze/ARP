/**
 * The Claude Desktop extension's agent key (ADR `0110`). Only the extension build loads this file
 * (`ARP_TOOLS=desktop`); the protocol package still holds no signer (ADR `0038`).
 *
 * The key is created on first use in `~/.arp/agent-key`, mode 0600, and never printed, logged or
 * returned. It signs two zero-value transactions on testnet 13579, `register()` and the MultiVault
 * approval, and two off-chain requests. Anything else is refused here, before a signature exists.
 */
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

import {
  createPublicClient,
  createWalletClient,
  getAddress,
  http,
  type Address,
  type Hex,
  type PublicClient,
  type TransactionReceipt,
} from 'viem';
import { generatePrivateKey, privateKeyToAccount, type PrivateKeyAccount } from 'viem/accounts';

import { intuitionTestnet } from '@arp-protocol/core';

export const DESKTOP_CHAIN_ID = 13579;

/** Where the key lives: the home directory, never the working directory (Claude Desktop's cwd is system32). */
export function agentKeyPath(home: string = homedir()): string {
  return join(home, '.arp', 'agent-key');
}

/** The agent's account, created silently the first time. */
export function loadOrCreateAgentKey(path: string = agentKeyPath()): PrivateKeyAccount {
  if (!existsSync(path)) {
    mkdirSync(join(path, '..'), { recursive: true, mode: 0o700 });
    writeFileSync(path, `${generatePrivateKey()}\n`, { mode: 0o600 });
  }
  chmodSync(path, 0o600);
  const raw = readFileSync(path, 'utf8').trim();
  if (!/^0x[0-9a-fA-F]{64}$/.test(raw)) throw new Error(`${path} does not hold a private key`);
  return privateKeyToAccount(raw as Hex); // checked to be 32 bytes of hex on the line above
}

export type AllowedCall = { to: Address; data: Hex; value: bigint; chainId: number };

/**
 * Whether the extension may sign `call`: zero value, chain 13579, and a contract on `allowed`.
 * Returns the reason for a refusal, `null` when it may.
 */
export function refusal(call: AllowedCall, allowed: readonly Address[]): string | null {
  if (call.chainId !== DESKTOP_CHAIN_ID) return `chain ${call.chainId} is not testnet ${DESKTOP_CHAIN_ID}`;
  if (call.value !== 0n) return `a call that sends value (${call.value} wei) is never signed here`;
  if (!allowed.some((address) => getAddress(address) === getAddress(call.to))) return `${call.to} is not a contract this key may call`;
  return null;
}

export type AgentSender = {
  address: Address;
  account: PrivateKeyAccount;
  client: PublicClient;
  /** Sends one allowed call and waits for its receipt. Throws on a refusal or a revert. */
  send(call: AllowedCall): Promise<TransactionReceipt>;
};

export function agentSender(account: PrivateKeyAccount, rpcUrl: string, allowed: readonly Address[]): AgentSender {
  const client = createPublicClient({ chain: intuitionTestnet, transport: http(rpcUrl) });
  const wallet = createWalletClient({ account, chain: intuitionTestnet, transport: http(rpcUrl) });
  return {
    address: account.address,
    account,
    client,
    async send(call) {
      const why = refusal(call, allowed);
      if (why !== null) throw new Error(`refused: ${why}`);
      const hash = await wallet.sendTransaction({ to: call.to, data: call.data, value: 0n });
      const receipt = await client.waitForTransactionReceipt({ hash });
      if (receipt.status !== 'success') throw new Error(`transaction ${hash} reverted`);
      return receipt;
    },
  };
}
