import { prepareMarketExit, prepareMarketPosition, prepareStakeOnUsed } from '@arp-protocol/core';

import { reads } from '../config.js';
import { type JsonRpcId, fail, text, isTermId, isAddress } from '../rpc.js';
import { serialiseCall, UNSIGNED_CAVEAT, serialiseStakePlan } from '../serialise.js';

export async function stakeOnUsed(id: JsonRpcId, args: Record<string, unknown>) {
  const receiver = args['receiver'];
  const targets = args['targets'];
  if (!isAddress(receiver)) return fail(id, -32602, 'receiver must be a 20-byte hex address');
  if (!Array.isArray(targets) || targets.length === 0) {
    return fail(id, -32602, 'targets must be a non-empty array');
  }

  const parsed: { tripleId: `0x${string}`; amount: bigint }[] = [];
  for (const target of targets) {
    const row = target as Record<string, unknown>;
    if (!isTermId(row['triple_id'])) {
      return fail(id, -32602, 'each target needs a triple_id of 0x + 32 bytes');
    }
    const amountRaw = row['amount_wei'];
    if (typeof amountRaw !== 'string' || !/^\d+$/.test(amountRaw)) {
      return fail(id, -32602, 'each target needs amount_wei as a decimal string of wei');
    }
    parsed.push({ tripleId: row['triple_id'], amount: BigInt(amountRaw) });
  }

  const curveRaw = args['curve_id'];
  if (curveRaw !== undefined && (typeof curveRaw !== 'number' || !Number.isInteger(curveRaw))) {
    return fail(id, -32602, 'curve_id must be an integer');
  }

  const plan = await prepareStakeOnUsed({
    targets: parsed,
    receiver,
    reads,
    ...(curveRaw === undefined ? {} : { curveId: BigInt(curveRaw) }),
  });
  return text(id, serialiseStakePlan(plan));
}

/**
 * Join the market on an atom.
 *
 * **A different act from `arp_stake_on_used`**, and the server keeps them apart for the reason ADR
 * `0056` does: backing a `uses` edge says *this claim is true* and is attributable to whoever wrote
 * it; depositing on an atom says *this thing is worth something* and anyone may do it for any
 * reason. The two are never summed.
 *
 * This is the gap that made the server read-only on the thing it exists for: measured 2026-10-28,
 * **2,354 TRUST across 23 positions** sits on 39 skill atoms on mainnet 1155, and until now not one
 * wei of it was reachable from here.
 */
export async function takePosition(id: JsonRpcId, args: Record<string, unknown>) {
  const termId = args['term_id'];
  const receiver = args['receiver'];
  if (!isTermId(termId)) return fail(id, -32602, 'term_id must be 0x + 32 bytes');
  if (!isAddress(receiver)) return fail(id, -32602, 'receiver must be a 0x address');

  const amountRaw = args['amount_wei'];
  if (typeof amountRaw !== 'string' || !/^\d+$/.test(amountRaw)) {
    return fail(id, -32602, 'amount_wei must be a decimal string of wei');
  }
  const curveRaw = args['curve_id'];
  if (curveRaw !== undefined && (typeof curveRaw !== 'number' || !Number.isInteger(curveRaw))) {
    return fail(id, -32602, 'curve_id must be an integer');
  }
  const minSharesRaw = args['min_shares'];
  if (
    minSharesRaw !== undefined &&
    (typeof minSharesRaw !== 'string' || !/^\d+$/.test(minSharesRaw))
  ) {
    return fail(id, -32602, 'min_shares must be a decimal string');
  }

  const plan = await prepareMarketPosition({
    termId,
    amount: BigInt(amountRaw),
    receiver,
    reads,
    ...(curveRaw === undefined ? {} : { curveId: BigInt(curveRaw) }),
    ...(minSharesRaw === undefined ? {} : { minShares: BigInt(minSharesRaw) }),
  });

  return text(id, {
    term_id: plan.termId,
    receiver: plan.receiver,
    curve_id: plan.curveId.toString(),
    amount_wei: plan.amount.toString(),
    shares: plan.shares.toString(),
    assets_after_fees_wei: plan.assetsAfterFees.toString(),
    min_deposit_wei: plan.minDeposit.toString(),
    chain_id: plan.chainId,
    calls: plan.calls.map(serialiseCall),
    caveat: UNSIGNED_CAVEAT,
  });
}

/**
 * Leave the market on an atom.
 *
 * It ships with the way in rather than after it: ADR `0056`, in the user's own words — *a deposit
 * nobody can withdraw is a donation*, and a one-directional market is a collection box.
 *
 * The call it returns sends **no value**, which is unique on this server. What the redemption
 * fetches is read from `previewRedeem` rather than derived from the share count, because the exit
 * fee is governance-configurable and curve 2 is not linear in shares.
 */
export async function exitPosition(id: JsonRpcId, args: Record<string, unknown>) {
  const termId = args['term_id'];
  const account = args['account'];
  const receiver = args['receiver'];
  if (!isTermId(termId)) return fail(id, -32602, 'term_id must be 0x + 32 bytes');
  if (!isAddress(account)) return fail(id, -32602, 'account must be a 0x address');
  if (!isAddress(receiver)) return fail(id, -32602, 'receiver must be a 0x address');

  const sharesRaw = args['shares'];
  if (sharesRaw !== undefined && (typeof sharesRaw !== 'string' || !/^\d+$/.test(sharesRaw))) {
    return fail(id, -32602, 'shares must be a decimal string');
  }
  const curveRaw = args['curve_id'];
  if (curveRaw !== undefined && (typeof curveRaw !== 'number' || !Number.isInteger(curveRaw))) {
    return fail(id, -32602, 'curve_id must be an integer');
  }
  const minAssetsRaw = args['min_assets'];
  if (
    minAssetsRaw !== undefined &&
    (typeof minAssetsRaw !== 'string' || !/^\d+$/.test(minAssetsRaw))
  ) {
    return fail(id, -32602, 'min_assets must be a decimal string');
  }

  const plan = await prepareMarketExit({
    termId,
    account,
    receiver,
    reads,
    ...(sharesRaw === undefined ? {} : { shares: BigInt(sharesRaw) }),
    ...(curveRaw === undefined ? {} : { curveId: BigInt(curveRaw) }),
    ...(minAssetsRaw === undefined ? {} : { minAssets: BigInt(minAssetsRaw) }),
  });

  return text(id, {
    term_id: plan.termId,
    receiver: plan.receiver,
    curve_id: plan.curveId.toString(),
    shares: plan.shares.toString(),
    held_shares: plan.held.toString(),
    assets_after_fees_wei: plan.assetsAfterFees.toString(),
    chain_id: plan.chainId,
    calls: plan.calls.map(serialiseCall),
    caveat: UNSIGNED_CAVEAT,
  });
}
