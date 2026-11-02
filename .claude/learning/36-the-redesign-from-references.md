# 36 — The redesign from references, 46a: `/tools` pages its list

**Task:** `docs/tasks/46-the-redesign-from-references.md` (§3 only; 46b–46f proposed, not started)
**Completed:** 2026-11-02
**Commit:** `21eb064` (branch `feat/46-tools-pagination`)
**Verifier verdict:** PASS

## What shipped

- `apps/web/src/services/tool-catalog.ts` — `pageOfTools` (pure slice, clamps an offset past the end to the last page) and `TOOL_PAGE_SIZE = 25`, matching `COHORT_PAGE_SIZE` in `hooks/use-agent-cohort.ts:22`.
- `apps/web/src/pages/ToolCatalog.tsx` — pages the ranked list; order, index, domain toggle and clear reset to page 1; header "In the list" box and its `Fact` helper removed, the pager's `1–25 of N` carries the shown count.
- `apps/web/src/services/__tests__/tool-rank.test.ts` — 4 `pageOfTools` tests (slice, short last page, clamp, empty).
- `apps/web/src/pages/ToolCatalog.test.tsx` — 4 RTL tests: 25 rows and stepping, reset on order, index, domain/clear.
- `.claude/STATE.md` — row 46.

## Surprises

- The header count was not lost, it moved: the old box already counted what is shown (after index and domain filter), so the pager label is the same figure with no second site to drift.

## Decisions made

- **Variant A minus two parts** — smaller title and `—` for zeros left out because each reverses an earlier user decision (88px display, blank zero in `ToolCatalogList.tsx`). No ADR: no ui.md rule relaxed.
- **Clamp, not empty page** — a filter shrinking under page 9 shows the last page, not a page that reads as "nothing matches".
- **Focus on last-page Next disable left as is** — parity with `AgentDirectory`, user judged it unnecessary.

## Rules touched

- `.claude/rules/ui.md` — sufficient; no rule relaxed, custom modules untouched.
- `.claude/rules/code.md` — sufficient; pure service + behavioural tests, mutation-checked (removing the resets fails 3 of 4).
- `.claude/rules/claims.md` — sufficient; the 662 / 54,915px figures name chain 13579, date and viewport.

## Suggestions for future tasks

- 46b–46f: one ADR per ui.md rule a page relaxes, before building; the proposal table in §4 already names which ones do.
- 46e's `—` for empty positions must be decided together with `/tools`' blank-zero rule, or the two lists disagree.
