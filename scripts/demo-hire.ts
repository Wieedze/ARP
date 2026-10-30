/** The second half of the loop: one agent hires another, then pays to say so.
 *
 *      # terminal 1 — the agent being hired runs its node
 *      AGENT_PRIVATE_KEY=$AGENT2_PRIVATE_KEY AGENT_NODE_PORT=3100 bun run apps/node/src/node.ts
 *
 *      # terminal 2 — the hirer
 *      ARP_TARGET=testnet bun run scripts/demo-hire.ts \
 *        --hirer 13579/3 --hired 13579/2 --registry 0xC165A2AD… --node http://localhost:3100 \
 *        --pay 0.001 --stake 0.001 [--execute]
 *
 *  **Why the rating needs no new mechanism.** In ERC-8004 plus MCP a tool *is* an agent
 *  (`docs/14`), so "I used this agent" is the same claim as "I used this tool": the canonical `uses`
 *  predicate, the hired agent's identity atom as the object, the same vault. Nothing is invented,
 *  and the hired agent's atom is an `ipfs://` URI, so the connector's existing planner takes it
 *  without a special case.
 *
 *  **What makes the rating worth more than a star.** Four facts, in order, and each one is checked
 *  rather than asserted:
 *
 *    1. the hirer **paid** — a transaction, on chain, from the hirer to the hired agent
 *    2. the hired agent **verified that payment** before doing anything (`agent-node.ts`)
 *    3. it returned an **EIP-712 receipt signed by its own runtime key**, binding this payment, this
 *       request and this result on this chain (`packages/protocol/src/hire-receipt.ts`)
 *    4. the hirer then **deposited TRUST** on `(hirer, uses, hired)` — which it can withdraw, so the
 *       figure says what it thinks now rather than what it thought once
 *
 *  A star has none of the four. `docs/14:159`'s top rung is "payment, on-chain call, or delegation
 *  redemption"; this walk produces the first, and then prices a claim anchored to it.
 *
 *  Dry by default. `--execute` signs with `PRIVATE_KEY` — the hirer's runtime wallet — read from the
 *  environment and never printed (ADR `0037`).
 */
import { readFileSync } from 'node:fs';

import { createPublicClient, createWalletClient, formatEther, http, parseEther } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import type { Address, Hex } from 'viem';

import {
  intuitionToolAtomLookup,
  multiVaultReads,
  prepareDeclareUsed,
  prepareStakeOnUsed,
  resolveDeclarationSubject,
  type PreparedCall,
} from '../packages/protocol/src/declare/index.js';
import {
  hireReceiptMatches,
  verifyHireReceipt,
  type SignedHireReceipt,
} from '../packages/protocol/src/hire-receipt.js';
import { getToolUsage } from '../packages/protocol/src/tool-usage.js';
import { canonicalAgentThing, thingUri } from './helpers/intuition-pin.js';
import { sendPlan, type SerialisedCall } from './helpers/send-plan.js';

const TARGETS = { mainnet: 1155, testnet: 13579 } as const;
const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
};
const execute = process.argv.includes('--execute');

const chainId = TARGETS[(process.env.ARP_TARGET ?? 'testnet') as keyof typeof TARGETS];
const hirerRef = arg('hirer');
const hiredRef = arg('hired');
const nodeUrl = arg('node');
if (chainId === undefined || !hirerRef || !hiredRef || !nodeUrl) {
  console.error(
    'usage: --hirer <chainId>/<tokenId> --hired <chainId>/<tokenId> --node <url>\n' +
      '       [--registry <0x…>] [--pay <TRUST>] [--stake <TRUST>] [--execute]',
  );
  process.exit(1);
}
const registry = arg('registry') as Address | undefined;
const [, hirerToken] = hirerRef.split('/') as [string, string];
const [, hiredToken] = hiredRef.split('/') as [string, string];
const ref = (tokenId: string) => ({
  chainId,
  tokenId,
  ...(registry === undefined ? {} : { registry }),
});

const record = JSON.parse(
  readFileSync(new URL(`../data/deployments/${chainId}.json`, import.meta.url), 'utf8'),
) as { chain?: { rpcUrl?: string; graphqlUrl?: string }; intuition?: { multiVault?: string } };
const rpcUrl = process.env.INTUITION_RPC_URL ?? record.chain?.rpcUrl;
const graphqlUrl = process.env.INTUITION_GRAPHQL_URL ?? record.chain?.graphqlUrl;
const multiVault = record.intuition?.multiVault as Address | undefined;
if (!rpcUrl || !graphqlUrl || !multiVault) {
  console.error(`data/deployments/${chainId}.json is incomplete`);
  process.exit(1);
}
const rawKey = process.env.PRIVATE_KEY;
if (!rawKey) {
  console.error('PRIVATE_KEY is not set — it is the hirer runtime that pays and signs.');
  process.exit(1);
}
const hirerAccount = privateKeyToAccount((rawKey.startsWith('0x') ? rawKey : `0x${rawKey}`) as Hex);
const publicClient = createPublicClient({ transport: http(rpcUrl) });

