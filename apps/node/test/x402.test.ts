import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { x402Client } from '@x402/core/client';
import { x402HTTPClient } from '@x402/core/http';
import type { FacilitatorClient } from '@x402/core/server';
import type {
  PaymentPayload,
  PaymentRequirements,
  SettleResponse,
  VerifyResponse,
} from '@x402/core/types';
import { ExactEvmScheme } from '@x402/evm/exact/client';
import { parseEther } from 'viem';
import type { Address, Hex } from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';

import { verifyHireReceipt, type SignedHireReceipt } from '@arp-protocol/core';
import {
  createX402Gate,
  PaidCallCounter,
  payerOf,
  X402_TESTNET,
  type X402Gate,
} from '@arp-protocol/core/x402';

import { createNode, echo, PaymentLedger, type TaskHandler, X402_TASK_ROUTE } from '../src/task.ts';

const agent = privateKeyToAccount(generatePrivateKey());
const SETTLED: Hex = `0x${'5e'.repeat(32)}`;
const NATIVE: Hex = `0x${'01'.repeat(32)}`;
const VERIFIER: Address = '0x00000000000000000000000000000000000e4f04';
const TERM: Hex = `0x${'7e'.repeat(32)}`;
const URL_ = 'http://node/task';

/** The facilitator, in memory. Nothing here reaches x402.org or any chain. */
class FakeFacilitator implements FacilitatorClient {
  verifies = 0;
  settles = 0;
  settleAnswer: (requirements: PaymentRequirements, payload: PaymentPayload) => SettleResponse = (
    requirements,
    payload,
  ) => ({
    success: true,
    transaction: SETTLED,
    network: requirements.network,
    payer: payerOf(payload) ?? undefined,
  });

  async verify(payload: PaymentPayload): Promise<VerifyResponse> {
    this.verifies += 1;
    return { isValid: true, payer: payerOf(payload) ?? undefined };
  }

  async settle(payload: PaymentPayload, requirements: PaymentRequirements): Promise<SettleResponse> {
    this.settles += 1;
    return this.settleAnswer(requirements, payload);
  }

  async getSupported() {
    return {
      kinds: [{ x402Version: 2, scheme: 'exact', network: X402_TESTNET.network }],
      extensions: [],
      signers: {},
    } as Awaited<ReturnType<FacilitatorClient['getSupported']>>; // Its named type is not exported.
  }
}

let dir: string;
let facilitator: FakeFacilitator;
let counter: PaidCallCounter;
let gate: X402Gate;
const realFetch = globalThis.fetch;

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'arp-node-x402-'));
  facilitator = new FakeFacilitator();
  counter = new PaidCallCounter(join(dir, 'paid.jsonl'));
  // Any network call in this file is a defect: the facilitator is the fake, the payer signs offline.
  globalThis.fetch = (() => Promise.reject(new Error('no network in tests'))) as unknown as typeof fetch;
  gate = await createX402Gate({
    config: {
      network: X402_TESTNET.network,
      payTo: agent.address,
      price: '$0.01',
      facilitatorUrl: X402_TESTNET.facilitatorUrl,
      maxTimeoutSeconds: 300,
    },
    routes: [{ pattern: 'POST /task', description: 'a hire', mimeType: 'application/json' }],
    facilitator,
    counter,
    now: () => new Date('2026-11-02T12:00:00Z'),
  });
});
afterEach(() => {
  globalThis.fetch = realFetch;
  rmSync(dir, { recursive: true, force: true });
});

function node(options: { handle?: TaskHandler; x402?: X402Gate | null; native?: boolean } = {}) {
  const tx = { to: agent.address, from: '0x00000000000000000000000000000000000000aa', value: parseEther('0.001') };
  return createNode({
    account: agent,
    // The two reads the native rail makes. The x402 rail makes none.
    publicClient: {
      getTransaction: async ({ hash }: { hash: Hex }) => {
        if (hash !== NATIVE) throw new Error('not found');
        return tx;
      },
      getTransactionReceipt: async () => ({ status: 'success' }),
    } as never,
    chainId: 13579,
    identity: { agentRegistry: 'eip155:13579:0xC165A2ADc0000000000000000000000000000001', agentId: 2n },
    minBudget: parseEther('0.001'),
    handle: options.handle ?? echo,
    handlerPath: null,
    ledger: new PaymentLedger(join(dir, 'ledger.jsonl')),
    x402: options.x402 === undefined ? gate : options.x402,
  });
}

const body = { verifier: VERIFIER, termId: TERM, payload: { q: 1 } };

function task(extra: Record<string, unknown> = {}, headers: Record<string, string> = {}): Request {
  return new Request(URL_, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify({ ...body, ...extra }),
  });
}

/** A requester with a key made for the test. It signs a USDC authorisation offline and holds nothing. */
async function payment(n = node()) {
  const account = privateKeyToAccount(generatePrivateKey());
  const client = new x402HTTPClient(new x402Client().register('eip155:*', new ExactEvmScheme(account)));
  const unpaid = await n.fetch(task());
  const required = client.getPaymentRequiredResponse((name) => unpaid.headers.get(name), await unpaid.json());
  const headers = client.encodePaymentSignatureHeader(await client.createPaymentPayload(required));
  return { account, client, headers };
}

