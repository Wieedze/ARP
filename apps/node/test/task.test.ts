import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { parseEther } from 'viem';
import type { Address, Hex } from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';

import {
  hireReceiptIsFor,
  hireReceiptMatches,
  verifyHireReceipt,
  type SignedHireReceipt,
} from '@arp-protocol/core';

import { createNode, echo, type NodeLimits, PaymentLedger, readOffer, type TaskHandler, type TaskOffer } from '../src/task.ts';

const agent = privateKeyToAccount(generatePrivateKey());
const requester: Address = '0x00000000000000000000000000000000000000aa';
const MIN = parseEther('0.001');

type Tx = {
  to: Address | null;
  from: Address;
  value: bigint;
  status?: 'success' | 'reverted' | 'pending';
};

function chain(txs: Record<Hex, Tx>) {
  return {
    getTransaction: async ({ hash }: { hash: Hex }) => {
      const tx = txs[hash];
      if (tx === undefined) throw new Error('not found');
      return tx;
    },
    getTransactionReceipt: async ({ hash }: { hash: Hex }) => {
      const tx = txs[hash];
      if (tx === undefined || tx.status === 'pending') throw new Error('not mined');
      return { status: tx.status ?? 'success' };
    },
  };
}

const REGISTRY = 'eip155:13579:0xC165A2ADc0000000000000000000000000000001';
const PAID: Hex = `0x${'01'.repeat(32)}`;
const paid: Tx = { to: agent.address, from: requester, value: MIN };

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'arp-node-'));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

function node(
  txs: Record<Hex, Tx>,
  options: {
    handle?: TaskHandler;
    offer?: TaskOffer;
    ledger?: PaymentLedger;
    limits?: Partial<NodeLimits>;
    now?: () => number;
  } = {},
) {
  return createNode({
    account: agent,
    // The two methods the node calls, with the shapes it reads. The rest of viem's surface is unused.
    publicClient: chain(txs) as never,
    chainId: 13579,
    identity: { agentRegistry: REGISTRY, agentId: 2n },
    minBudget: MIN,
    limits: options.limits,
    now: options.now,
    handle: options.handle ?? echo,
    offer: options.offer ?? null,
    ledger: options.ledger ?? new PaymentLedger(join(dir, 'ledger.jsonl')),
  });
}

function task(body: unknown): Request {
  return new Request('http://node/task', { method: 'POST', body: JSON.stringify(body) });
}

const VERIFIER: Address = '0x00000000000000000000000000000000000e4f04';
const TERM: Hex = `0x${'7e'.repeat(32)}`;
const hire = {
  paymentTxHash: PAID,
  requesterAddress: requester,
  verifier: VERIFIER,
  termId: TERM,
  payload: { q: 1 },
};

describe('the payment check', () => {
  test('a valid payment gets a result and an EIP-712 receipt about this hire', async () => {
    const response = await node({ [PAID]: paid }).fetch(task(hire));
    expect(response.status).toBe(200);
    const { result, receipt } = (await response.json()) as {
      result: unknown;
      receipt: SignedHireReceipt;
    };
    expect(await verifyHireReceipt(receipt)).toEqual({ status: 'valid', signer: agent.address });
    expect(receipt.chainId).toBe(13579);
    expect(receipt.verifyingContract.toLowerCase()).toBe(VERIFIER);
    expect(receipt.receipt).toMatchObject({
      version: 2,
      termId: TERM,
      agentRegistry: REGISTRY,
      agentId: '2',
      requester,
      payment: PAID,
      paid: MIN.toString(),
    });
    // What the requester can re-derive from the JSON it sent and the JSON it got back.
    expect(hireReceiptMatches(receipt.receipt, hire.payload, result)).toBe(true);
  });

  test('the receipt is for the verifier asked for, and only that one, until its TTL', async () => {
    const at = 1_793_000_000_000;
    const response = await node(
      { [PAID]: paid },
      { now: () => at, limits: { receiptTtlSeconds: 600 } },
    ).fetch(task(hire));
    const { receipt } = (await response.json()) as { receipt: SignedHireReceipt };
    expect(receipt.receipt.issuedAt).toBe(at / 1000);
    expect(receipt.receipt.expiresAt).toBe(at / 1000 + 600);
    expect(hireReceiptIsFor(receipt, VERIFIER, at / 1000 + 600)).toEqual({ ok: true });
    expect(hireReceiptIsFor(receipt, agent.address, at / 1000).ok).toBe(false);
    expect(hireReceiptIsFor(receipt, VERIFIER, at / 1000 + 601).ok).toBe(false);
  });

  test('a result with a bigint is hashed as it crosses the wire', async () => {
    const big: TaskHandler = async () => ({ wei: 10n ** 30n });
    const response = await node({ [PAID]: paid }, { handle: big }).fetch(task(hire));
    const { result, receipt } = (await response.json()) as {
      result: unknown;
      receipt: SignedHireReceipt;
    };
    expect(result).toEqual({ wei: (10n ** 30n).toString() });
    expect(hireReceiptMatches(receipt.receipt, hire.payload, result)).toBe(true);
  });

  test.each([
    ['no tx', {}, /not found/],
    ['not mined', { [PAID]: { ...paid, status: 'pending' } }, /not mined/],
    ['reverted', { [PAID]: { ...paid, status: 'reverted' } }, /reverted/],
    ['another recipient', { [PAID]: { ...paid, to: requester } }, /is not this agent/],
    ['below the minimum', { [PAID]: { ...paid, value: MIN - 1n } }, /below/],
    [
      'someone else paid',
      { [PAID]: { ...paid, from: agent.address } },
      /not from the declared requester/,
    ],
  ] as const)('%s is refused with 402', async (_name, txs, message) => {
    const response = await node(txs as Record<Hex, Tx>).fetch(task(hire));
    expect(response.status).toBe(402);
    expect(((await response.json()) as { error: string }).error).toMatch(message);
  });
});

