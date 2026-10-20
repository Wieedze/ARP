/** The one place in this repo that signs. Data and guards; the CLI and the walk both call it.
 *
 *  Extracted from `agent-send-plan.ts` so a second caller cannot grow a second copy of the guards.
 *  `@arp-protocol/core` must never hold a key (ADR `0038`): the connector plans, the agent's own
 *  runtime signs. This module *is* that runtime, standing in for an operator's one.
 *
 *  Three guards, each for a failure this repo has either made or written down:
 *
 *    1. **Every call's `chainId` must equal the expected chain, and that must equal the RPC's.** A
 *       plan built for one chain and signed against another sends the fee to an address nobody
 *       controls — each MultiVault is codeless on the other chain (`declare/types.ts`).
 *    2. **Every `to` must have code.** The same hazard one level down: a value-bearing call to a
 *       codeless address does not revert, it is a plain transfer that succeeds.
 *    3. **`execute` must be asked for.** The default reports what would happen and spends nothing.
 *
 *  Sends **sequentially**, waiting for each receipt: `docs/07` specifies that writes from one wallet
 *  go one at a time, and a `create-atom` must land before the `create-triple` that references it or
 *  `createTriples` reverts with `MultiVault_TermDoesNotExist`.
 *
 *  The key is read from the environment and never printed, logged or returned (ADR `0037`). The
 *  signer's address is returned so a caller can show it and check it before executing.
 */
import { createPublicClient, createWalletClient, formatEther, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import type { Address, Hex } from 'viem';

/** A prepared call as it travels through JSON: `value` is a decimal string, since JSON has no bigint. */
export type SerialisedCall = {
  kind: string;
  chainId: number;
  to: Address;
  value: string | number;
  data: Hex;
  why: string;
};

export type SendOutcome =
  | { status: 'refused'; reason: string }
  | { status: 'dry-run'; signer: Address; total: bigint; balance: bigint }
  | {
      status: 'sent' | 'reverted';
      signer: Address;
      total: bigint;
      balanceBefore: bigint;
      balanceAfter: bigint;
      hashes: Hex[];
      revertedAt?: number;
    };

export type SendOptions = {
  calls: readonly SerialisedCall[];
  chainId: number;
  rpcUrl: string;
  /** Env var holding the key. Read, never printed. */
  keyName?: string;
  execute?: boolean;
  /** Per-call progress, so a caller can show each receipt as it lands. */
  onCall?: (
    index: number,
    call: SerialisedCall,
    hash: Hex,
    status: string,
    gasUsed: bigint,
  ) => void;
};

/** Signs and sends a plan, or refuses with the reason. Never throws on a guard — it reports. */
export async function sendPlan(options: SendOptions): Promise<SendOutcome> {
  const { calls, chainId, rpcUrl } = options;
  if (calls.length === 0) return { status: 'refused', reason: 'the plan is empty' };

  const raw = process.env[options.keyName ?? 'AGENT_PRIVATE_KEY'];
  if (!raw) {
    return { status: 'refused', reason: `${options.keyName ?? 'AGENT_PRIVATE_KEY'} is not set` };
  }
  const account = privateKeyToAccount((raw.startsWith('0x') ? raw : `0x${raw}`) as Hex);

  const publicClient = createPublicClient({ transport: http(rpcUrl) });
  const actualChain = await publicClient.getChainId();
  if (actualChain !== chainId) {
    return {
      status: 'refused',
      reason: `the RPC is chain ${actualChain}, the plan says ${chainId}`,
    };
  }

  const wrongChain = calls.filter((call) => call.chainId !== chainId);
  if (wrongChain.length > 0) {
    const chains = [...new Set(wrongChain.map((call) => call.chainId))].join(', ');
    return {
      status: 'refused',
      reason: `${wrongChain.length} of ${calls.length} calls are for chain ${chains}, not ${chainId}`,
    };
  }

  for (const to of [...new Set(calls.map((call) => call.to))]) {
    const code = await publicClient.getBytecode({ address: to });
    if (!code || code === '0x') {
      return {
        status: 'refused',
        reason: `${to} has no code on chain ${actualChain} — a value-bearing call there would succeed as a plain transfer and the TRUST would be unrecoverable`,
      };
    }
  }

  const total = calls.reduce((sum, call) => sum + BigInt(call.value), 0n);
  const balance = await publicClient.getBalance({ address: account.address });
  if (balance < total) {
    return {
      status: 'refused',
      reason: `balance ${formatEther(balance)} is below the plan's ${formatEther(total)}`,
    };
  }

  if (options.execute !== true) {
    return { status: 'dry-run', signer: account.address, total, balance };
  }

  const wallet = createWalletClient({ account, transport: http(rpcUrl) });
  const hashes: Hex[] = [];
  for (const [index, call] of calls.entries()) {
    const hash = await wallet.sendTransaction({
      to: call.to,
      value: BigInt(call.value),
      data: call.data,
      chain: null,
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    hashes.push(hash);
    options.onCall?.(index, call, hash, receipt.status, receipt.gasUsed);
    if (receipt.status !== 'success') {
      return {
        status: 'reverted',
        signer: account.address,
        total,
        balanceBefore: balance,
        balanceAfter: await publicClient.getBalance({ address: account.address }),
        hashes,
        revertedAt: index,
      };
    }
  }

  return {
    status: 'sent',
    signer: account.address,
    total,
    balanceBefore: balance,
    balanceAfter: await publicClient.getBalance({ address: account.address }),
    hashes,
  };
}