const step = (n: number, title: string) => console.log(`\n${'─'.repeat(72)}\n${n}. ${title}\n`);

console.log(`chain   ${chainId}`);
console.log(`hirer   agent ${hirerToken}, runtime ${hirerAccount.address}`);
console.log(`hired   agent ${hiredToken}, node ${nodeUrl}`);
console.log(`mode    ${execute ? 'EXECUTE — this spends' : 'dry run'}`);

// ── 1 ────────────────────────────────────────────────────────────────────────
step(1, 'Who is listening, and what do they charge?');
const health = (await (
  await fetch(`${nodeUrl}/healthz`, { signal: AbortSignal.timeout(8_000) })
).json()) as {
  ok?: boolean;
  agent?: Address;
  minBudgetWei?: string;
};
if (health.ok !== true || !health.agent) {
  console.error('  the node did not answer /healthz with an agent address.');
  process.exit(3);
}
const minBudget = BigInt(health.minBudgetWei ?? '0');
console.log(`  agent runtime ${health.agent}`);
console.log(`  minimum       ${formatEther(minBudget)}`);

// ── 2 ────────────────────────────────────────────────────────────────────────
step(2, 'Pay it — because an unpaid request is worth what a star is worth');
const payAmount = parseEther(arg('pay') ?? formatEther(minBudget));
if (payAmount < minBudget) {
  console.error(
    `  ${formatEther(payAmount)} is below the agent's minimum ${formatEther(minBudget)}.`,
  );
  process.exit(3);
}
let paymentTxHash: Hex | undefined;
if (!execute) {
  console.log(`  would send ${formatEther(payAmount)} to ${health.agent}. Dry run.`);
} else {
  const wallet = createWalletClient({ account: hirerAccount, transport: http(rpcUrl) });
  paymentTxHash = await wallet.sendTransaction({ to: health.agent, value: payAmount, chain: null });
  const receipt = await publicClient.waitForTransactionReceipt({ hash: paymentTxHash });
  console.log(`  ${receipt.status}  ${paymentTxHash}  ${formatEther(payAmount)}`);
}

// ── 3 ────────────────────────────────────────────────────────────────────────
step(3, 'Hire it, and check the receipt is about this request');
let receiptOk = false;
if (paymentTxHash === undefined) {
  console.log('  skipped — no payment to present. Re-run with --execute.');
} else {
  const payload = { job: arg('job') ?? 'demo', at: new Date().toISOString() };
  const response = await fetch(`${nodeUrl}/task`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ paymentTxHash, requesterAddress: hirerAccount.address, payload }),
    signal: AbortSignal.timeout(60_000),
  });
  const body = (await response.json()) as {
    result?: unknown;
    receipt?: SignedHireReceipt;
    error?: string;
  };
  if (!response.ok || body.receipt === undefined) {
    console.error(`  the node refused: ${body.error ?? response.status}`);
    process.exit(3);
  }
  const signed = body.receipt;
  const verdict = await verifyHireReceipt(signed);
  // Each of these is a way a valid signature can still be about something else.
  const problems = [
    verdict.status !== 'valid' && `signature ${verdict.status}`,
    signed.agent.toLowerCase() !== health.agent.toLowerCase() && 'signed by another agent',
    signed.chainId !== chainId && `receipt is for chain ${signed.chainId}`,
    signed.receipt.payment.toLowerCase() !== paymentTxHash.toLowerCase() && 'names another payment',
    signed.receipt.requester.toLowerCase() !== hirerAccount.address.toLowerCase() &&
      'names another requester',
    !hireReceiptMatches(signed.receipt, payload, body.result) &&
      'hashes do not match this exchange',
  ].filter((problem): problem is string => typeof problem === 'string');
  receiptOk = problems.length === 0;
  console.log(`  result     ${JSON.stringify(body.result).slice(0, 110)}`);
  console.log(
    `  receipt    EIP-712 on ${signed.chainId}, ${signed.receipt.agentRegistry || 'no ERC-8004 identity'}` +
      `${signed.receipt.agentRegistry ? ` #${signed.receipt.agentId}` : ''}`,
  );
  console.log(
    `  signed by  ${verdict.status === 'valid' ? verdict.signer : signed.agent}  ` +
      `${receiptOk ? '— the agent that answered, about this payment and this exchange' : `— ${problems.join('; ')}`}`,
  );
  if (!receiptOk) {
    console.error('\n  REFUSED — the receipt is not about this hire.');
    process.exit(3);
  }
}

