# 40 — The redesign from references, 46e: the id lookup moves into the `/agents` search

**Task:** `docs/tasks/46-the-redesign-from-references.md` (row 46e in §4)
**Completed:** 2026-11-02
**Commit:** `uncommitted` (branch `dev`)
**Verifier verdict:** PASS (`ui-reviewer` PASS with 4 advisories, 2 acted on)

## What shipped

- `apps/web/src/services/agent-lookup.ts` — `agentRefOf`: `chain/token` or `chain:token`, bare digits = Base 8453, chain 0 refused, leading zeros stripped. 5 tests in `services/__tests__/agent-lookup.test.ts`.
- `apps/web/src/pages/AgentDirectory.tsx` — one submit path: an id navigates, anything else filters. `LookupForm`, `LOOKUP_CHAINS` and the "Or open one by id" section removed.
- `apps/web/src/components/agent/CapabilitySearch.tsx` — placeholder and aria-label name both uses; input 16rem to 19rem.
- `apps/web/src/services/agent-cohort.ts` — `CohortRow.isUnsupported` (`positionCount === 0`; `null` stays "—"), 1 test.
- `apps/web/src/components/agent/CohortList.tsx` — empty Support cell with sr-only "no support".
- `apps/web/src/pages/AgentDirectory.test.tsx` — 4 RTL tests: id navigates, word filters, empty cell, no lookup form.

## Surprises

- `positionCount === null` (unreported) and `0` had to stay distinct, or an unreported market would read as "nobody supports".
- `AgentImport.tsx` keeps its own `LOOKUP_CHAINS`; only the directory's copy went.

## Decisions made

- **A digits-only input is always an id**, never a capability search — no capability is a bare number.
- **"Filter" button label kept** (reviewer advisory 1): Enter is the path for both uses.
- **BSC and Ethereum ids need the `chain/` prefix** — the bare-number default is Base because the index is Base only.

## Rules touched

- `.claude/rules/ui.md` — sufficient. No explanatory copy added; the removed section's sentence went with it.
- `.claude/rules/code.md` — sufficient. Pure parser in a service, page tested behaviourally, no `any`, no casts.
- `.claude/rules/claims.md` — sufficient. Verifier re-ran tsc -b, lint, check:tokens (all 0), prettier on the 8 changed files, and the 3 touched test files (37 tests).

## Suggestions for future tasks

- When a task file records a later user decision in §2, update the status line and the row in the same pass: 46c's row and status still say "mockups first" after variant A was chosen.
- A field that serves two queries needs both named in its accessible name, not only its placeholder.
