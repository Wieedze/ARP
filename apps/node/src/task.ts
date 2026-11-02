/** What the node does with a request, separated from where it reads its configuration.
 *
 *  `node.ts` reads the environment and listens; this file is the part a test can construct — the
 *  limits, the payment check, the ledger of payments already spent, and the receipt.
 */
import { existsSync, appendFileSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';

import {
  HIRE_RECEIPT_VERSION,
  hireDigest,
  signHireReceipt,
  type HireReceipt,
  type SignedHireReceipt,
} from '@arp-protocol/core';
import { type X402Gate, x402PaymentKey } from '@arp-protocol/core/x402';
import { formatEther, getAddress, isAddress } from 'viem';
import type { Address, Hex, LocalAccount, PublicClient } from 'viem';

/**
 * What the operator's handler receives. Everything the node verified, nothing it assumed.
 *
 * Two rails since task 41b, and `rail` says which. **`native`**: `paid` is wei the requester moved
 * in `paymentTxHash`, mined before the handler runs. **`x402`**: `paid` is USDC atomic units (6
 * decimals) the requester signed an authorisation for, verified by the facilitator but **settled
 * only after the handler answers**, so `paymentTxHash` is `null` while the handler runs.
 */
export type TaskContext = {
  rail: 'native' | 'x402';
  requester: Address;
  paid: bigint;
  paymentTxHash: Hex | null;
  agent: Address;
};
export type TaskHandler = (payload: unknown, context: TaskContext) => Promise<unknown>;

export const echo: TaskHandler = async (payload, context) => ({
  echoed: payload,
  note:
    'No handler configured, so this node proves the protocol and nothing about the agent. Set ' +
    'ARP_NODE_HANDLER to a module exporting `handle(payload, context)`.',
  rail: context.rail,
  // In the rail's own unit: wei on `native`, USDC atomic units on `x402`.
  paid: context.paid.toString(),
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

/**
 * The agent as ERC-8004 names it: `eip155:<chainId>:<identityRegistry>` plus the token id.
 *
 * The registry's chain is written out rather than taken from the payment's, because the two need
 * not coincide — on mainnet the identity is on Base 8453 and the staking on 1155
 * (`.claude/rules/portability.md` point 2).
 */
export type AgentIdentity = { agentRegistry: string; agentId: bigint };

/**
 * How much an unpaid stranger can make the node do. Every `POST /task` costs two RPC reads before
 * the node knows whether it was paid, so a flood of invented hashes is a bill for the operator.
 */
export type NodeLimits = {
  /** Largest body accepted, in bytes. `serveFetch` enforces it as well, before the body is read whole; this is the same number. */
  maxBodyBytes: number;
  /** A handler that has not answered by then is a 504, and the payment is released. */
  handlerTimeoutMs: number;
  /** `POST /task` requests per client per minute, paid or not. */
  requestsPerMinute: number;
  /** Seconds a receipt stays usable after it is issued: its signed `expiresAt` is `issuedAt` plus this. */
  receiptTtlSeconds: number;
};

export const DEFAULT_LIMITS: NodeLimits = {
  maxBodyBytes: 64 * 1024,
  handlerTimeoutMs: 60_000,
  requestsPerMinute: 30,
  receiptTtlSeconds: 86_400,
};

export type NodeOptions = {
  account: LocalAccount;
  publicClient: Pick<PublicClient, 'getTransaction' | 'getTransactionReceipt'>;
  /** The chain payments are read on — the receipt's EIP-712 domain. */
  chainId: number;
  identity: AgentIdentity | null;
  minBudget: bigint;
  handle: TaskHandler;
  handlerPath: string | null;
  ledger: PaymentLedger;
  /**
   * The x402 rail, beside the native one and not in place of it (task 41b). `null` or absent: the
   * node takes native payments only, as before. Built by `createX402Gate` with `POST /task` priced.
   */
  x402?: X402Gate | null;
  limits?: Partial<NodeLimits>;
  /** Milliseconds. Injected so a test can move the rate-limit window. */
  now?: () => number;
};

/** The route label the x402 rail counts paid hires under. */
export const X402_TASK_ROUTE = 'POST /task';

/**
 * `verifier` and `termId` are what the v2 receipt names (task 44): the one verifier the requester
 * will present it to — `ReceiptEnforcer`'s address, or the sponsoring service's `receiptVerifier` —
 * and the term it will deposit on. The node signs what it is asked; it is the verifier that refuses
 * a receipt naming someone else.
 */
type TaskBody = {
  paymentTxHash?: unknown;
  requesterAddress?: unknown;
  verifier?: unknown;
  termId?: unknown;
  payload?: unknown;
};

const TX_HASH = /^0x[0-9a-fA-F]{64}$/;
const RATE_WINDOW_MS = 60_000;
/** Past this many distinct clients the expired windows are swept, so the map cannot grow forever. */
const RATE_SWEEP_AT = 10_000;

function bigintSafe(_key: string, inner: unknown): unknown {
  return typeof inner === 'bigint' ? inner.toString() : inner;
}

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value, bigintSafe, 2), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

class Timeout extends Error {}

type SignedHireReceiptOrError = { signed: SignedHireReceipt } | { error: Response };

function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expiry = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Timeout()), ms);
  });
  return Promise.race([work, expiry]).finally(() => clearTimeout(timer));
}

