# 29 — Proven and declared: two figures, read from the sender of each deposit

**Task:** `docs/tasks/42-proven-and-declared.md`
**Completed:** 2026-10-30
**Commit:** 5205b7f (branch `feat/42-proven-declared`; 4420073, e7ba809 before it)
**Verifier verdict:** PASS (second pass)

## What shipped

- `packages/graphql/src/queries/tool-listing.ts` — two documents; the sponsored one adds `proven: deposits_aggregate(where: {sender_id: {_ilike: $sponsor}})` on the support term only.
- `packages/protocol/src/tool-listing.ts` — `provenDeposits` / `declaredDeposits` per tool, summed from events; sponsor validated as 40 hex digits before it reaches `_ilike`; `pricedEdges` left alone.
- `apps/web/src/lib/sponsor.ts` — `VITE_ARP_SPONSOR_ADDRESS`, testnet 13579 only, `null` when unset or malformed. Documented in `.env.example`.
- `apps/web/src/hooks/use-tool-catalog.ts` — sponsor passed to the read and put in the query key.
- `apps/web/src/services/tool-catalog.ts` — `paidDeclarations` removed; `rankTools` "Most declared" sorts on the Declared figure, then Usage, then edge count, then stake; null ranks below a known zero.
- `apps/web/src/components/tool/ToolCatalogList.tsx` — columns Tool / Usage / Declared / Staked; row tag "named by agents".

## Surprises

- The indexer stores `sender_id` checksummed and `_eq` is case-sensitive; a null `_eq` is `validation-failed`. Hence two documents and `_ilike` behind a hex-only check.
- Round 1 failed on a sort that ordered by a figure no column showed: "Most declared" sorted on edge count while the Declared column printed deposits. Caught only by a behavioural test that reads the rendered column down.

## Decisions made

- **Usage + Declared replace Claims + Paid for**, so `ROW_GRID` keeps four columns rather than losing one; the edge count survives only as a tiebreak.
- **Mainnet has no sponsor whatever the env says** — a testnet address labelling mainnet deposits proven would be two chains in one number.
- No ADR: each choice follows ADR `0094` §2 or the task text.

## Rules touched

- `.claude/rules/ui.md` — sufficient.
- `.claude/rules/portability.md` — sufficient; the sponsor is config, not a module constant.
- `.claude/rules/claims.md` — the two indexer behaviours are dated probes in a comment, with no committed script behind them.

## Suggestions for future tasks

- When a sort is named after a column, test it by rendering the list and reading that column down, with data chosen so the wrong key prints a different order.
- Task 40 must deposit with `sender` = the address put in `VITE_ARP_SPONSOR_ADDRESS`, or Usage stays 0.

## Evidence ladder

Proven: the Usage column is the first on-screen figure on the _proven_ rung, separate from _staked_; it reads 0 until task 40's sponsoring service exists.