// ── 4 ────────────────────────────────────────────────────────────────────────
step(4, 'Rate it: the same `uses` edge as a tool, and TRUST behind it');
// The error is printed, not swallowed: a blanket catch here reported "no identity atom" for a
// transport failure once, which sent the reader looking in the wrong place.
const subject = await resolveDeclarationSubject({ agent: ref(hirerToken), graphqlUrl }).catch(
  (error: unknown) => {
    const err = error as Error;
    console.error(`  could not resolve the hirer: ${err.name} — ${err.message.slice(0, 200)}`);
    return null;
  },
);
if (subject === null) process.exit(3);
// The hired agent's identity atom is an `ipfs://` URI, so the connector's planner takes it as a
// "tool" with no special case. That is not a trick — in ERC-8004 plus MCP a tool is an agent.
const hiredUri = thingUri(canonicalAgentThing(chainId, hiredToken));
const reads = multiVaultReads({ address: multiVault, chainId, rpcUrl });
const declarePlan = await prepareDeclareUsed({
  subject,
  tools: [hiredUri],
  reads,
  lookup: intuitionToolAtomLookup({ graphqlUrl }),
});
const edge = declarePlan.tools[0];
console.log(`  subject  ${subject}  (agent ${hirerToken})`);
console.log(
  `  object   ${edge?.atomId}  (agent ${hiredToken}, ${edge?.atomExists ? 'atom exists' : 'ATOM MISSING'})`,
);
console.log(`  edge     ${edge?.tripleId}  ${edge?.tripleExists ? 'exists' : 'TO CREATE'}\n`);

const serialise = (calls: readonly PreparedCall[]): SerialisedCall[] =>
  calls.map((call) => ({ ...call, value: call.value.toString() }));
async function send(label: string, calls: readonly PreparedCall[]) {
  if (calls.length === 0) {
    console.log('  nothing to do — already on chain.');
    return true;
  }
  for (const call of calls) {
    console.log(
      `  ${call.kind.padEnd(14)} ${formatEther(call.value).padStart(14)}` +
        `${call.preview === undefined ? '' : `  ${call.preview.shares} shares`}  ${call.why}`,
    );
  }
  const outcome = await sendPlan({
    calls: serialise(calls),
    chainId,
    // Narrowed by the `if (!rpcUrl || …) process.exit(1)` guard above; the annotation on the
    // declaration re-widens it, so the assertion restates what the guard proved.
    rpcUrl: rpcUrl as string,
    keyName: 'PRIVATE_KEY',
    execute,
    onCall: (i, _c, hash, status, gas) =>
      console.log(`    ${String(i + 1).padStart(2)}. ${status.padEnd(8)} ${hash}  gas ${gas}`),
  });
  if (outcome.status === 'refused') {
    console.error(`\n  REFUSED — ${outcome.reason}.`);
    return false;
  }
  if (outcome.status === 'dry-run') {
    console.log(`  would spend ${formatEther(outcome.total)} on ${label}.`);
    return true;
  }
  if (outcome.status === 'reverted') {
    console.error('\n  a call reverted.');
    return false;
  }
  console.log(`  spent ${formatEther(outcome.total)} on ${label}.`);
  return true;
}
if (!(await send('the declaration', declarePlan.calls))) process.exit(3);

const stakeAmount = arg('stake');
if (stakeAmount !== undefined && edge !== undefined && (edge.tripleExists || execute)) {
  const stakePlan = await prepareStakeOnUsed({
    targets: [{ tripleId: edge.tripleId, amount: parseEther(stakeAmount) }],
    receiver: hirerAccount.address,
    reads,
  });
  console.log('');
  if (!(await send('the stake', stakePlan.calls))) process.exit(3);
} else if (stakeAmount !== undefined) {
  console.log(
    '\n  stake skipped — the edge is not on chain yet. Declaring and staking are two txs.',
  );
}

// ── 5 ────────────────────────────────────────────────────────────────────────
step(5, 'What a stranger can now read about the hired agent');
if (edge !== undefined) {
  // The indexer lags the chain. Without this the walk reports 0 positions seconds after a
  // successful deposit, which reads as a failed stake and is a timing property — the same thing
  // caught `demo-adopt.ts` on its first real run.
  let usage = await getToolUsage(edge.atomId, { graphqlUrl, curveId: 1 });
  for (
    let attempt = 1;
    execute && attempt <= 6 && usage.totals.supportPositions === 0;
    attempt += 1
  ) {
    console.log(`  waiting for the indexer… (${attempt}/6)`);
    await new Promise((resolve) => setTimeout(resolve, 5_000));
    usage = await getToolUsage(edge.atomId, { graphqlUrl, curveId: 1 });
  }
  console.log(`  ${usage.label ?? edge.atomId}`);
  console.log(
    `  ${usage.edges.length} incoming edge(s), ${usage.totals.supportPositions} position(s)`,
  );
  console.log(
    `  ${formatEther(usage.totals.supportAssets)} TRUST behind, ${formatEther(usage.totals.opposeAssets)} against`,
  );
  for (const e of usage.edges) {
    console.log(
      `    ${e.agent.label ?? e.agent.atomId} — ${formatEther(e.support.totalAssets ?? 0n)} TRUST, ${e.support.positionCount ?? 0} pos`,
    );
  }
}
console.log(
  execute
    ? '\nThe hire completed, and the rating is anchored to a payment the agent verified.'
    : '\nDry run — nothing was paid, nothing was signed.',
);