export function createNode(options: NodeOptions): {
  fetch(request: Request, client?: string): Promise<Response>;
} {
  const { account, publicClient, chainId, identity, minBudget, handle, handlerPath, ledger } =
    options;
  const limits: NodeLimits = { ...DEFAULT_LIMITS, ...options.limits };
  const now = options.now ?? Date.now;
  const x402 = options.x402 ?? null;
  const windows = new Map<string, { start: number; count: number }>();

  /** A fixed one-minute window per client. Crude, and enough to make a flood cost its sender. */
  function overLimit(client: string): boolean {
    const at = now();
    if (windows.size > RATE_SWEEP_AT) {
      for (const [key, window] of windows) {
        if (at - window.start >= RATE_WINDOW_MS) windows.delete(key);
      }
    }
    const window = windows.get(client);
    if (window === undefined || at - window.start >= RATE_WINDOW_MS) {
      windows.set(client, { start: at, count: 1 });
      return false;
    }
    window.count += 1;
    return window.count > limits.requestsPerMinute;
  }

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
  async function verifyPayment(
    hash: Hex,
    requester: Address,
  ): Promise<TaskContext | { error: string }> {
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
    if (tx.from.toLowerCase() !== requester.toLowerCase()) {
      return { error: `payment came from ${tx.from}, not from the declared requester` };
    }
    return { rail: 'native', requester, paid: tx.value, paymentTxHash: hash, agent: account.address };
  }

  type Job =
    | { ok: true; result: unknown; requestHash: Hex; resultHash: Hex }
    | { ok: false; response: Response };

  /** The operator's handler, bounded by the timeout, with what goes into the receipt. Releases the claim on failure. */
  async function runJob(payload: unknown, context: TaskContext, claim: Hex): Promise<Job> {
    try {
      const answer = await withTimeout(handle(payload, context), limits.handlerTimeoutMs);
      // The result as it will cross the wire, so the requester hashes exactly what it receives.
      const result = JSON.parse(JSON.stringify(answer ?? null, bigintSafe)) as unknown;
      return { ok: true, result, requestHash: hireDigest(payload ?? null), resultHash: hireDigest(result) };
    } catch (error) {
      ledger.release(claim);
      if (error instanceof Timeout) {
        return {
          ok: false,
          response: json({ error: `handler did not answer within ${limits.handlerTimeoutMs} ms` }, 504),
        };
      }
      // The message, not a stack: enough for the caller to retry or report, nothing about the host.
      return { ok: false, response: json({ error: `handler failed: ${String(error).slice(0, 300)}` }, 500) };
    }
  }

  /**
   * Record the payment, then sign. No receipt without a record: a receipt the ledger forgot is a
   * payment the next restart would accept again.
   */
  async function receiptFor(input: {
    claim: Hex;
    record: Record<string, string>;
    requester: Address;
    payment: Hex;
    paid: bigint;
    paymentChainId: number;
    job: { requestHash: Hex; resultHash: Hex };
    verifier: Address;
    termId: Hex;
  }): Promise<SignedHireReceiptOrError> {
    const issuedAt = Math.floor(now() / 1000);
    const receipt: HireReceipt = {
      version: HIRE_RECEIPT_VERSION,
      agentRegistry: identity?.agentRegistry ?? '',
      agentId: (identity?.agentId ?? 0n).toString(),
      requester: input.requester,
      payment: input.payment,
      paid: input.paid.toString(),
      requestHash: input.job.requestHash,
      resultHash: input.job.resultHash,
      issuedAt,
      termId: input.termId,
      expiresAt: issuedAt + limits.receiptTtlSeconds,
    };
    try {
      ledger.commit(input.claim, {
        ...input.record,
        requester: input.requester,
        requestHash: input.job.requestHash,
        at: new Date(now()).toISOString(),
      });
    } catch (error) {
      ledger.release(input.claim);
      return { error: json({ error: `could not record the payment: ${String(error).slice(0, 300)}` }, 500) };
    }
    return {
      signed: await signHireReceipt(
        receipt,
        { chainId: input.paymentChainId, verifyingContract: input.verifier },
        { address: account.address, signTypedData: (data) => account.signTypedData(data) },
      ),
    };
  }

  /**
   * The x402 rail (task 41b). The requester sends `PAYMENT-SIGNATURE`, a USDC authorisation it
   * signed; the facilitator verifies it, the handler runs, and only then is it settled. The
   * settlement's transaction is the receipt's `payment`, and its chain — Base Sepolia, 84532 — is
   * the receipt's domain chain, so the receipt says truthfully where the payment is. A verifier
   * that prices a proof on the deposit chain only (ADR `0096` item 1) refuses it, and that refusal
   * is correct rather than a gap: a USDC payment on 84532 is not in the unit of a deposit on 13579.
   *
   * **The ledger keys on the signed authorisation**, hashed, rather than on a transaction that does
   * not exist yet. One authorisation buys one job, and a replay is refused before the facilitator is
   * asked anything. The settlement transaction is written in the same row.
   */
  async function x402Task(
    gate: X402Gate,
    request: Request,
    body: TaskBody,
    verifier: Address,
    termId: Hex,
  ): Promise<Response> {
    // A replay is refused before the facilitator is asked anything, as the native rail refuses one
    // before its RPC reads.
    const early = x402PaymentKey(request);
    const spent = () => json({ error: 'this payment authorisation was already used for a job' }, 409);
    if (early !== null && ledger.isSpent(early)) return spent();

    const verdict = await gate.check(request, X402_TASK_ROUTE);
    if (verdict.kind === 'refused') return verdict.response;
    if (verdict.kind === 'free') {
      // `POST /task` is the gate's priced route, so this is a gate built for other routes.
      return json({ error: 'this node prices no POST /task on x402' }, 500);
    }
    if (verdict.payer === null || !isAddress(verdict.payer)) {
      return json({ error: 'this node accepts an EIP-3009 authorisation, which names its payer' }, 402);
    }
    const payer = getAddress(verdict.payer);
    const declared = body.requesterAddress;
    if (declared !== undefined && (typeof declared !== 'string' || declared.toLowerCase() !== payer.toLowerCase())) {
      return json({ error: `the authorisation is signed by ${payer}, not by the declared requester` }, 402);
    }

    if (!ledger.claim(verdict.key)) return spent();

    const job = await runJob(
      body.payload,
      { rail: 'x402', requester: payer, paid: BigInt(verdict.amount), paymentTxHash: null, agent: account.address },
      verdict.key,
    );
    if (!job.ok) return job.response;

    // A facilitator that times out on settle may still have settled (`@x402/core`'s own warning). The
    // claim is released all the same: the authorisation's on-chain nonce refuses a second settle.
    const settlement = await verdict.settle().catch((error: unknown) => ({
      ok: false as const,
      response: json({ error: `settlement failed: ${String(error).slice(0, 300)}` }, 502),
    }));
    if (!settlement.ok) {
      ledger.release(verdict.key);
      return settlement.response;
    }
    const { transaction, network, amount } = settlement.call;
    const paymentChainId = Number(/^eip155:([1-9][0-9]*)$/.exec(network)?.[1] ?? Number.NaN);
    if (!TX_HASH.test(transaction) || !Number.isSafeInteger(paymentChainId)) {
      // Settled, so the requester paid: the row is kept, and the answer says what is missing.
      ledger.commit(verdict.key, { rail: 'x402', transaction, network });
      return json({ error: `settled as ${transaction} on ${network}, which a hire receipt cannot name` }, 502);
    }

    const answer = await receiptFor({
      claim: verdict.key,
      record: { rail: 'x402', transaction, network },
      requester: payer,
      payment: transaction as Hex, // TX_HASH above is the 0x + 64 hex check `Hex` stands for.
      paid: BigInt(amount),
      paymentChainId,
      job,
      verifier,
      termId,
    });
    if ('error' in answer) return answer.error;
    const response = json({ result: job.result, receipt: answer.signed });
    for (const [name, value] of Object.entries(settlement.headers)) response.headers.set(name, value);
    return response;
  }

  async function readBody(request: Request): Promise<TaskBody | Response> {
    const declared = Number(request.headers.get('content-length') ?? '0');
    if (declared > limits.maxBodyBytes) {
      return json({ error: `body over ${limits.maxBodyBytes} bytes` }, 413);
    }
    const text = await request.text();
    if (new TextEncoder().encode(text).byteLength > limits.maxBodyBytes) {
      return json({ error: `body over ${limits.maxBodyBytes} bytes` }, 413);
    }
    try {
      const parsed: unknown = JSON.parse(text);
      if (typeof parsed !== 'object' || parsed === null) {
        return json({ error: 'body is not a JSON object' }, 400);
      }
      return parsed as TaskBody;
    } catch {
      return json({ error: 'body is not JSON' }, 400);
    }
  }

  /** What a caller reads before paying: the native floor and, when the rail is on, the x402 terms. */
  function prices() {
    return { minBudgetWei: minBudget.toString(), x402: x402?.terms ?? null };
  }

  return {
    async fetch(request: Request, client = 'unknown'): Promise<Response> {
      const url = new URL(request.url);

      if (request.method === 'GET' && url.pathname === '/healthz') {
        return json({ ok: true, agent: account.address, ...prices() });
      }

      if (request.method === 'GET' && url.pathname === '/') {
        // Not part of any protocol. The verifier's non-protocol probe sends a plain GET, and
        // answering it makes this endpoint `live` rather than `dead` for that path too.
        return json({
          agent: account.address,
          endpoints: [{ path: '/task', method: 'POST', description: 'hire this agent' }],
          ...prices(),
          handler: handlerPath,
        });
      }

      if (request.method !== 'POST' || url.pathname !== '/task') {
        return json({ error: 'POST /task, or GET /healthz' }, 404);
      }

      if (overLimit(client)) {
        return json({ error: `more than ${limits.requestsPerMinute} requests a minute` }, 429);
      }

      const body = await readBody(request);
      if (body instanceof Response) return body;

      // Shape before the chain: a malformed hash or address would cost two RPC reads to refuse.
      const { verifier, termId } = body;
      if (typeof verifier !== 'string' || !isAddress(verifier)) {
        return json(
          { error: 'verifier must be the address the receipt is for (an enforcer or a service)' },
          400,
        );
      }
      if (typeof termId !== 'string' || !TX_HASH.test(termId)) {
        return json(
          { error: 'termId must be the 32-byte term the requester will deposit on' },
          400,
        );
      }
      const term = termId as Hex; // The 0x + 64 hex check above is what `Hex` stands for.

      // No native payment named, and the x402 rail is on: that rail answers, with a 402 carrying
      // the requirements when nothing is paid yet. A body that names a payment keeps the native rail.
      if (x402 !== null && body.paymentTxHash === undefined) {
        return x402Task(x402, request, body, verifier, term);
      }

      const { paymentTxHash: hash, requesterAddress: requester } = body;
      if (typeof hash !== 'string' || !TX_HASH.test(hash)) {
        return json({ error: 'paymentTxHash must be a 32-byte 0x-prefixed hex hash' }, 400);
      }
      if (typeof requester !== 'string' || !isAddress(requester)) {
        return json({ error: 'requesterAddress must be an address' }, 400);
      }
      const payment = hash as Hex; // The regex above is the 0x + 64 hex check `Hex` stands for.

      const spentError = () =>
        json({ error: `payment tx ${payment} was already used for a job` }, 409);
      // Checked before the RPC calls as well as after, so a replay costs the node nothing.
      if (ledger.isSpent(payment)) return spentError();

      const verified = await verifyPayment(payment, requester);
      if ('error' in verified) return json(verified, 402);
      if (!ledger.claim(payment)) return spentError();

      const job = await runJob(body.payload, verified, payment);
      if (!job.ok) return job.response;

      const answer = await receiptFor({
        claim: payment,
        record: {},
        requester: verified.requester,
        payment,
        paid: verified.paid,
        paymentChainId: chainId,
        job,
        verifier,
        termId: term,
      });
      if ('error' in answer) return answer.error;
      return json({ result: job.result, receipt: answer.signed });
    },
  };
}