describe('one payment, one job', () => {
  test('the same payment presented twice is refused the second time', async () => {
    const n = node({ [PAID]: paid });
    expect((await n.fetch(task(hire))).status).toBe(200);
    const again = await n.fetch(task({ ...hire, payload: { q: 2 } }));
    expect(again.status).toBe(409);
  });

  test('case does not make a hash new', async () => {
    const n = node({ [PAID]: paid, [PAID.toUpperCase().replace('0X', '0x') as Hex]: paid });
    expect((await n.fetch(task(hire))).status).toBe(200);
    const upper = PAID.toUpperCase().replace('0X', '0x');
    expect((await n.fetch(task({ ...hire, paymentTxHash: upper }))).status).toBe(409);
  });

  test('two concurrent requests with one payment: exactly one is served', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const slow: TaskHandler = async (payload) => {
      await gate;
      return payload;
    };
    const n = node({ [PAID]: paid }, { handle: slow });
    const both = Promise.all([n.fetch(task(hire)), n.fetch(task(hire))]);
    setTimeout(release, 10);
    const statuses = (await both).map((r) => r.status).sort();
    expect(statuses).toEqual([200, 409]);
  });

  test('a restart does not forget a spent payment', async () => {
    const path = join(dir, 'ledger.jsonl');
    expect(
      (await node({ [PAID]: paid }, { ledger: new PaymentLedger(path) }).fetch(task(hire))).status,
    ).toBe(200);
    const restarted = node({ [PAID]: paid }, { ledger: new PaymentLedger(path) });
    expect((await restarted.fetch(task(hire))).status).toBe(409);
    expect(readFileSync(path, 'utf8').trim().split('\n')).toHaveLength(1);
  });

  test('a handler failure releases the payment, so the requester can retry', async () => {
    let calls = 0;
    const flaky: TaskHandler = async (payload) => {
      calls += 1;
      if (calls === 1) throw new Error('boom');
      return payload;
    };
    const n = node({ [PAID]: paid }, { handle: flaky });
    expect((await n.fetch(task(hire))).status).toBe(500);
    expect((await n.fetch(task(hire))).status).toBe(200);
    expect((await n.fetch(task(hire))).status).toBe(409);
  });

  test('a corrupt ledger line loses itself, not the ledger', async () => {
    const path = join(dir, 'ledger.jsonl');
    await Bun.write(path, `${JSON.stringify({ paymentTxHash: PAID })}\n{"paymentTx`);
    expect(new PaymentLedger(path).isSpent(PAID)).toBe(true);
  });
});

