# 0074 — A tool carries one tag, at its deepest domain

**Status:** Accepted
**Date:** 2026-10-28
**Triggered by:** user request — « il ny a pas payment avant card ? reflechisson bien car cest indelebile »

## Context

The domain tree (`docs/18_THE_DOMAIN_TREE.md`) has two triple shapes: the hierarchy,
`(child, is a sub-domain of, parent)`, and the classification, `(tool, has tag, domain)`.

`stripe/agent-toolkit` sits under `card`, which sits under `payment`, which sits under `tool`. So
when a reader asks for everything under `payment`, Stripe has to come back. There are two ways to
make that true, and the question is which one gets written to the chain.

The question was asked about a schema that drew `(stripe, has tag, card)` with no `payment` beside
it, and it is the right question to ask before signing rather than after: **Intuition has no
deletion.** Every triple written is permanent. 19 of the 42 `is a sub-domain of` triples already on
testnet 13579 are junk that cannot be removed, and ARP added `card-payment` to that list an hour
before the one-word rule was stated.

## Decision

**A tool carries exactly one `has tag` triple per domain branch, naming the most specific domain it
belongs to. The ancestors are never written.**

`(stripe, has tag, card)` is written. `(stripe, has tag, payment)` and `(stripe, has tag, tool)` are
not. That Stripe is about payment is **recomputed on every read** by walking
`(card, is a sub-domain of, payment)`.

## Alternatives considered

- **Materialise every ancestor** — write `(stripe, has tag, card)`, `(stripe, has tag, payment)` and
  `(stripe, has tag, tool)`. Search becomes one query with no traversal. Rejected, and the reason is
  the question's own word: `payment` is a **derived** fact, derived from a hierarchy triple that
  anyone can contest by depositing on its counter-triple. The moment someone stakes that `card`
  belongs under something else, the hierarchy moves and the materialised copy does not — it stays,
  for ever, asserting a parent that is no longer the parent, with its own vault and its own
  positions behind it. **On an append-only graph, materialising a derivation is the one thing that
  cannot be undone when the derivation changes.** It also triples the write cost: 53 tools at three
  levels is 159 triples instead of 53.

- **Tag the top-level domain only** — `(stripe, has tag, payment)`, and let the deeper structure be
  informational. Rejected: it throws away the precision the tree exists for. A delegation scoped on
  `card` could not find Stripe, and the second level would carry no tools, which makes it decoration.

- **Write both and mark one derived** — there is no field to mark it with. A triple is three term
  ids; it carries no provenance of its own, and a convention invented for it would be invisible to
  every other reader of the graph.

## Consequences

**Positive:**

- The hierarchy is load-bearing, so it has to be paid for — which is what makes it a market rather
  than a config file. A domain whose parent triple holds no position is unreachable from that
  parent, and that is the correct behaviour, not a bug.
- A re-parenting is a single deposit on one counter-triple plus one new triple. Nothing has to be
  retracted, because nothing derived was ever written.
- 53 triples instead of 159, and the saving grows with depth.

**Negative:**

- Reading down costs a traversal before the tag query. Measured cost today: one indexer query for
  the hierarchy, then one `has tag` query with the subtree as an `_in` filter — `verify-domain-tree.ts`
  does exactly this and it is two round trips, not N.
- A tool is only findable under a parent while the chain of hierarchy triples between them all
  carry a position. One unfunded link in the middle hides everything below it. This is the same
  property as the positive above, read from the other side.

**Neutral (worth knowing):**

- This is already what is on chain: `(stripe, has tag, card-payment)` and
  `(paypal, has tag, payment)`, one tag each, written 2026-10-28 before the question was asked.
  `verify-domain-tree.ts` descending from `payment` returns both.
- A tool with two genuinely unrelated purposes gets two tags, one per branch. "One tag" is per
  branch, not per tool. No tool in the current 53 needs this yet.

## References

- Related doc: `docs/18_THE_DOMAIN_TREE.md`
- Related ADR: `.claude/choices/0042-*` (a vault's assets are not evidence of a stake; `positionCount` is)
- Related ADR: `.claude/choices/0053-*` (a term created with the fee alone has no position)
- Related ADR: `.claude/choices/0054-*` (a tool atom derives every field from its normalised URL —
  the same natural-key argument, applied there to tools and here to vocabulary)
- Record of what is on chain: `catalogue/domain-tree-13579.json`
- Proposal: `catalogue/domains.proposal.json`
