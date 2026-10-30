# 30 — The activity bar, review of f5d1c84 and 79ad7ea (36v)

**Task:** `docs/tasks/36-the-activity-bar.md` (the "Review of `f5d1c84` and `79ad7ea`" section)
**Completed:** 2026-10-30
**Commit:** `c0d4596` on `fix/36-verified` (with `204a152`, `16c5357`)
**Verifier verdict:** PASS

## What shipped

- `apps/web/src/services/agent-feed.ts` — `timelineRows` builds both directions of the
  invocation ↔ transaction link from one join (`causeOf`, `consequencesOf`); dry and reverted sends
  keep their cause and are not consequences.
- `apps/web/src/services/__tests__/agent-feed.test.ts` — three `timelineRows` tests (per-invocation
  join, reverted, dry-then-real) and one for `agentsByWallet`.
- `apps/web/src/pages/ActivityPage.tsx`, `apps/web/src/pages/ToolCatalog.tsx` — two comments that
  misdescribed the code corrected.
- `apps/web/src/components/tool/ToolCatalogList.tsx`, `ToolCatalog.tsx` — prettier.

## Surprises

- The first fix skipped `reverted` but not `dry`. `bin/arp-sign` dry-runs by default and logs both
  runs, so every invocation got a phantom declaration with no hash. Caught by a second review, not by
  the gates: the existing dry-outranking test covered `traceInvocations`, not `timelineRows`.

## Decisions made

- nothing notable — the fix restores what the task already said the page shows.

## Rules touched

- `.claude/rules/code.md` — sufficient; the gap was a test on the sibling function, not a missing
  rule.
- `.claude/rules/claims.md` — sufficient; "three tests pin it" checked against the file (3).

## Evidence ladder

Serves the **staked** tier made legible: the page now lists under an invocation only declarations
and deposits that happened on chain, so it no longer asserts a declaration a dry run never made.

## Suggestions for future tasks

- When two functions read the same event stream (`traceInvocations`, `timelineRows`), a status
  filter tested on one must be tested on the other.
- Gates were green before the fix and after it — a join's correctness here was only caught by
  reading the diff.
- Verifier gates scope: `tsc -b`, `lint`, `test`, `check:tokens` over `apps/web` only;
  `docs/tasks/36-*.md` fails `prettier --check` on `dev` too, pre-existing and outside every gate.
- Number 29 was taken in a parallel worktree (`29-coherence-audit-28d.md`); this file took 30.
