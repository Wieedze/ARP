/**
 * The agent key of the sponsored loop (ADR `0110`), in the Claude Desktop extension and in Claude
 * Code. Only `ARP_TOOLS=desktop` or `sponsored` loads this file; the protocol package still holds
 * no signer (ADR `0038`).
 *
 * The key is created on first use in `~/.arp/agent-key`, mode 0600, and never printed, logged or
 * returned. It signs two zero-value transactions on testnet 13579, `register()` and the MultiVault
 * approval, and two off-chain requests. Anything else is refused here, before a signature exists.
 */
import { homedir } from 'node:os';
import { join } from 'node:path';

import { arpHome, loadOrCreateKeyFile } from '@arp-protocol/core/node';

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
import { privateKeyToAccount, type PrivateKeyAccount } from 'viem/accounts';

import { intuitionTestnet } from '@arp-protocol/core';

export const DESKTOP_CHAIN_ID = 13579;

/** Where the key lives: `ARP_HOME` or `~/.arp`, never the working directory (Claude Desktop's cwd is system32). */
export function agentKeyPath(home: string = homedir()): string {
  return join(arpHome(process.env, home), 'agent-key');
}

/**
 * The agent's account, created silently the first time. An existing key another user can read is
 * refused, not chmodded: by then it may have been copied, and a quiet fix hides that (ADR `0116`).
 */
export function loadOrCreateAgentKey(
  path: string = agentKeyPath(),
  options: { platform?: NodeJS.Platform } = {},
): PrivateKeyAccount {
  return privateKeyToAccount(loadOrCreateKeyFile(path, options).key);
}

export type AllowedCall = { to: Address; data: Hex; value: bigint; chainId: number };

/** One exact call the key may sign: this contract, this calldata. */
export type PermittedCall = { to: Address; data: Hex };

/**
 * Whether the extension may sign `call`: zero value, chain 13579, and exactly one of `permitted`,
 * calldata included. The caller builds `permitted` itself (`register()`, and the approval of the
 * sponsor's address), so a sponsor answer cannot widen it: a zero-value `redeem`, or an `approve`
 * to another address, is refused. Returns the reason for a refusal, `null` when it may.
 */
export function refusal(call: AllowedCall, permitted: readonly PermittedCall[]): string | null {
  if (call.chainId !== DESKTOP_CHAIN_ID) return `chain ${call.chainId} is not testnet ${DESKTOP_CHAIN_ID}`;
  if (call.value !== 0n) return `a call that sends value (${call.value} wei) is never signed here`;
  const same = (p: PermittedCall) => getAddress(p.to) === getAddress(call.to) && p.data.toLowerCase() === call.data.toLowerCase();
  if (!permitted.some(same)) return `this key signs only register() and the sponsor's approval, not this call to ${call.to}`;
  return null;
}

export type AgentSender = {
  address: Address;
  account: PrivateKeyAccount;
  client: PublicClient;
  /** Sends `call` if it is one of `permitted`, and waits for its receipt. Throws on a refusal or a revert. */
  send(call: AllowedCall, permitted: readonly PermittedCall[]): Promise<TransactionReceipt>;
};

export function agentSender(account: PrivateKeyAccount, rpcUrl: string): AgentSender {
  const client = createPublicClient({ chain: intuitionTestnet, transport: http(rpcUrl) });
  const wallet = createWalletClient({ account, chain: intuitionTestnet, transport: http(rpcUrl) });
  return {
    address: account.address,
    account,
    client,
    async send(call, permitted) {
      const why = refusal(call, permitted);
      if (why !== null) throw new Error(`refused: ${why}`);
      const hash = await wallet.sendTransaction({ to: call.to, data: call.data, value: 0n });
      const receipt = await client.waitForTransactionReceipt({ hash });
      if (receipt.status !== 'success') throw new Error(`transaction ${hash} reverted`);
      return receipt;
    },
  };
}
