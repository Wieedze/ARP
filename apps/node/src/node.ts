/** The inbound half of the node — what makes an agent reachable, and the receipt that lets the
 *  caller rate it afterwards.
 *
 *      AGENT_NODE_PORT=3100 bun run apps/node/src/node.ts
 *      curl -s localhost:3100/healthz
 *
 *  **Why it exists.** Declaring and staking are things an agent does *outward*: it calls, nothing
 *  needs to reach it. Being hired is the other direction, and for that something has to listen at an
 *  address the agent publishes in its ERC-8004 registration file. ARP can verify such an endpoint —
 *  that is the verifier — and cannot provide one. This is the code an operator runs so that theirs
 *  exists (ADR `0045`).
 *
 *  **It signs receipts and never transactions.** The agent key is here because a receipt must be
 *  signed by the agent, and a signature is not a spend. There is no send path in this file: no
 *  `sendTransaction`, no `writeContract`, no deposit. A caller who wants the agent to stake gets a
 *  prepared plan from the connector and the agent's own runtime signs it (ADR `0038`).
 *
 *  **The payment is the point of the payment.** A free request proves nothing and a rating of a free
 *  request is worth what a star is worth. So the node checks, before doing any work, that a real
 *  transaction moved real value from the declared requester to this agent. That check is what turns
 *  the caller's later `(requester, uses, agent)` declaration from an opinion into something anchored
 *  to a fact — `docs/14:159`'s top rung is "payment, on-chain call, or delegation redemption".
 *
 *  **The work is the operator's.** `ARP_NODE_HANDLER` points at a module exporting
 *  `handle(payload, context)`. Without one the node echoes, which is enough to prove the protocol
 *  and proves nothing about an agent.
 *
 *  **One payment, one job.** Every accepted payment is appended to `AGENT_NODE_LEDGER`
 *  (`.arp/node-payments.jsonl` by default) and refused the second time — `task.ts`.
 */
import { join } from 'node:path';

import { createPublicClient, formatEther, http, parseEther } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import type { Hex } from 'viem';

import { createNode, echo, PaymentLedger, type TaskHandler } from './task.ts';

export type { TaskContext, TaskHandler } from './task.ts';

const PORT = Number(process.env.AGENT_NODE_PORT ?? 3100);
const MIN_BUDGET = parseEther(process.env.AGENT_NODE_MIN_BUDGET ?? '0.001');
const LEDGER = process.env.AGENT_NODE_LEDGER ?? join(process.cwd(), '.arp', 'node-payments.jsonl');

const rpcUrl = process.env.INTUITION_RPC_URL ?? process.env.INTUITION_TESTNET_RPC_URL;
if (!rpcUrl) {
  console.error('no RPC: set INTUITION_RPC_URL or INTUITION_TESTNET_RPC_URL');
  process.exit(1);
}
const rawKey = process.env.AGENT_PRIVATE_KEY;
if (!rawKey) {
  console.error('AGENT_PRIVATE_KEY is not set — the node signs receipts with the agent identity.');
  process.exit(1);
}
const account = privateKeyToAccount((rawKey.startsWith('0x') ? rawKey : `0x${rawKey}`) as Hex);

const handlerPath = process.env.ARP_NODE_HANDLER;
let handle: TaskHandler = echo;
if (handlerPath !== undefined) {
  const module = (await import(handlerPath)) as { handle?: TaskHandler };
  if (typeof module.handle !== 'function') {
    console.error(`${handlerPath} does not export a \`handle\` function`);
    process.exit(1);
  }
  handle = module.handle;
}

const node = createNode({
  account,
  publicClient: createPublicClient({ transport: http(rpcUrl) }),
  minBudget: MIN_BUDGET,
  handle,
  handlerPath: handlerPath ?? null,
  ledger: new PaymentLedger(LEDGER),
});

export const handler = { port: PORT, fetch: node.fetch };

if (import.meta.main) {
  Bun.serve(handler);
  process.stderr.write(`agent node on http://localhost:${PORT}\n`);
  process.stderr.write(`  agent      ${account.address}\n`);
  process.stderr.write(`  min budget ${formatEther(MIN_BUDGET)}\n`);
  process.stderr.write(`  handler    ${handlerPath ?? 'echo (no handler configured)'}\n`);
  process.stderr.write(`  ledger     ${LEDGER}\n`);
  process.stderr.write(`\nIt signs receipts and never transactions.\n`);
}
