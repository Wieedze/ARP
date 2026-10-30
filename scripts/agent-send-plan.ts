/** Sign and send a prepared plan, from the command line.
 *
 *      bun run scripts/agent-declare-used.ts … --json /tmp/plan.json
 *      bun run scripts/agent-send-plan.ts --chain 13579 --plan /tmp/plan.json           # dry run
 *      bun run scripts/agent-send-plan.ts --chain 13579 --plan /tmp/plan.json --execute
 *
 *  A transport over `send-plan.ts`, which holds the guards and is the only place in this repo that
 *  signs. The split exists so the walk (`demo-adopt.ts`) and this CLI cannot grow two copies of
 *  those guards — the first version of this file *was* the guards, and a second caller is exactly
 *  how that becomes two.
 *
 *  `@arp-protocol/core` must never hold a key (ADR `0038`): the connector plans, the agent's own
 *  runtime signs.
 */
import { readFileSync } from 'node:fs';

import { formatEther } from 'viem';

import { sendPlan, type SerialisedCall } from './helpers/send-plan.js';

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}

const chainArg = arg('chain');
const planPath = arg('plan');
if (!chainArg || !planPath) {
  console.error(
    'usage: --chain <id> --plan <file.json> [--key AGENT_PRIVATE_KEY] [--execute]\n' +
      '  The plan is a JSON array of prepared calls with `value` as a decimal string.',
  );
  process.exit(1);
}

const rpcUrl = process.env.INTUITION_RPC_URL ?? process.env.INTUITION_TESTNET_RPC_URL;
if (!rpcUrl) {
  console.error('no RPC: set INTUITION_RPC_URL or INTUITION_TESTNET_RPC_URL');
  process.exit(1);
}

const parsed = JSON.parse(readFileSync(planPath, 'utf8')) as SerialisedCall[];
if (!Array.isArray(parsed) || parsed.length === 0) {
  console.error(`${planPath} is not a non-empty array of calls`);
  process.exit(1);
}

// `--from <n>`: skip the first n calls, for resuming a plan the RPC cut short. A plan's calls are
// deterministic, so re-planning would produce the same list minus what landed — this saves the
// re-read when the count that landed is already known from the log.
const skip = Number(arg('from') ?? 0);
if (!Number.isInteger(skip) || skip < 0 || skip >= parsed.length) {
  console.error(`--from must be a whole number between 0 and ${parsed.length - 1}`);
  process.exit(1);
}
const calls = skip > 0 ? parsed.slice(skip) : parsed;
if (skip > 0) console.log(`resuming   skipping the first ${skip} call(s) of ${parsed.length}`);

console.log(`plan       ${calls.length} call(s) for chain ${chainArg}`);
for (const [index, call] of calls.entries()) {
  console.log(
    `  ${String(index + 1).padStart(2)}. ${call.kind.padEnd(14)} ${formatEther(BigInt(call.value)).padStart(14)}  ${call.why}`,
  );
}

const outcome = await sendPlan({
  calls,
  chainId: Number(chainArg),
  rpcUrl,
  ...(arg('key') === undefined ? {} : { keyName: arg('key') as string }),
  // `--pause <ms>`: Intuition's public RPC meters bytes over time, not per call. See `pauseMs`.
  ...(arg('pause') === undefined ? {} : { pauseMs: Number(arg('pause')) }),
  execute: process.argv.includes('--execute'),
  onCall: (index, _call, hash, status, gasUsed) => {
    console.log(`  ${String(index + 1).padStart(2)}. ${status.padEnd(8)} ${hash}  gas ${gasUsed}`);
  },
});

if (outcome.status === 'refused') {
  console.error(`\nREFUSED — ${outcome.reason}.`);
  process.exit(3);
}
if (outcome.status === 'dry-run') {
  console.log(`\nsigner     ${outcome.signer}`);
  console.log(`balance    ${formatEther(outcome.balance)}`);
  console.log(`plan total ${formatEther(outcome.total)}`);
  console.log('\nDry run. Nothing signed, nothing sent. Re-run with --execute to send.');
  process.exit(0);
}
if (outcome.status === 'reverted') {
  console.error(
    `\nSTOPPED — call ${(outcome.revertedAt ?? 0) + 1} reverted. ${outcome.revertedAt ?? 0} call(s) landed before it.`,
  );
  process.exit(4);
}

console.log(
  `\nall ${calls.length} landed. balance ${formatEther(outcome.balanceBefore)} → ${formatEther(outcome.balanceAfter)}`,
);
console.log(
  JSON.stringify(
    { chainId: Number(chainArg), signer: outcome.signer, hashes: outcome.hashes },
    null,
    2,
  ),
);
