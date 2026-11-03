# 0124 — The sponsor writes an accepted category, and the index reads the sponsor too

**Status:** Accepted
**Date:** 2026-11-03
**Triggered by:** `docs/tasks/59` §2 item 3, and the user's decision on the question PR #56 left
open, 2026-11-03: « L'index lit aussi le sponsor ».

## Context

Task 59 lets an agent propose a category when none of the existing ones fits a skill (ADR `0115`,
`docs/25` §8). The rules are `planCategory` (`packages/protocol/src/declare/category.ts`, PR #56).
Someone has to pay for and write the three terms of an accepted proposal: the label's atom if new,
`(category, is a sub-domain of, parent)` and `(skill, has tag, category)`. On testnet that is ARP's
sponsoring service, as for every write a tester does not pay for.

**The index is read through positions, not through who created a term.** `has tag` and the
hierarchy are permissionless to write, so the web app and the MCP server read only the filings one
chosen account holds a position on: the attestor `0x906f3A52ec089f8D4E9127F91C6bE5Ae0d18f91f`
(`apps/web/src/services/domain-filter.ts`, `apps/mcp/src/config.ts`). The sponsor holds its
positions as `0xE596096F4176b682E300d73963e7B04B383C1AA1`. A category the sponsor wrote would
therefore be on chain and invisible to ARP's own index.

## Decision

**The index reads two accounts: the attestor and the sponsor.** The list is
`ARP_DOMAIN_ATTESTORS` in `packages/protocol/src/arp`. The web app, the MCP server and the sponsor's
own category check read the tree through all of them. arp-5e builds the reader change in task 59 and
cites this ADR.

Why this is narrow: the sponsor holds positions on hierarchy and `has tag` terms only where it
created them, and only `/propose-category` creates them. `/list-tool` writes a tool's atom and
`source`, `/identity` writes `same as`, `has type` and `implement`, `/deposit` creates and supports
`uses`, and `/publish` writes the delegation register's `delegate to` and `in context of`. None of
those is an index predicate. So adding the sponsor to the set admits exactly
the categories this route wrote and nothing else.

**`POST /propose-category`, testnet 13579 only.** Body `{label, parent, subjectId, reason}`. The
service runs `planCategory` with the tree read through the attestor set and the compounds of
`data/catalogue/domains.proposal.json`. A refusal answers 422 and names its rule: `empty`, `hyphen`,
`compound`, `reason`, `exists`, `parent` or `skill`. An accepted proposal writes the missing terms
at `cost + minDeposit` (ADR `0053`) under a daily cap, `SPONSOR_CATEGORIES_PER_DAY`, default 10,
inside ADR `0092`'s budget. Each written proposal is logged for the weekly review list (task 59 §2
item 4): label, parent, skill, reason and transactions.

**A term that exists but that no attestor backs is backed, not skipped.** The index reads positions,
so an existing `is a sub-domain of` or `has tag` triple with no position from the attestor set is
invisible: 44 of the 66 hierarchy triples on testnet 13579 were, `branding → design` among them
(measured 2026-11-03 by `intuition-integrator`). The plan (`planCategory`'s `backing`) gives such a
term a `minDeposit` deposit from the sponsor, held by the sponsor. Without it the route would answer
`created: true` and the category would stay hidden.

**Hardened on review, before it shipped** (security review, 2026-11-03):
- A label is NFKC-normalised, then must be lowercase letters a to z, digits and single spaces
  (`charset`). That refuses invisible characters, look-alikes from other scripts, and the `#` and
  `:` the ledger keys use: a `#` in a label had let every proposal count as one against the cap.
- The cap counts one slot per label, parent and subject. A second parent for the same label is a
  second proposal, not a free edge.
- A label already in the tree in any state is refused as `exists`, not only one that reaches
  `tool`. A tied, unparented or cyclic node does not get an extra parent chosen by the proposer. A
  truncated tree read refuses rather than guesses, and the cached tree is dropped after a write.
- The subject must be a skill or tool (a `Thing` whose `url` is a tool URL), not any term on chain.
- Every write that lands is logged, finished or not (`status: partial`), so the review list sees
  what the index now reads.

**Closed to browsers.** The MCP server proposes and no page does (arp-5e, task 59), so this route
keeps ADR `0116`'s refusal of any `Origin`.

## Alternatives considered

- **The sponsor signs categories with the attestor's key.** The index stays one account, but that
  key would then sign automatically from a running service. Refused (the user).
- **One key for both.** That means moving the treasury and changing `sponsor.key`, and the sponsor's
  history stays under the old address. Refused (the user).
- **Leave the index on one account.** Every category the sponsor wrote would be invisible, so the
  route would spend for nothing.

## Consequences

**Positive:**

- A proposal accepted by the rules becomes a category every reader of ARP's index sees, with no key
  added to a running service.

**Negative:**

- **The index now trusts the sponsor's positions.** A future route that makes the sponsor deposit on
  a `has tag` or hierarchy triple would put that triple in the index. Any such route has to say so
  in its own ADR.
- **The sponsor deposits on existing index triples, through this route only.** That is what makes a
  category it accepts visible, and it is bounded by the same cap and rules as a creation. No other
  route deposits on a `has tag` or `is a sub-domain of` triple, and the sponsor grants no deposit
  approval to anyone. Both are what the narrowness above rests on.
- **The log stores the label and reason as given.** They are JSON-escaped, so a line cannot break,
  but whatever renders the weekly list must escape them for a terminal or a page.
- **The rules cannot see meaning** (ADR `0115`). A well-formed but pointless category passes, so it
  is retired through the existing path after the weekly review. The daily cap bounds how many.
- `security.md`'s signing table gains a row.

**Neutral (worth knowing):**

- Mainnet needs a new ADR: the sponsor writing as an attestor is a testnet licence (ADR `0092`).
