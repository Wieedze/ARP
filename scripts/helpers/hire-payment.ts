/** What `demo-hire.ts` may pay a remote node, decided before anything is signed.
 *
 *  The node names its own price (`minBudgetWei`) and its own payee (`agent`) over HTTP, so neither
 *  is trusted: the payment is capped by the hirer (`--max-pay <wei>`), and the raw key signs on
 *  testnet 13579 only (`.claude/rules/security.md`, ADR `0037`).
 */
import { RAW_KEY_CHAIN_ID } from './send-plan.js';

/** Default ceiling when `--max-pay` is not given: 0.01 TRUST, ten times the walk's example price. */
export const DEFAULT_MAX_PAY_WEI = 10_000_000_000_000_000n;

export type HirePaymentCheck = { ok: true } | { ok: false; reason: string };

/** Refuses a payment on the wrong chain, below the node's price, or above the hirer's ceiling. */
export function checkHirePayment(input: {
  chainId: number;
  rpcChainId: number;
  minBudget: bigint;
  payAmount: bigint;
  maxPay: bigint;
}): HirePaymentCheck {
  const { chainId, rpcChainId, minBudget, payAmount, maxPay } = input;
  if (chainId !== RAW_KEY_CHAIN_ID) {
    return { ok: false, reason: `chain ${chainId} is not testnet ${RAW_KEY_CHAIN_ID}` };
  }
  if (rpcChainId !== chainId) {
    return { ok: false, reason: `the RPC is chain ${rpcChainId}, not ${chainId}` };
  }
  if (minBudget > maxPay) {
    return { ok: false, reason: `the node asks ${minBudget} wei, above --max-pay ${maxPay}` };
  }
  if (payAmount < minBudget) {
    return { ok: false, reason: `${payAmount} wei is below the node's minimum ${minBudget}` };
  }
  if (payAmount > maxPay) {
    return { ok: false, reason: `${payAmount} wei is above --max-pay ${maxPay}` };
  }
  return { ok: true };
}
