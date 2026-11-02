import { afterAll, beforeAll, describe, expect, it } from 'bun:test';

import { RAW_KEY_CHAIN_ID, sendPlan, type SerialisedCall } from '../helpers/send-plan.js';

/**
 * The raw-key signer refuses every chain but testnet 13579, and refuses an RPC that answers a chain
 * other than the plan's. `.claude/rules/security.md`: an agent session signs with a raw key on 13579
 * only (ADR `0037`). Before task 59 `--chain 1155 --execute` reached the signing loop.
 */

// A throwaway key, never funded anywhere: the guards under test refuse before anything is signed.
const KEY = `0x${'11'.repeat(32)}`;
const KEY_NAME = 'SEND_PLAN_TEST_KEY';

const call = (chainId: number): SerialisedCall => ({
  kind: 'deposit',
  chainId,
  to: '0x000000000000000000000000000000000000dEaD',
  value: '1',
  data: '0x',
  why: 'test',
});

/** A JSON-RPC endpoint that answers `eth_chainId` with a chosen chain and records every method. */
function fakeRpc(answerChainId: number) {
  const methods: string[] = [];
  const server = Bun.serve({
    port: 0,
    async fetch(request) {
      const body = (await request.json()) as { id: number; method: string };
      methods.push(body.method);
      const result = body.method === 'eth_chainId' ? `0x${answerChainId.toString(16)}` : null;
      return Response.json({ jsonrpc: '2.0', id: body.id, result });
    },
  });
  return { url: `http://localhost:${server.port}`, methods, stop: () => server.stop(true) };
}

describe('sendPlan chain guards', () => {
  let mainnetRpc: ReturnType<typeof fakeRpc>;
  beforeAll(() => {
    process.env[KEY_NAME] = KEY;
    mainnetRpc = fakeRpc(1155);
  });
  afterAll(() => {
    delete process.env[KEY_NAME];
    mainnetRpc.stop();
  });

  it('allows exactly one chain, testnet 13579', () => {
    expect(RAW_KEY_CHAIN_ID).toBe(13579);
  });

  it('refuses a mainnet plan with --execute before touching the RPC', async () => {
    const outcome = await sendPlan({
      calls: [call(1155)],
      chainId: 1155,
      rpcUrl: mainnetRpc.url,
      keyName: KEY_NAME,
      execute: true,
    });
    expect(outcome.status).toBe('refused');
    expect(outcome.status === 'refused' && outcome.reason).toContain('13579');
    expect(mainnetRpc.methods).toEqual([]);
  });

  it('refuses a testnet plan when the RPC answers another chain', async () => {
    const outcome = await sendPlan({
      calls: [call(13579)],
      chainId: 13579,
      rpcUrl: mainnetRpc.url,
      keyName: KEY_NAME,
      execute: true,
    });
    expect(outcome.status).toBe('refused');
    expect(outcome.status === 'refused' && outcome.reason).toContain('the RPC is chain 1155');
    expect(mainnetRpc.methods).not.toContain('eth_sendRawTransaction');
  });
});
