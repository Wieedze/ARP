import {
  checkLineLimits,
  encodeCreateTriple,
  planDepositApproval,
  planSponsoredDeposit,
  prepareUsageContext,
  verifyLineRequest,
  type SignedLineRequest,
} from '@arp-protocol/core';
import type { Hex } from 'viem';
import { SPONSOR_CHAIN_ID } from '../key-file.ts';
import { chainUnreadable, json, type Body, type SponsorContext } from './context.ts';

/**
 * One line, form B, paid by the service (ADR `0144`): the `uses` edge if missing, the domain, the
 * outcome and the reason, and then a deposit in the agent's name on each level, so the agent's wallet
 * stands behind them (`pulse-usage.ts`). The service creates terms and is never counted as saying them.
 *
 * **No proof of use** is asked, unlike `/deposit`: a line is the agent's word. Testnet 13579 only, under
 * a per-agent and a total daily cap and the shared budget.
 */
export async function line(ctx: SponsorContext, body: Body): Promise<Response> {
  const { options, chainId, wallet, reads, limits, ledger, now, multiVault } = ctx;
  const { exclusive, sendToMultiVault, ownerOfAgent, refuseOwnAgent, unconfirmed, assertMultiVault } = ctx;
  const lines = options.lines ?? null;
  if (lines === null || options.categories === undefined || options.categories === null) {
    return json({ error: 'writing a line is not configured on this service', rule: 'config' }, 503);
  }
  if (chainId !== SPONSOR_CHAIN_ID) {
    return json({ error: `a sponsored line is written on testnet ${SPONSOR_CHAIN_ID} only`, rule: 'chain' }, 403);
  }
  const verdict = await verifyLineRequest(body.request, Math.floor(now() / 1000));
  if (verdict.status !== 'valid') {
    return json({ error: `request is ${verdict.status}`, rule: 'signature', verdict }, 401);
  }
  const signed = body.request as SignedLineRequest; // Checked by `verifyLineRequest`.
  if (signed.chainId !== chainId) {
    return json({ error: `request is for chain ${signed.chainId}`, rule: 'signature' }, 400);
  }
  const { request } = signed;
  const agent = verdict.address;

  const registered = await ownerOfAgent(request.agentRegistry, request.agentId);
  if ('unreadable' in registered) return registered.unreadable;
  if ('error' in registered) return json({ error: registered.error }, registered.status);
  if (registered.owner !== agent) {
    return json({ error: `agent ${request.agentId} is held by ${registered.owner}, not ${agent}` }, 403);
  }
  const own = refuseOwnAgent(registered.owner, request.agentId);
  if (own !== null) return own;

  const subjectRead = await options.identities.identityAtom({
    agentRegistry: request.agentRegistry,
    agentId: request.agentId,
  });
  if (subjectRead.status === 'none') {
    return json({ error: `agent ${request.agentId} has no identity atom on the graph` }, 403);
  }
  if (subjectRead.status === 'ambiguous') {
    return json({ error: `agent ${request.agentId}: ${subjectRead.reason}` }, 409);
  }
  const subject = subjectRead.atom;
  const categories = options.categories;

  return exclusive(async () => {
    const key = `line:${request.nonce.toLowerCase()}`;
    if (ledger.has('line', key)) return json({ error: 'this request was already used', rule: 'nonce' }, 409);

    let usesId: Hex;
    let plan;
    let edgeExists: boolean;
    let cost: bigint;
    try {
      if (!(await reads.termExists(request.tool))) {
        return json({ error: 'the tool has no atom: list it first (POST /list-tool)', rule: 'tool' }, 422);
      }
      usesId = await reads.tripleId(subject, options.usesPredicate, request.tool);
      edgeExists = await reads.termExists(usesId);
      const [tripleCost, minDeposit] = await Promise.all([reads.tripleCost(), reads.minDeposit()]);
      cost = tripleCost + minDeposit;
      plan = await prepareUsageContext({
        usesTripleId: usesId,
        edgePlanned: !edgeExists,
        ...(request.domain === '' ? {} : { domain: request.domain }),
        outcome: request.outcome,
        ...(request.reason === '' ? {} : { reason: request.reason }),
        inContextOf: lines.inContextOf,
        isCategory: categories.isCategory,
        reads,
      });
    } catch (error) {
      return chainUnreadable(String(error instanceof Error ? error.message : error));
    }
    if (plan.status === 'refused') return json({ error: plan.detail, rule: plan.rule }, 422);

    const levels = [usesId, plan.contextTripleId, plan.outcomeTripleId, plan.reasonTripleId].filter(
      (term): term is Hex => term !== null,
    );
    const curve = await reads.defaultCurveId();
    const missing: Hex[] = [];
    for (const term of levels) {
      if ((await reads.sharesOf(agent, term, curve)) === 0n) missing.push(term);
    }
    if (edgeExists && plan.calls.length === 0 && missing.length === 0) {
      return json({ termId: usesId, levels, created: false, transactions: [] });
    }

    const value =
      (edgeExists ? 0n : cost) + plan.totalValue + BigInt(missing.length) * limits.depositAmount;
    const fits = checkLineLimits(ledger.relevant(now()), { agent, value, now: now(), limits });
    if (!fits.ok) return json({ error: fits.reason, rule: 'limit' }, 429);

    // Whether the agent approved this service, learnt on a term that exists, before anything is spent.
    const probe = await planSponsoredDeposit({
      receiver: agent,
      termId: request.tool,
      amount: limits.depositAmount,
      reads,
    });
    const simulated = await wallet.simulate(probe.call);
    if (!simulated.ok) {
      return json(
        {
          error: `a deposit in the agent's name does not simulate: ${simulated.reason}`,
          approve: planDepositApproval({ multiVault, chainId, sponsor: wallet.address }),
        },
        409,
      );
    }

    const calls = edgeExists
      ? plan.calls
      : [
          {
            kind: 'create-triple' as const,
            chainId,
            to: multiVault,
            value: cost,
            data: encodeCreateTriple(subject, options.usesPredicate, request.tool, cost),
            why: `the \`uses\` triple ${usesId}, created for a sponsored line`,
          },
          ...plan.calls,
        ];
    for (const call of calls) assertMultiVault(call);

    ledger.reserve({ kind: 'line', subject: agent, value, at: now(), key, termId: usesId });
    const transactions: Hex[] = [];
    const fail = (hash: Hex) => {
      ledger.settle('line', key, { status: 'reverted', hash });
      return json({ error: `transaction ${hash} reverted`, transactions }, 502);
    };
    for (const call of calls) {
      const sent = await sendToMultiVault(call);
      if (sent.status === 'unconfirmed') return unconfirmed('line', key, sent.hash, { transactions });
      if (sent.status !== 'success') return fail(sent.hash);
      transactions.push(sent.hash);
    }
    for (const term of missing) {
      const deposit = await planSponsoredDeposit({
        receiver: agent,
        termId: term,
        amount: limits.depositAmount,
        reads,
      });
      const sent = await sendToMultiVault(deposit.call);
      if (sent.status === 'unconfirmed') return unconfirmed('line', key, sent.hash, { transactions });
      if (sent.status !== 'success') return fail(sent.hash);
      transactions.push(sent.hash);
    }
    ledger.settle('line', key, { status: 'success', hash: transactions.at(-1) as Hex }); // at least one, checked above
    return json({ termId: usesId, levels, created: calls.length > 0, transactions });
  });
}
