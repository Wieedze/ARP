import {
  ANONYMOUS_LISTER,
  canonicalToolUrl,
  checkListToolLimits,
  chooseRepoSpelling,
  githubRepoOf,
  isToolUrl,
  planToolListing,
  thingUri,
  verifyListToolRequest,
  type SignedListToolRequest,
} from '@arp-protocol/core';
import type { Address, Hex } from 'viem';
import { chainUnreadable, json, type Body, type SponsorContext } from './context.ts';

/** Longer than any tool URL in the catalogue, short enough to pin and to put in a request path. */
export const MAX_TOOL_URL_LENGTH = 2_048;

/**
 * A tool listing, paid by the service (ADR `0120`, `docs/tasks/53` 53c): the tool's atom, and for a
 * skill its repository's atom and `(skill, source, repository)`. It makes a tool findable and says
 * nothing about who used it.
 *
 * The one route a browser may call, from the origins `main.ts` allows (`service.ts`). A signed
 * request counts against its address's daily limit; an unsigned one against the shared anonymous
 * cap (the user, 2026-11-03: « B quand une clé est disponible, A sinon »). All listings together
 * stay under one daily total, so fresh keys cannot spend the budget the other routes share.
 *
 * The URL is listed under its canonical spelling (`canonicalToolUrl`), with GitHub's own case for a
 * repository, so two spellings of one tool cannot mint two permanent atoms.
 */
export async function listTool(ctx: SponsorContext, body: Body): Promise<Response> {
  const { options, chainId, reads, limits, ledger, now, exclusive, assertMultiVault } = ctx;
  const { sendToMultiVault, unconfirmed } = ctx;
  const pinThing = options.pinThing ?? null;
  const resolveTool = options.resolveTool ?? null;
  if (pinThing === null || resolveTool === null) {
    return json({ error: 'tool listing is not configured on this service', rule: 'config' }, 503);
  }
  if (
    typeof body.url !== 'string' ||
    body.url.length > MAX_TOOL_URL_LENGTH ||
    !isToolUrl(body.url)
  ) {
    return json({ error: 'url is not a tool URL', rule: 'url' }, 400);
  }
  const pasted = body.url;

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
    if (canonicalToolUrl(signed.request.url) !== canonicalToolUrl(pasted)) {
      return json({ error: 'the signed url is not the url sent', rule: 'signature' }, 400);
    }
    lister = verdict.address;
    nonce = signed.request.nonce;
  }

  // Whether it exists, and under which spelling, before any id is computed from it.
  let found;
  try {
    found = await resolveTool(canonicalToolUrl(pasted));
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
  // The spelling already on the graph wins over GitHub's: the seed scripts kept skills.sh's case
  // (`chooseRepoSpelling`), and a second spelling is a second permanent atom.
  const asked = githubRepoOf(pasted);
  let repoFullName: string | undefined;
  if (asked !== null) {
    let existing: string[];
    try {
      existing = (await options.repoSpellings?.(found.fullName ?? asked)) ?? [];
    } catch (error) {
      return chainUnreadable(String(error instanceof Error ? error.message : error));
    }
    repoFullName = chooseRepoSpelling({
      asked,
      ...(found.fullName === undefined ? {} : { fullName: found.fullName }),
      existing,
    });
  }

  const plan = () =>
    planToolListing({ url: pasted, reads, ...(repoFullName ? { repoFullName } : {}) });
  let first;
  try {
    first = await plan();
  } catch (error) {
    return chainUnreadable(String(error instanceof Error ? error.message : error));
  }
  const answer = (listed: typeof first, transactions: Hex[], created: boolean) =>
    json({
      url: listed.url,
      atomId: listed.atomId,
      created,
      transactions,
      ...(listed.repository === null
        ? {}
        : {
            repositoryAtomId: listed.repository.atomId,
            sourceTriple: listed.repository.sourceTripleId,
          }),
    });
  if (first.calls.length === 0) return answer(first, [], false);

  // The limit before the pins, so a refused listing does not pin for free. Checked again inside
  // the queue, where the count is final.
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
    // A send of this tool whose outcome was lost may still land: sending again would revert, and
    // the gas is the treasury's.
    const atomPrefix = `list-tool:${first.atomId.toLowerCase()}:`;
    if (
      ledger.pending().some((r) => r.kind === 'list-tool' && (r.key ?? '').startsWith(atomPrefix))
    ) {
      return json(
        {
          error:
            'a listing of this tool was sent and not confirmed; the operator reconciles it against the chain (ledger pending())',
          rule: 'pending',
        },
        409,
      );
    }
    let current;
    try {
      current = await plan();
    } catch (error) {
      return chainUnreadable(String(error instanceof Error ? error.message : error));
    }
    if (current.calls.length === 0) return answer(current, [], false);
    current.calls.forEach(assertMultiVault);
    const decision = limitOf(current.totalValue);
    if (!decision.ok) return json({ error: decision.reason, rule: 'limit' }, 429);

    const sent: Hex[] = [];
    // After this listing's spent records. A reverted key is not spent, so a retry reuses it.
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
    return answer(current, sent, true);
  });
}
