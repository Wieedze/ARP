import {
  ANONYMOUS_LISTER,
  checkListToolLimits,
  isToolUrl,
  normaliseToolUrl,
  planToolListing,
  thingUri,
  verifyListToolRequest,
  type SignedListToolRequest,
} from '@arp-protocol/core';
import type { Address, Hex } from 'viem';
import { chainUnreadable, json, type Body, type SponsorContext } from './context.ts';

/**
 * A tool listing, paid by the service (ADR `0120`, `docs/tasks/53` 53c): the tool's atom, and for a
 * skill its repository's atom and `(skill, source, repository)`. It makes a tool findable and says
 * nothing about who used it.
 *
 * The one route a browser may call, from the origins `main.ts` allows (`service.ts`). A signed
 * request counts against its address's daily limit; an unsigned one against the shared anonymous
 * cap (the user, 2026-11-03: « B quand une clé est disponible, A sinon »). The URL must exist where
 * it says before anything is pinned or sent.
 */
export async function listTool(ctx: SponsorContext, body: Body): Promise<Response> {
  const { options, chainId, reads, limits, ledger, now, exclusive, assertMultiVault } = ctx;
  const { sendToMultiVault, unconfirmed } = ctx;
  const pinThing = options.pinThing ?? null;
  const resolveTool = options.resolveTool ?? null;
  if (pinThing === null || resolveTool === null) {
    return json({ error: 'tool listing is not configured on this service', rule: 'config' }, 503);
  }
  if (typeof body.url !== 'string' || !isToolUrl(body.url)) {
    return json({ error: 'url is not a tool URL', rule: 'url' }, 400);
  }
  const url = normaliseToolUrl(body.url);

  let lister: Address | null = null;
  let nonce: Hex | null = null;
  if (body.request !== undefined) {
    const verdict = await verifyListToolRequest(body.request, Math.floor(now() / 1000));
    if (verdict.status !== 'valid')
      return json({ error: `request is ${verdict.status}`, rule: 'signature', verdict }, 401);
    // Checked by `verifyListToolRequest`, which reads every field before it recovers the signer.
    const signed = body.request as SignedListToolRequest;
    if (signed.chainId !== chainId) {
      return json({ error: `request is for chain ${signed.chainId}`, rule: 'signature' }, 400);
    }
    if (normaliseToolUrl(signed.request.url) !== url) {
      return json({ error: 'the signed url is not the url sent', rule: 'signature' }, 400);
    }
    lister = verdict.address;
    nonce = signed.request.nonce;
  }

  const plan = () => planToolListing({ url, reads });
  let first;
  try {
    first = await plan();
  } catch (error) {
    return chainUnreadable(String(error instanceof Error ? error.message : error));
  }
  const answer = (transactions: Hex[], created: boolean) =>
    json({
      atomId: first.atomId,
      created,
      transactions,
      ...(first.repository === null
        ? {}
        : {
            repositoryAtomId: first.repository.atomId,
            sourceTriple: first.repository.sourceTripleId,
          }),
    });
  if (first.calls.length === 0) return answer([], false);

  // The cheap refusals before the network ones: the limit, then whether the URL exists, then the
  // pins. Each is checked again inside the queue, where the count is final.
  const listing = `list-tool:${first.atomId.toLowerCase()}:${nonce?.toLowerCase() ?? 'anon'}`;
  const limitOf = (value: bigint) =>
    checkListToolLimits(ledger.relevant(now(), [lister ?? ANONYMOUS_LISTER]), {
      lister,
      listing,
      value,
      now: now(),
      limits,
    });
  const early = limitOf(first.totalValue);
  if (!early.ok) return json({ error: early.reason, rule: 'limit' }, 429);
  let found;
  try {
    found = await resolveTool(url);
  } catch (error) {
    const response = json(
      {
        error: `the URL could not be checked: ${String(error instanceof Error ? error.message : error)}`,
        rule: 'resolves',
        retry: true,
      },
      503,
    );
    response.headers.set('retry-after', '60');
    return response;
  }
  if (!found.ok) return json({ error: found.reason, rule: 'resolves' }, 422);
  for (const thing of first.toPin) {
    const uri = await pinThing(thing).catch(() => null);
    if (uri !== thingUri(thing)) {
      return json({ error: `pinning ${thing.url} returned ${String(uri)}`, rule: 'pin' }, 502);
    }
  }

  return exclusive(async () => {
    if (nonce !== null && ledger.keyedWith('list-tool', `${listing}#`).length > 0) {
      return json({ error: 'this request was already used', rule: 'signature' }, 409);
    }
    let current;
    try {
      current = await plan();
    } catch (error) {
      return chainUnreadable(String(error instanceof Error ? error.message : error));
    }
    if (current.calls.length === 0) return answer([], false);
    current.calls.forEach(assertMultiVault);
    const decision = limitOf(current.totalValue);
    if (!decision.ok) return json({ error: decision.reason, rule: 'limit' }, 429);

    const sent: Hex[] = [];
    // After any earlier record of this listing, so a retry after a revert reserves fresh keys.
    const offset = ledger.keyedWith('list-tool', `${listing}#`).length;
    for (const [index, call] of current.calls.entries()) {
      const key = `${listing}#${offset + index}`;
      ledger.reserve({
        kind: 'list-tool',
        subject: lister ?? ANONYMOUS_LISTER,
        value: call.value,
        at: now(),
        key,
      });
      const result = await sendToMultiVault(call);
      if (result.status === 'unconfirmed')
        return unconfirmed('list-tool', key, result.hash, { transactions: sent });
      if (result.status !== 'success') {
        ledger.settle('list-tool', key, { status: 'reverted', hash: result.hash });
        return json({ error: `${call.why}: ${result.hash} reverted`, transactions: sent }, 502);
      }
      ledger.settle('list-tool', key, { status: 'success', hash: result.hash });
      sent.push(result.hash);
    }
    return answer(sent, true);
  });
}
