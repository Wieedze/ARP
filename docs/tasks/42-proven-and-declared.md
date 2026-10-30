# Task 42 — Proven and declared: two figures, read from the sender of each deposit

**Status:** **PLAN**, 2026-10-30. Not started. The read can ship before task 40; it shows zero
_proven_ until the sponsoring service exists.
**ADR:** `0094` §2.
**Rules:** `code.md`, `ui.md`, `portability.md`, `claims.md`, `workflow.md`.
**Reviewers:** `ui-reviewer`, then `task-verifier`.

---

## 1. Why

A deposit made through ARP and one made from Intuition's explorer land in the same vault. The
`Deposited` event carries both `sender` and `receiver`, and Intuition's indexer serves both as
`sender_id` and `receiver_id` (checked live on `https://testnet.intuition.sh/v1/graphql`,
2026-10-30). A deposit whose `sender_id` is ARP's sponsoring address went through the proof gate.
User decision: show both, _proven_ first.

## 2. Deliverables, in order

### 42a — The read (`packages/graphql`, `packages/protocol`)

- For a tool: count deposits on its `uses` edges where `sender_id` is the sponsoring address
  (_proven_), and all others (_declared_). Read events, not positions: a position merges both, and a
  withdrawal does not say which part it takes.
- The sponsoring address is config, never a constant at module scope.

### 42b — The `/tools` columns

From the arp-28 handover, 2026-10-30. Re-grep the line numbers, because they moved during that
session.

- Remove "Paid for": it equals "Claims" for ARP-written edges, since every term is born with a
  position (ADR `0053`). Sites: `ToolCatalogList.tsx` (the `paid for` figure and its header,
  `ROW_GRID` loses a column), `tool-catalog.ts` `paidDeclarations` and its tests. Leave
  `packages/protocol/src/tool-listing.ts` `pricedEdges` alone, because the `priced-edges` order uses it.
- "Usage" is the _proven_ figure, and "Declared" the rest. The user rejected "Most used" on
  2026-10-27 for unproven edges (`tool-catalog.ts:92`), and "Usage" is now true only of proven ones.
- Do not rename `/agents`' "Claims" (`CohortList.tsx`, `agent-cohort.ts`, `AgentTrustPanel.tsx`).
  It counts a different population.

## 3. Do not do in this task

- No score, and no weighting of the two figures (ADR `0046`).
- No custom indexer: Intuition's already has `sender_id`.

## 4. Evidence ladder

It shows the _proven_ rung on screen, separate from the _staked_ one.
