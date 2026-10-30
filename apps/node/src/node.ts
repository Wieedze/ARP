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
 */
import { createPublicClient, formatEther, http, keccak256, parseEther, toHex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import type { Address, Hex } from 'viem';

const PORT = Number(process.env.AGENT_NODE_PORT ?? 3100);
const MIN_BUDGET = parseEther(process.env.AGENT_NODE_MIN_BUDGET ?? '0.001');

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
const publicClient = createPublicClient({ transport: http(rpcUrl) });

/** What the operator's handler receives. Everything the node verified, nothing it assumed. */
export type TaskContext = {
  requester: Address;
  /** Native value the requester actually moved, verified on chain. */
  paid: bigint;
  paymentTxHash: Hex;
  agent: Address;
};
export type TaskHandler = (payload: unknown, context: TaskContext) => Promise<unknown>;

const echo: TaskHandler = async (payload, context) => ({
  echoed: payload,
  note:
    'No handler configured, so this node proves the protocol and nothing about the agent. Set ' +
    'ARP_NODE_HANDLER to a module exporting `handle(payload, context)`.',
  paidWei: context.paid.toString(),
});

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

type TaskBody = { paymentTxHash?: Hex; requesterAddress?: Address; payload?: unknown };

function json(value: unknown, status = 200): Response {
  return new Response(
    JSON.stringify(
      value,
      (_key, inner) => (typeof inner === 'bigint' ? inner.toString() : inner),
      2,
    ),
    { status, headers: { 'content-type': 'application/json' } },
  );
}

/**
 * The four checks, in order, before any work happens.
 *
 * Every one of them failed somewhere in this project's history or in a review of it: a tx that does
 * not exist, a payment to a different address than the runtime holds, a payment below the floor, and
 * a requester claiming someone else's payment. The last is the one that matters most — without it a
 * caller could point at any payment on the chain and claim its credit.
 */
async function verifyPayment(body: TaskBody): Promise<TaskContext | { error: string }> {
  if (!body.paymentTxHash || !body.requesterAddress) {
    return { error: 'paymentTxHash and requesterAddress are required' };
  }
  const tx = await publicClient.getTransaction({ hash: body.paymentTxHash }).catch(() => null);
  if (tx === null) return { error: `payment tx ${body.paymentTxHash} not found` };
  if (!tx.to || tx.to.toLowerCase() !== account.address.toLowerCase()) {
    return { error: `payment recipient ${tx.to ?? 'none'} is not this agent ${account.address}` };
  }
  if (tx.value < MIN_BUDGET) {
    return {
      error: `payment ${formatEther(tx.value)} is below this agent's minimum ${formatEther(MIN_BUDGET)}`,
    };
  }
  if (tx.from.toLowerCase() !== body.requesterAddress.toLowerCase()) {
    return { error: `payment came from ${tx.from}, not from the declared requester` };
  }
  return {
    requester: body.requesterAddress,
    paid: tx.value,
    paymentTxHash: body.paymentTxHash,
    agent: account.address,
  };
}

/**
 * The receipt binds **this** request to **this** result.
 *
 * `requestHash` covers the requester, the payment and the payload; `resultHash` covers the output.
 * Signing their concatenation means a receipt cannot be lifted onto another request or another
 * answer — which is what a caller needs before paying to stand behind a claim about this agent.
 */
function digest(value: unknown): Hex {
  return keccak256(
    toHex(JSON.stringify(value, (_k, v) => (typeof v === 'bigint' ? v.toString() : v))),
  );
}

export const handler = {
  port: PORT,
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === 'GET' && url.pathname === '/healthz') {
      return json({ ok: true, agent: account.address, minBudgetWei: MIN_BUDGET.toString() });
    }

    if (request.method === 'GET' && url.pathname === '/') {
      // Not part of any protocol. The verifier's non-protocol probe sends a plain GET, and
      // answering it makes this endpoint `live` rather than `dead` for that path too.
      return json({
        agent: account.address,
        endpoints: [{ path: '/task', method: 'POST', description: 'hire this agent' }],
        minBudgetWei: MIN_BUDGET.toString(),
        handler: handlerPath ?? null,
      });
    }

    if (request.method !== 'POST' || url.pathname !== '/task') {
      return json({ error: 'POST /task, or GET /healthz' }, 404);
    }

    let body: TaskBody;
    try {
      body = (await request.json()) as TaskBody;
    } catch {
      return json({ error: 'body is not JSON' }, 400);
    }

    const verified = await verifyPayment(body);
    if ('error' in verified) return json(verified, 402);

    let result: unknown;
    try {
      result = await handle(body.payload, verified);
    } catch (error) {
      // The message, not a stack: enough for the caller to retry or report, nothing about the host.
      return json({ error: `handler failed: ${String(error).slice(0, 300)}` }, 500);
    }

    const requestHash = digest({
      requester: verified.requester,
      paymentTxHash: verified.paymentTxHash,
      paid: verified.paid.toString(),
      payload: body.payload ?? null,
    });
    const resultHash = digest(result ?? null);
    const signature = await account.signMessage({
      message: { raw: keccak256(`${requestHash}${resultHash.slice(2)}` as Hex) },
    });

    return json({
      result,
      receipt: { agent: account.address, requestHash, resultHash, signature },
    });
  },
};

if (import.meta.main) {
  Bun.serve(handler);
  process.stderr.write(`agent node on http://localhost:${PORT}\n`);
  process.stderr.write(`  agent      ${account.address}\n`);
  process.stderr.write(`  min budget ${formatEther(MIN_BUDGET)}\n`);
  process.stderr.write(`  handler    ${handlerPath ?? 'echo (no handler configured)'}\n`);
  process.stderr.write(`\nIt signs receipts and never transactions.\n`);
}