describe('the x402 rail', () => {
  test('an unpaid hire is a 402 carrying USDC requirements on Base Sepolia, and nothing runs', async () => {
    let ran = false;
    const answer = await node({ handle: async () => (ran = true) }).fetch(task());
    expect(answer.status).toBe(402);
    expect(ran).toBe(false);
    expect(answer.headers.get('payment-required')).not.toBeNull();
    const { client } = await payment();
    const required = client.getPaymentRequiredResponse((name) => answer.headers.get(name), {});
    expect(required.accepts[0]).toMatchObject({
      scheme: 'exact',
      network: 'eip155:84532',
      asset: X402_TESTNET.usdc,
      amount: '10000',
      payTo: agent.address,
    });
  });

  test('a paid hire runs, settles after the work, and the receipt names the settlement on 84532', async () => {
    const n = node();
    const { account, client, headers } = await payment(n);
    let settledBeforeWork = -1;
    const handle: TaskHandler = async (payload, context) => {
      settledBeforeWork = facilitator.settles;
      return { payload, context: { ...context, paid: context.paid.toString() } };
    };
    const answer = await node({ handle }).fetch(task({}, headers));
    expect(answer.status).toBe(200);
    expect(settledBeforeWork).toBe(0);
    expect(facilitator.settles).toBe(1);

    const { result, receipt } = (await answer.json()) as {
      result: { context: Record<string, unknown> };
      receipt: SignedHireReceipt;
    };
    expect(result.context).toMatchObject({ rail: 'x402', paid: '10000', paymentTxHash: null });
    expect(String(result.context['requester']).toLowerCase()).toBe(account.address.toLowerCase());
    expect(await verifyHireReceipt(receipt)).toEqual({ status: 'valid', signer: agent.address });
    expect(receipt.chainId).toBe(84532);
    expect(receipt.receipt).toMatchObject({ payment: SETTLED, paid: '10000', termId: TERM });
    expect(receipt.receipt.requester.toLowerCase()).toBe(account.address.toLowerCase());
    expect(client.getPaymentSettleResponse((name) => answer.headers.get(name))).toMatchObject({
      success: true,
      transaction: SETTLED,
    });

    const row = JSON.parse(readFileSync(join(dir, 'ledger.jsonl'), 'utf8').trim()) as Record<string, string>;
    expect(row).toMatchObject({ rail: 'x402', transaction: SETTLED, network: 'eip155:84532' });
    expect(counter.counts()).toEqual({ '2026-11-02': { [X402_TASK_ROUTE]: 1 } });
  });

  test('one signed authorisation buys one job', async () => {
    const n = node();
    const { headers } = await payment(n);
    expect((await n.fetch(task({}, headers))).status).toBe(200);
    const verifiesBefore = facilitator.verifies;
    expect((await n.fetch(task({}, headers))).status).toBe(409);
    expect(facilitator.settles).toBe(1);
    // Refused from the ledger, before the facilitator is asked anything.
    expect(facilitator.verifies).toBe(verifiesBefore);
  });

  test('an authorisation signed by someone other than the declared requester is refused', async () => {
    const { headers } = await payment();
    const answer = await node().fetch(
      task({ requesterAddress: '0x00000000000000000000000000000000000000bb' }, headers),
    );
    expect(answer.status).toBe(402);
    expect(facilitator.settles).toBe(0);
  });

  test('a handler that fails is not settled, and the same authorisation can be retried', async () => {
    let calls = 0;
    const n = node({
      handle: async () => {
        calls += 1;
        if (calls === 1) throw new Error('boom');
        return 'ok';
      },
    });
    const { headers } = await payment(n);
    expect((await n.fetch(task({}, headers))).status).toBe(500);
    expect(facilitator.settles).toBe(0);
    expect(counter.total()).toBe(0);
    expect((await n.fetch(task({}, headers))).status).toBe(200);
    expect(facilitator.settles).toBe(1);
  });

  test('a settlement that fails withholds the result and the receipt, and counts nothing', async () => {
    facilitator.settleAnswer = (requirements) => ({
      success: false,
      errorReason: 'invalid_transaction_state',
      transaction: '',
      network: requirements.network,
    });
    const { headers } = await payment();
    const answer = await node().fetch(task({}, headers));
    expect(answer.status).toBe(402);
    expect(JSON.stringify(await answer.json())).not.toContain('receipt');
    expect(counter.total()).toBe(0);
  });

  test('the native rail still answers when the body names a payment', async () => {
    const answer = await node().fetch(
      task({ paymentTxHash: NATIVE, requesterAddress: '0x00000000000000000000000000000000000000aa' }),
    );
    expect(answer.status).toBe(200);
    const { receipt } = (await answer.json()) as { receipt: SignedHireReceipt };
    expect(receipt.chainId).toBe(13579);
    expect(facilitator.verifies).toBe(0);
  });

  test('without the rail, a hire that names no payment is a 400, as before', async () => {
    expect((await node({ x402: null }).fetch(task())).status).toBe(400);
  });

  test('GET / and /healthz publish the x402 terms, or null', async () => {
    const info = (await (await node().fetch(new Request('http://node/'))).json()) as {
      x402: { price: string; network: string } | null;
    };
    expect(info.x402).toMatchObject({ price: '$0.01', network: 'eip155:84532' });
    const off = (await (await node({ x402: null }).fetch(new Request('http://node/healthz'))).json()) as {
      x402: unknown;
    };
    expect(off.x402).toBeNull();
  });
});
