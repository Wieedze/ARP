# Task 10 — The directory shows the whole cohort

> **Status: COMPLETE** (2026-09-16). Branch `feat/agent-trust-panel`, commits `9c24681..26da3b8`.
> Post-mortem: `.claude/learning/11-agent-directory-full-cohort.md`. ADRs `0023` (market cap and
> position count read at one scope) and `0024` (an ambiguous identity gets no link).
> `ui-reviewer` pass at `5d9142a`; `task-verifier` pass at `26da3b8`.
>
> **One line below was verified differently than written.** The query in "The sort orders" pairs a
> term-level market cap with a curve-scoped position count, and a real row shows the two disagree —
> see ADR 0023. The orders themselves are exactly as specified and were confirmed live.
>
> Phase 1. Serves tier 2→3 of the evidence ladder: it makes the cohort navigable by what cost
> something, rather than by a number.

## Objective

`/agents` currently shows three hardcoded agents and a lookup form. Replace the hardcoded list with a
paginated view of the real cohort — **28,648 agents** — sortable only by measures of evidence, never
by score.

## Why

The three-agent starting set was the right call when nothing existed to rank by. But it makes a demo
of a 28,648-agent cohort look like a demo of three, and the lookup form only helps someone who
already knows a token id. The scale is the story; it should be visible.

Capability search is still Phase 2 and still out of scope. This is not that. This is pagination plus
two honest sort orders.

## The sort orders, and why only these two

Both are queryable today, both were verified live on 2026-09-16, and both rank by _what cost
something to produce_ — which is the argument in `docs/09` §2 turned into a sort order.

**Evidence quantity** — `order_by: {subject: {as_subject_triples_aggregate: {count: desc}}}`. How many
statements exist about this agent. Captain Dackie 41, Jeed 35, Ouro Proof-of-Compute Oracle 35,
Meerkat James 30. The cohort floor is 5 (the uniform shell), so this separates curated agents from
mirrored ones immediately.

**Economic conviction** — `order_by: {subject: {term: {total_market_cap: desc}}}`. What is staked on
the agent's own atom. AsterPay 13.02 TRUST, nekto-ramar05 by Olas 6.34, Captain Dackie 6.34.

**Do not add a sort by score.** It is the thing the panel exists to argue against, and a score column
sorted descending would undo the panel's whole editorial claim in one control.

**Label the order honestly.** Neither is a quality ranking, and the UI must say so in one short line.
"Most statements about it" is not "best".

## Deliverables

- Paginated list at `/agents`, cursor or offset, page size around 25–50. The total (28,648) is shown,
  because the scale is the point.
- The two sort controls above, default: evidence quantity.
- Each row: image (`value.thing.image` — many have one), name, the `Agent 8453:NNNN` fallback marked
  as a fallback exactly as the panel does, triple count, market cap with **position count beside it**,
  and the chain. Row links to `/agent/:chainId/:tokenId` — derive the token id from the `same as` CAIP
  edge, not from the label.
- The lookup form stays. It is the only way to reach an agent on BSC or Ethereum, where the graph has
  no trust edges.
- Empty and error states per `ui.md`: say what would normally be there and why it is not.

## Constraints

- Read-only. No writes, no staking on this page.
- Reuse the connector. If a cohort query does not belong in `@arp-protocol/erc8004`, put it in
  `app/src/services/` behind a hook — but prefer the package, since a cohort listing is exactly what
  another consumer would want. If you add it to the package, it is source-neutral like everything
  else there: a `listAgents` on `TrustSource`, optional, implemented by Intuition only.
- `ui.md` binds. Dense list, hairlines, mono for data, no cards, no gradients. A list of 25 rows should
  read as a list, not as 25 boxes.
- Do not fetch 28,648 rows. Paginate server-side; the graph supports `limit`/`offset`.
- Do not re-rank client-side across pages — that would be a lie about what the order means.

## Acceptance criteria

- [x] `/agents` lists real agents from mainnet, paginated, with the true total shown — 28,648 from
      the graph's own `triples_aggregate`, never a literal
- [x] Both sort orders work and are labelled as not being quality rankings
- [x] No sort by score anywhere — `AgentListOrder` has two members and a test asserts it
- [x] Fallback-metadata agents are marked, as they are on the panel
- [x] Position count appears wherever a market cap does — both read across every bonding curve so
      the two figures match in scope (ADR 0023)
- [x] Rows link correctly; token id comes from the CAIP edge. An atom claiming several identities
      gets no link and the reason instead (ADR 0024)
- [x] `bun run test`, `bun run lint`, `tsc -b` clean in `app/`; `bun run test` clean in `erc8004/`
- [x] Keyboard reachable, visible focus, no horizontal scroll at 400px — **assessed by reading the
      markup, not in a browser.** There is none in this environment
- [x] `ui-reviewer` pass, then `task-verifier` pass

## Out of scope

- Capability search and filtering — Phase 2.
- Any ranking that uses a provider's score.
- Cross-chain listing. BSC and Ethereum have registry entries but no trust edges; the lookup form
  covers them, a list would be empty and misleading.