describe('what an unpaid stranger can make it do', () => {
  test('a malformed hash or address is refused before any chain read', async () => {
    let reads = 0;
    const counting = {
      getTransaction: async () => {
        reads += 1;
        throw new Error('not found');
      },
      getTransactionReceipt: async () => {
        reads += 1;
        throw new Error('not found');
      },
    };
    const n = createNode({
      account: agent,
      publicClient: counting as never, // Only the two reads, counted.
      chainId: 13579,
      identity: null,
      minBudget: MIN,
      handle: echo,
      ledger: new PaymentLedger(null),
    });
    expect((await n.fetch(task({ ...hire, paymentTxHash: '0x1234' }))).status).toBe(400);
    expect((await n.fetch(task({ ...hire, requesterAddress: 'alice' }))).status).toBe(400);
    expect((await n.fetch(task('a string'))).status).toBe(400);
    const { verifier: _verifier, ...noVerifier } = hire;
    expect((await n.fetch(task(noVerifier))).status).toBe(400);
    expect((await n.fetch(task({ ...hire, verifier: 'the service' }))).status).toBe(400);
    const { termId: _termId, ...noTerm } = hire;
    expect((await n.fetch(task(noTerm))).status).toBe(400);
    expect((await n.fetch(task({ ...hire, termId: '0x7e' }))).status).toBe(400);
    expect(reads).toBe(0);
  });

  test('a body over the limit is a 413', async () => {
    const n = node({ [PAID]: paid }, { limits: { maxBodyBytes: 100 } });
    const response = await n.fetch(task({ ...hire, payload: 'x'.repeat(200) }));
    expect(response.status).toBe(413);
  });

  test('a handler past its time is a 504 and is aborted; its payment is free again only once it settles', async () => {
    let calls = 0;
    let finish!: () => void;
    let signal: AbortSignal | undefined;
    const slow: TaskHandler = async (payload, context) => {
      calls += 1;
      if (calls === 1) {
        signal = context.signal;
        await new Promise<void>((resolve) => (finish = resolve));
      }
      return payload;
    };
    const n = node({ [PAID]: paid }, { handle: slow, limits: { handlerTimeoutMs: 20 } });
    expect((await n.fetch(task(hire))).status).toBe(504);
    expect(signal?.aborted).toBe(true);
    // Still running: the same payment cannot start a second job beside it.
    expect((await n.fetch(task(hire))).status).toBe(409);
    expect(calls).toBe(1);
    finish();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect((await n.fetch(task(hire))).status).toBe(200);
  });

  test('past the per-minute limit a client gets 429, another client does not, and the window resets', async () => {
    let at = 0;
    const n = node({}, { limits: { requestsPerMinute: 2 }, now: () => at });
    const bad = () => task({ ...hire, paymentTxHash: '0x1' });
    expect((await n.fetch(bad(), 'a')).status).toBe(400);
    expect((await n.fetch(bad(), 'a')).status).toBe(400);
    expect((await n.fetch(bad(), 'a')).status).toBe(429);
    expect((await n.fetch(bad(), 'b')).status).toBe(400);
    at = 60_000;
    expect((await n.fetch(bad(), 'a')).status).toBe(400);
  });
});

describe('the other routes', () => {
  test('GET / says what the operator sells and does not publish where the handler lives', async () => {
    const offer = { description: 'counts words', input: '{"text": "..."}', output: '{"words": 1}' };
    const body = (await (
      await node({}, { offer }).fetch(new Request('http://node/'))
    ).json()) as Record<string, unknown>;
    expect(body['offer']).toEqual(offer);
    expect(body).not.toHaveProperty('handler');
  });

  test('an offer that is not three short strings is not served', () => {
    expect(readOffer({ description: 'a', input: 'b' })).toBeNull();
    expect(readOffer({ description: 'a', input: 'b', output: 'x'.repeat(501) })).toBeNull();
    expect(readOffer({ description: 'a', input: 'b', output: 'c' })).toEqual({ description: 'a', input: 'b', output: 'c' });
  });

  test('healthz names the agent', async () => {
    const body = (await (await node({}).fetch(new Request('http://node/healthz'))).json()) as {
      agent: string;
    };
    expect(body.agent).toBe(agent.address);
  });

  test('a body that is not JSON is a 400', async () => {
    const response = await node({}).fetch(
      new Request('http://node/task', { method: 'POST', body: '{' }),
    );
    expect(response.status).toBe(400);
  });

  test('anything else is a 404', async () => {
    expect((await node({}).fetch(new Request('http://node/nope'))).status).toBe(404);
  });
});
