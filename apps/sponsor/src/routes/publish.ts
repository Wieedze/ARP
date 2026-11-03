import {
  checkPublishLimits,
  delegationDocument,
  delegationHash,
  parseDelegation,
  planPublishDelegation,
  verifyDelegationSignature,
} from '@arp-protocol/core';
import { type Hex } from 'viem';
import { json, type Body, type SponsorContext } from './context.ts';

export async function publish(ctx: SponsorContext, body: Body): Promise<Response> {
  const {
    options,
    chainId,
    reads,
    limits,
    ledger,
    now,
    exclusive,
    assertMultiVault,
    sendToMultiVault,
    ownerOfAgent,
  } = ctx;
  const config = options.publish;
  if (config === null) return json({ error: 'publication is not configured on this service' }, 503);
  const parsed = parseDelegation(body.delegation);
  if ('error' in parsed) return json({ error: parsed.error }, 400);
  const domain = { chainId, delegationManager: config.delegationManager };
  // First, and before anything is pinned: the relay is not free pinning (ADR `0092` item 2).
  if (!(await verifyDelegationSignature(parsed, domain, config.verify))) {
    return json({ error: 'the delegation signature does not verify for its delegator' }, 401);
  }
  const document = delegationDocument(parsed, domain);
  const registered = await ownerOfAgent(body.agentRegistry, body.agentId);
  if ('unreadable' in registered) return registered.unreadable;
  if ('error' in registered) {
    // Not sponsored, still publishable: the operator pins this document and sends the plan.
    return json({ error: registered.error, document }, registered.status);
  }
  if (registered.owner !== parsed.delegate) {
    return json(
      {
        error: `the delegate ${parsed.delegate} is not the holder of agent ${String(body.agentId)}`,
        document,
      },
      403,
    );
  }

  return exclusive(async () => {
    const count = checkPublishLimits(ledger.relevant(now(), [parsed.delegator]), {
      delegator: parsed.delegator,
      value: 0n,
      now: now(),
      limits,
    });
    if (!count.ok) return json({ error: count.reason, document }, 429);
    const documentUri = await config.pin(document);
    const plan = await planPublishDelegation({
      delegation: parsed,
      domain,
      documentUri,
      predicates: config.predicates,
      reads,
    });
    if (plan.calls.length === 0) {
      return json({
        published: 'already',
        delegationHash: delegationHash(parsed),
        terms: plan.terms,
      });
    }
    const decision = checkPublishLimits(ledger.relevant(now(), [parsed.delegator]), {
      delegator: parsed.delegator,
      value: plan.totalValue,
      now: now(),
      limits,
    });
    if (!decision.ok) return json({ error: decision.reason, documentUri, plan }, 429);

    plan.calls.forEach(assertMultiVault);
    const sent: Hex[] = [];
    let spent = 0n;
    let pending: Hex | null = null;
    try {
      for (const call of plan.calls) {
        // Counted before the send: a throw while it is awaited may still have spent it.
        spent += call.value;
        const result = await sendToMultiVault(call);
        // Unconfirmed stays counted as spent, and stops the publication: the next call may
        // depend on this one's term.
        if (result.status === 'unconfirmed') {
          pending = result.hash;
          break;
        }
        if (result.status !== 'success') {
          spent -= call.value;
          break;
        }
        sent.push(result.hash);
      }
    } finally {
      // Recorded even when it stopped half way, or threw: what was sent was spent.
      if (spent > 0n) {
        ledger.append({
          kind: 'publish',
          subject: parsed.delegator,
          value: spent,
          at: now(),
          key: delegationHash(parsed),
        });
      }
    }
    if (pending !== null) {
      return json(
        {
          error: `transaction ${pending} was sent and not confirmed in time; re-publishing resumes once it lands`,
          pending,
          sent,
          documentUri,
        },
        504,
      );
    }
    if (sent.length < plan.calls.length) {
      return json(
        { error: 'a call reverted; re-publishing resumes where it stopped', sent, documentUri },
        502,
      );
    }
    return json({
      published: 'now',
      delegationHash: delegationHash(parsed),
      documentUri,
      sent,
      terms: plan.terms,
    });
  });
}
