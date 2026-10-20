/** Sign and send a prepared plan. **This is the only script in the repo that signs.**
 *
 *      bun run scripts/agent-declare-used.ts … --json > /tmp/plan.json
 *      bun run scripts/agent-send-plan.ts --chain 13579 --plan /tmp/plan.json           # dry run
 *      bun run scripts/agent-send-plan.ts --chain 13579 --plan /tmp/plan.json --execute
 *
 *  It exists because `@arp-protocol/core` must never hold a key (ADR `0038`): the connector plans,
 *  the agent's own runtime signs. This file *is* that runtime, standing in for an operator's one,
 *  which is why it lives in `scripts/` and imports no planner.
 *
 *  Three guards, each for a failure this repo has either made or written down:
 *
 *    1. **Every call's `chainId` must equal `--chain`, and `--chain` must equal the RPC's.** A plan
 *       built for one chain and signed against another sends the fee to an address nobody controls
 *       (`declare/types.ts` on `chainId`).
 *    2. **`to` must have code.** That is the same hazard one level down: a value-bearing call to a
 *       codeless address does not revert, it is a plain transfer that succeeds. One `eth_getCode`
 *       makes the documented trap unreachable rather than merely documented.
 *    3. **`--execute` is required.** The default prints what would happen and spends nothing.
 *
 *  Sends **sequentially**, waiting for each receipt: `docs/07` specifies that triples from one
 *  wallet are written one at a time, and `create-atom` must land before the `create-triple` that
 *  references it or `createTriples` reverts with `MultiVault_TermDoesNotExist`.
 *
 *  The key is read from the environment and never printed, logged or returned (ADR `0037`). The
 *  signer's address is printed and must be checked against the expected account before `--execute`.
 */
import { readFileSync } from 'node:fs';

import { createPublicClient, createWalletClient, formatEther, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import type { Address, Hex } from 'viem';

type SerialisedCall = {
  kind: string;
  chainId: number;
  to: Address;
  /** Decimal string — JSON holds no bigint. */
  value: string | number;
  data: Hex;
  why: string;
};

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

const chainArg = arg('chain');
const planPath = arg('plan');
const keyName = arg('key') ?? 'AGENT_PRIVATE_KEY';
const execute = process.argv.includes('--execute');

if (!chainArg || !planPath) {
  console.error(
    'usage: --chain <id> --plan <file.json> [--key AGENT_PRIVATE_KEY] [--execute]\n' +
      '  The plan is a JSON array of prepared calls with `value` as a decimal string.',
  );
  process.exit(1);
}
const expectedChain = Number(chainArg);

const rpcUrl = process.env.INTUITION_RPC_URL ?? process.env.INTUITION_TESTNET_RPC_URL;
if (!rpcUrl) {
  console.error('no RPC: set INTUITION_RPC_URL or INTUITION_TESTNET_RPC_URL');
  process.exit(1);
}

const raw = process.env[keyName];
if (!raw) {
  console.error(`${keyName} is not set`);
  process.exit(1);
}
const account = privateKeyToAccount((raw.startsWith('0x') ? raw : `0x${raw}`) as Hex);

const calls = JSON.parse(readFileSync(planPath, 'utf8')) as SerialisedCall[];
if (!Array.isArray(calls) || calls.length === 0) {
  console.error(`${planPath} is not a non-empty array of calls`);
  process.exit(1);
}

const publicClient = createPublicClient({ transport: http(rpcUrl) });
const actualChain = await publicClient.getChainId();

console.log(`signer     ${account.address}`);
console.log(`rpc chain  ${actualChain}`);
console.log(`plan chain ${expectedChain}`);

if (actualChain !== expectedChain) {
  console.error(`\nREFUSED — the RPC is chain ${actualChain}, the plan says ${expectedChain}.`);
  process.exit(3);
}

const wrongChain = calls.filter((c) => c.chainId !== expectedChain);
if (wrongChain.length > 0) {
  console.error(
    `\nREFUSED — ${wrongChain.length} of ${calls.length} calls are not for chain ${expectedChain}: ` +
      `${[...new Set(wrongChain.map((c) => c.chainId))].join(', ')}.`,
  );
  process.exit(3);
}

const targets = [...new Set(calls.map((c) => c.to))];
for (const to of targets) {
  const code = await publicClient.getBytecode({ address: to });
  if (!code || code === '0x') {
    console.error(
      `\nREFUSED — ${to} has no code on chain ${actualChain}. A value-bearing call there would ` +
        `succeed as a plain transfer and the TRUST would be unrecoverable.`,
    );
    process.exit(3);
  }
}
console.log(
  `targets    ${targets.length} contract${targets.length === 1 ? '' : 's'}, all with code`,
);

const total = calls.reduce((sum, c) => sum + BigInt(c.value), 0n);
const balance = await publicClient.getBalance({ address: account.address });
console.log(`balance    ${formatEther(balance)}`);
console.log(`plan total ${formatEther(total)}\n`);

calls.forEach((c, i) => {
  console.log(
    `  ${String(i + 1).padStart(2)}. ${c.kind.padEnd(14)} ${formatEther(BigInt(c.value)).padStart(14)}  ${c.why}`,
  );
});

if (balance < total) {
  console.error(
    `\nREFUSED — balance ${formatEther(balance)} is below the plan's ${formatEther(total)}.`,
  );
  process.exit(3);
}

if (!execute) {
  console.log('\nDry run. Nothing signed, nothing sent. Re-run with --execute to send.');
  process.exit(0);
}

const wallet = createWalletClient({ account, transport: http(rpcUrl) });
console.log('\nsending, one at a time:\n');

const hashes: Hex[] = [];
for (const [i, c] of calls.entries()) {
  const hash = await wallet.sendTransaction({
    to: c.to,
    value: BigInt(c.value),
    data: c.data,
    chain: null,
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  hashes.push(hash);
  console.log(
    `  ${String(i + 1).padStart(2)}. ${receipt.status.padEnd(8)} ${hash}  gas ${receipt.gasUsed}`,
  );
  if (receipt.status !== 'success') {
    console.error(`\nSTOPPED — call ${i + 1} reverted. ${i} call(s) landed before it.`);
    process.exit(4);
  }
}

const after = await publicClient.getBalance({ address: account.address });
console.log(
  `\nall ${calls.length} landed. balance ${formatEther(balance)} → ${formatEther(after)}`,
);
console.log(JSON.stringify({ chainId: actualChain, signer: account.address, hashes }, null, 2));
