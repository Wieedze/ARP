import { describe, expect, it } from 'bun:test';

import { checkHirePayment, DEFAULT_MAX_PAY_WEI } from '../helpers/hire-payment.js';

/**
 * `demo-hire.ts` pays a node-supplied payee a node-supplied price. Before task 59 it took mainnet,
 * checked no chain, and paid whatever `minBudgetWei` the node answered.
 */
const ok = { chainId: 13579, rpcChainId: 13579, minBudget: 1000n, payAmount: 1000n, maxPay: 5000n };

describe('checkHirePayment', () => {
  it('accepts a testnet payment within the ceiling', () => {
    expect(checkHirePayment(ok)).toEqual({ ok: true });
  });

  it('refuses mainnet 1155', () => {
    expect(checkHirePayment({ ...ok, chainId: 1155, rpcChainId: 1155 }).ok).toBe(false);
  });

  it('refuses an RPC on another chain', () => {
    expect(checkHirePayment({ ...ok, rpcChainId: 1155 }).ok).toBe(false);
  });

  it('refuses a node asking more than --max-pay', () => {
    const verdict = checkHirePayment({ ...ok, minBudget: 6000n, payAmount: 6000n });
    expect(verdict).toEqual({ ok: false, reason: 'the node asks 6000 wei, above --max-pay 5000' });
  });

  it('refuses a payment above --max-pay and one below the minimum', () => {
    expect(checkHirePayment({ ...ok, payAmount: 5001n }).ok).toBe(false);
    expect(checkHirePayment({ ...ok, payAmount: 999n }).ok).toBe(false);
  });

  it('defaults the ceiling to 0.01 TRUST', () => {
    expect(DEFAULT_MAX_PAY_WEI).toBe(10n ** 16n);
  });
});
