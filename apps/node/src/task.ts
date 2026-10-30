/** What the node does with a request, separated from where it reads its configuration.
 *
 *  `node.ts` reads the environment and listens; this file is the part a test can construct — the
 *  payment check, the ledger of payments already spent, and the receipt.
 */
import { existsSync, appendFileSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';

import { formatEther, keccak256, toHex } from 'viem';
import type { Address, Hex, LocalAccount, PublicClient } from 'viem';

/** What the operator's handler receives. Everything the node verified, nothing it assumed. */
export type TaskContext = {
  requester: Address;
  /** Native value the requester actually moved, verified on chain. */
  paid: bigint;
  paymentTxHash: Hex;
  agent: Address;
};
export type TaskHandler = (payload: unknown, context: TaskContext) => Promise<unknown>;

export const echo: TaskHandler = async (payload, context) => ({
  echoed: payload,
  note:
    'No handler configured, so this node proves the protocol and nothing about the agent. Set ' +
    'ARP_NODE_HANDLER to a module exporting `handle(payload, context)`.',
  paidWei: context.paid.toString(),
});

/**
 * Payments this node has already been paid with, so one payment buys one job.
 *
 * Until 2026-10-30 the node kept no such record: a requester could present the same transaction
 * any number of times and collect a signed receipt for each, which made "a payment the agent
 * verified" worth one payment's credit times however many requests the caller cared to send.
 *
 * **On disk, appended, read once at start.** A record in memory alone is reset by a restart, and a
 * restart is the cheapest thing an attacker can wait for. A hash is `claim`ed synchronously before
 * the handler runs — two concurrent requests with one payment cannot both pass — then `commit`ted
 * to the file once the work is done, or `release`d if the handler failed, so a requester whose job
 * never ran can retry with the payment they made.
 */
export class PaymentLedger {
  private readonly spent = new Set<string>();
  private readonly pending = new Set<string>();

  constructor(private readonly path: string | null) {
    if (path === null || !existsSync(path)) return;
    for (const line of readFileSync(path, 'utf8').split('\n')) {
      if (line.trim().length === 0) continue;
      try {
        const row = JSON.parse(line) as { paymentTxHash?: unknown };
        if (typeof row.paymentTxHash === 'string') this.spent.add(row.paymentTxHash.toLowerCase());
      } catch {
        // A half-written last line from a crash. The job it recorded never returned a receipt.
        continue;
      }
    }
  }

  isSpent(hash: Hex): boolean {
    const key = hash.toLowerCase();
    return this.spent.has(key) || this.pending.has(key);
  }

  claim(hash: Hex): boolean {
    if (this.isSpent(hash)) return false;
    this.pending.add(hash.toLowerCase());
    return true;
  }

  release(hash: Hex): void {
    this.pending.delete(hash.toLowerCase());
  }

  commit(hash: Hex, record: Record<string, string>): void {
    const key = hash.toLowerCase();
    if (this.path !== null) {
      mkdirSync(dirname(this.path), { recursive: true });
      appendFileSync(this.path, `${JSON.stringify({ paymentTxHash: key, ...record })}\n`);
    }
    this.pending.delete(key);
    this.spent.add(key);
  }
}

export type NodeOptions = {
  account: LocalAccount;
  publicClient: Pick<PublicClient, 'getTransaction' | 'getTransactionReceipt'>;
  minBudget: bigint;
  handle: TaskHandler;
  handlerPath: string | null;
  ledger: PaymentLedger;
};

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
 * The receipt binds **this** request to **this** result.
 *
 * `requestHash` covers the requester, the payment and the payload; `resultHash` covers the output.
 * Signing their concatenation means a receipt cannot be lifted onto another request or another
 * answer — which is what a caller needs before paying to stand behind a claim about this agent.
 */
export function digest(value: unknown): Hex {
  return keccak256(
    toHex(JSON.stringify(value, (_k, v) => (typeof v === 'bigint' ? v.toString() : v))),
  );
}

export function createNode(options: NodeOptions): { fetch(request: Request): Promise<Response> } {
  const { account, publicClient, minBudget, handle, handlerPath, ledger } = options;

  /**
   * The checks, in order, before any work happens.
   *
   * Every one of them failed somewhere in this project's history or in a review of it: a tx that
   * does not exist, a payment to a different address than the runtime holds, a payment below the
   * floor, and a requester claiming someone else's payment. The last is the one that matters most —
   * without it a caller could point at any payment on the chain and claim its credit.
   *
   * **Mined and successful**, added 2026-10-30: `getTransaction` also answers for a transaction
   * still in the mempool, which can be replaced before it lands, and for one that reverted, whose
   * `value` field is still set although nothing moved.
   */
  async function verifyPayment(body: TaskBody): Promise<TaskContext | { error: string }> {
    if (!body.paymentTxHash || !body.requesterAddress) {
      return { error: 'paymentTxHash and requesterAddress are required' };
    }
    const hash = body.paymentTxHash;
    const tx = await publicClient.getTransaction({ hash }).catch(() => null);
    if (tx === null) return { error: `payment tx ${hash} not found` };
    const receipt = await publicClient.getTransactionReceipt({ hash }).catch(() => null);
    if (receipt === null) return { error: `payment tx ${hash} is not mined yet` };
    if (receipt.status !== 'success') return { error: `payment tx ${hash} reverted` };
    if (!tx.to || tx.to.toLowerCase() !== account.address.toLowerCase()) {
      return { error: `payment recipient ${tx.to ?? 'none'} is not this agent ${account.address}` };
    }
    if (tx.value < minBudget) {
      return {
        error: `payment ${formatEther(tx.value)} is below this agent's minimum ${formatEther(minBudget)}`,
      };
    }
    if (tx.from.toLowerCase() !== body.requesterAddress.toLowerCase()) {
      return { error: `payment came from ${tx.from}, not from the declared requester` };
    }
    return {
      requester: body.requesterAddress,
      paid: tx.value,
      paymentTxHash: hash,
      agent: account.address,
    };
  }

  return {
    async fetch(request: Request): Promise<Response> {
      const url = new URL(request.url);

      if (request.method === 'GET' && url.pathname === '/healthz') {
        return json({ ok: true, agent: account.address, minBudgetWei: minBudget.toString() });
      }

      if (request.method === 'GET' && url.pathname === '/') {
        // Not part of any protocol. The verifier's non-protocol probe sends a plain GET, and
        // answering it makes this endpoint `live` rather than `dead` for that path too.
        return json({
          agent: account.address,
          endpoints: [{ path: '/task', method: 'POST', description: 'hire this agent' }],
          minBudgetWei: minBudget.toString(),
          handler: handlerPath,
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

      const spentError = (hash: Hex) =>
        json({ error: `payment tx ${hash} was already used for a job` }, 409);
      // Checked before the RPC calls as well as after, so a replay costs the node nothing.
      if (body.paymentTxHash && ledger.isSpent(body.paymentTxHash))
        return spentError(body.paymentTxHash);

      const verified = await verifyPayment(body);
      if ('error' in verified) return json(verified, 402);
      if (!ledger.claim(verified.paymentTxHash)) return spentError(verified.paymentTxHash);

      let result: unknown;
      try {
        result = await handle(body.payload, verified);
      } catch (error) {
        ledger.release(verified.paymentTxHash);
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

      try {
        ledger.commit(verified.paymentTxHash, {
          requester: verified.requester,
          requestHash,
          at: new Date().toISOString(),
        });
      } catch (error) {
        // No receipt without a record: a receipt the ledger forgot is a payment the next restart
        // would accept again.
        ledger.release(verified.paymentTxHash);
        return json({ error: `could not record the payment: ${String(error).slice(0, 300)}` }, 500);
      }

      const signature = await account.signMessage({
        message: { raw: keccak256(`${requestHash}${resultHash.slice(2)}` as Hex) },
      });

      return json({
        result,
        receipt: { agent: account.address, requestHash, resultHash, signature },
      });
    },
  };
}
