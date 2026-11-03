import { checkCategoryLimits, planCategory } from '@arp-protocol/core';
import type { Hex } from 'viem';
import { chainUnreadable, isBytes32, json, type Body, type SponsorContext } from './context.ts';

/** A label is one word or a listed compound; this only bounds what is hashed and logged. */
const MAX_LABEL_LENGTH = 64;
/** A reason a reviewer reads in the weekly list (task 59 §2 item 4), not an essay. */
const MAX_REASON_LENGTH = 500;

/** What `/propose-category` keeps of each proposal it wrote, for the weekly review list. */
export type CategoryLogEntry = {
  at: number;
  label: string;
  parent: string;
  subjectId: Hex;
  reason: string;
  transactions: Hex[];
  /** `partial` when a send after the first reverted or was not confirmed: what landed is indexed. */
  status: 'complete' | 'partial';
};

/**
 * A new category, written by the service as an attestor the index reads (task 59 §2 item 3, ADR
 * `0124`). The rules are `planCategory`'s (ADR `0115`, `docs/25` §8). It refuses a label that is
 * already a category, a parent that does not climb to `tool`, a missing reason, and a skill not on
 * chain. A refusal names its rule. Then it writes the category's atom if new,
 * `(category, is a sub-domain of, parent)` and `(skill, has tag, category)`, each at
 * `cost + minDeposit`.
 *
 * Closed to browsers: the MCP server proposes, and no page does (arp-5e, task 59). Every accepted
 * proposal is logged with its reason, under a daily cap inside the budget.
 */
export async function proposeCategory(ctx: SponsorContext, body: Body): Promise<Response> {
  const { options, reads, limits, ledger, now, exclusive, assertMultiVault } = ctx;
  const { sendToMultiVault, unconfirmed } = ctx;
  const categories = options.categories ?? null;
  if (categories === null) {
    return json(
      { error: 'category proposals are not configured on this service', rule: 'config' },
      503,
    );
  }
  const { label, parent, subjectId, reason } = body;
  if (typeof label !== 'string' || label.length === 0 || label.length > MAX_LABEL_LENGTH) {
    return json(
      { error: `label is required, at most ${MAX_LABEL_LENGTH} characters`, rule: 'empty' },
      400,
    );
  }
  if (typeof parent !== 'string' || parent.length === 0 || parent.length > MAX_LABEL_LENGTH) {
    return json({ error: 'parent is required', rule: 'parent' }, 400);
  }
  if (typeof reason !== 'string' || reason.length > MAX_REASON_LENGTH) {
    return json(
      { error: `reason is required, at most ${MAX_REASON_LENGTH} characters`, rule: 'reason' },
      400,
    );
  }
  if (!isBytes32(subjectId)) return json({ error: 'subjectId is required', rule: 'skill' }, 400);

  const proposal = { label, parent, subjectId, reason };
  const plan = () =>
    planCategory(proposal, {
      reads,
      isCategory: categories.isCategory,
      isKnown: categories.isKnown,
      isTool: categories.isTool,
      compounds: categories.compounds,
      backing: { attestors: categories.attestors, depositor: ctx.wallet.address },
    });
  let first;
  try {
    first = await plan();
  } catch (error) {
    return chainUnreadable(String(error instanceof Error ? error.message : error));
  }
  if (first.status === 'refused') return json({ error: first.detail, rule: first.rule }, 422);
  const answer = (planned: typeof first, transactions: Hex[]) =>
    json({
      label: planned.label,
      parent: planned.parent,
      categoryId: planned.categoryId,
      subDomainTriple: planned.subDomainTripleId,
      tagTriple: planned.tagTripleId,
      created: transactions.length > 0,
      transactions,
    });
  if (first.calls.length === 0) return answer(first, []);

  // The parent is in the key: one cap slot per label, parent and subject, so a second parent for
  // the same label is a second proposal and not a free edge (security review, task 59).
  const key = `category:${first.label}:${first.parent}:${subjectId.toLowerCase()}`;
  const limitOf = (value: bigint) =>
    checkCategoryLimits(ledger.relevant(now()), { proposal: key, value, now: now(), limits });
  const early = limitOf(first.totalValue);
  if (!early.ok) return json({ error: early.reason, rule: 'limit' }, 429);

  return exclusive(async () => {
    const prefix = `${key}#`;
    if (ledger.pending().some((r) => r.kind === 'category' && (r.key ?? '').startsWith(prefix))) {
      return json(
        {
          error:
            'this category was sent and not confirmed; the operator reconciles it against the chain (ledger pending())',
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
    if (current.status === 'refused')
      return json({ error: current.detail, rule: current.rule }, 422);
    if (current.calls.length === 0) return answer(current, []);
    current.calls.forEach(assertMultiVault);
    const decision = limitOf(current.totalValue);
    if (!decision.ok) return json({ error: decision.reason, rule: 'limit' }, 429);

    const sent: Hex[] = [];
    // Every write that lands is logged, finished or not: the review list must see what the index
    // now reads, and a partial category is one.
    const record = (status: CategoryLogEntry['status']) => {
      if (sent.length === 0) return;
      categories.invalidate();
      categories.log({
        at: now(),
        label: current.label,
        parent: current.parent,
        subjectId,
        reason: reason.trim(),
        transactions: sent,
        status,
      });
    };
    // After this proposal's spent records. A reverted key is not spent, so a retry reuses it.
    const offset = ledger.keyedWith('category', prefix).length;
    for (const [index, call] of current.calls.entries()) {
      const recordKey = `${prefix}${offset + index}`;
      ledger.reserve({
        kind: 'category',
        subject: ctx.wallet.address,
        value: call.value,
        at: now(),
        key: recordKey,
      });
      const result = await sendToMultiVault(call);
      if (result.status === 'unconfirmed') {
        record('partial');
        return unconfirmed('category', recordKey, result.hash, { transactions: sent });
      }
      if (result.status !== 'success') {
        ledger.settle('category', recordKey, { status: 'reverted', hash: result.hash });
        record('partial');
        return json({ error: `${call.why}: ${result.hash} reverted`, transactions: sent }, 502);
      }
      ledger.settle('category', recordKey, { status: 'success', hash: result.hash });
      sent.push(result.hash);
    }
    record('complete');
    return answer(current, sent);
  });
}
