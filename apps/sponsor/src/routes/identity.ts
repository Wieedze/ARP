import { checkIdentityLimits, prepareIdentityAtom } from '@arp-protocol/core';
import { getAddress, type Hex } from 'viem';
import { json, REGISTRY, type Body, type SponsorContext } from './context.ts';

/**
 * The atoms and triples that give a registered agent its identity on the graph, created and
 * paid by the service (ADR `0110`). The documents are pinned first, and a pin that does not
 * return the URI the atom id derives from stops it before anything is sent.
 */
export async function identity(ctx: SponsorContext, body: Body): Promise<Response> {
  const {
    options,
    reads,
    limits,
    ledger,
    now,
    exclusive,
    assertMultiVault,
    sendToMultiVault,
    ownerOfAgent,
    refuseOwnAgent,
    unconfirmed,
  } = ctx;
  const pinThing = options.pinThing ?? null;
  if (pinThing === null) {
    return json({ error: 'identity creation is not configured on this service' }, 503);
  }
  const registered = await ownerOfAgent(body.agentRegistry, body.agentId);
  if ('unreadable' in registered) return registered.unreadable;
  if ('error' in registered) return json({ error: registered.error }, registered.status);
  const own = refuseOwnAgent(registered.owner, body.agentId);
  if (own !== null) return own;
  // Both checked by `ownerOfAgent` above.
  const [, registryChain, registryAddress] = REGISTRY.exec(String(body.agentRegistry)) ?? [];
  const agentId = String(body.agentId);
  const registry = getAddress(registryAddress ?? '');
  const agentKey = `eip155:${registryChain}:${registry.toLowerCase()}:${agentId}`;

  const planIdentity = () =>
    prepareIdentityAtom({
      agent: { chainId: Number(registryChain), tokenId: agentId, registry },
      reads,
    });
  // Pinned before the queue: a pin moves no value, and a slow pinning service must not hold up
  // every other route. The documents are a pure function of the agent, so the plan made inside
  // the queue pins the same two.
  let pins;
  try {
    pins = await planIdentity();
  } catch (error) {
    return json({ error: String(error instanceof Error ? error.message : error) }, 400);
  }
  // The limits before the pins (ADR `0116`): a pin moves no value but costs the pinning account,
  // and a refused agent must not get two documents pinned for free on every request. Checked
  // again inside the queue, where the count is final.
  const early = checkIdentityLimits(ledger.relevant(now()), {
    agentKey,
    value: pins.totalValue,
    now: now(),
    limits,
  });
  if (!early.ok) return json({ error: early.reason }, 429);
  // Pinned even when every term exists: an atom created unpinned stays unlabelled, and only a pin
  // makes it resolvable.
  for (const which of ['identity', 'caip'] as const) {
    const uri = await pinThing(pins.things[which]).catch(() => null);
    if (uri !== pins.uris[which]) {
      return json(
        {
          error: `pinning the ${which} document returned ${String(uri)}, not ${pins.uris[which]}`,
        },
        502,
      );
    }
  }
  if (pins.calls.length === 0) {
    return json({ identityAtom: pins.identityAtom, sent: [], valueWei: 0n });
  }

  return exclusive(async () => {
    const plan = await planIdentity();
    if (plan.calls.length === 0) {
      return json({ identityAtom: plan.identityAtom, sent: [], valueWei: 0n });
    }
    plan.calls.forEach(assertMultiVault);
    const decision = checkIdentityLimits(ledger.relevant(now()), {
      agentKey,
      value: plan.totalValue,
      now: now(),
      limits,
    });
    if (!decision.ok) return json({ error: decision.reason }, 429);

    const sent: Hex[] = [];
    const first = ledger.keyedWith('identity', `${agentKey}#`).length;
    for (const [index, call] of plan.calls.entries()) {
      const key = `${agentKey}#${first + index}`;
      ledger.reserve({
        kind: 'identity',
        subject: registered.owner,
        value: call.value,
        at: now(),
        key,
      });
      const result = await sendToMultiVault(call);
      if (result.status === 'unconfirmed')
        return unconfirmed('identity', key, result.hash, { sent });
      if (result.status !== 'success') {
        ledger.settle('identity', key, { status: 'reverted', hash: result.hash });
        return json({ error: `${call.why}: ${result.hash} reverted`, sent }, 502);
      }
      ledger.settle('identity', key, { status: 'success', hash: result.hash });
      sent.push(result.hash);
    }
    return json({ identityAtom: plan.identityAtom, sent, valueWei: plan.totalValue });
  });
}
