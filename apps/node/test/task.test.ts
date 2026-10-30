import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { parseEther } from 'viem';
import type { Address, Hex } from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';

import { hireReceiptMatches, verifyHireReceipt, type SignedHireReceipt } from '@arp-protocol/core';

import { createNode, echo, type NodeLimits, PaymentLedger, type TaskHandler } from '../src/task.ts';

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
    handlerPath: null,
    ledger: options.ledger ?? new PaymentLedger(join(dir, 'ledger.jsonl')),
  });
}

function task(body: unknown): Request {
  return new Request('http://node/task', { method: 'POST', body: JSON.stringify(body) });
}

const hire = { paymentTxHash: PAID, requesterAddress: requester, payload: { q: 1 } };

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
    expect(receipt.receipt).toMatchObject({
      agentRegistry: REGISTRY,
      agentId: '2',
      requester,
      payment: PAID,
      paid: MIN.toString(),
    });
    // What the requester can re-derive from the JSON it sent and the JSON it got back.
    expect(hireReceiptMatches(receipt.receipt, hire.payload, result)).toBe(true);
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
      handlerPath: null,
      ledger: new PaymentLedger(null),
    });
    expect((await n.fetch(task({ ...hire, paymentTxHash: '0x1234' }))).status).toBe(400);
    expect((await n.fetch(task({ ...hire, requesterAddress: 'alice' }))).status).toBe(400);
    expect((await n.fetch(task('a string'))).status).toBe(400);
    expect(reads).toBe(0);
  });

  test('a body over the limit is a 413', async () => {
    const n = node({ [PAID]: paid }, { limits: { maxBodyBytes: 100 } });
    const response = await n.fetch(task({ ...hire, payload: 'x'.repeat(200) }));
    expect(response.status).toBe(413);
  });

  test('a handler that does not answer in time is a 504, and the payment can be used again', async () => {
    let calls = 0;
    const hangs: TaskHandler = async (payload) => {
      calls += 1;
      if (calls === 1) await new Promise(() => {});
      return payload;
    };
    const n = node({ [PAID]: paid }, { handle: hangs, limits: { handlerTimeoutMs: 20 } });
    expect((await n.fetch(task(hire))).status).toBe(504);
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
