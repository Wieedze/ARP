# 39 — The redesign from references, 46b: the agent page takes the skill page's layout

**Task:** `docs/tasks/46-the-redesign-from-references.md` (row 46b in §4)
**Completed:** 2026-11-02
**Commit:** `48d30fa` (branch `feat/46-tools-pagination`)
**Verifier verdict:** PASS (first pass; `ui-reviewer` FAIL round 1 on 4 stale comments, PASS round 2)

## What shipped

- `apps/web/src/pages/AgentTrustPanel.tsx` — eyebrow, sigil + `h1` + avatar; lg grid with description and `SectionTabs` left, `Panel label="Identity"` right; `AtomMarket` full width in `actionCardClass`, `AgentDeclareCard`, then `Block title="Relations"` with `AgentClaims`. Declarations tab, "Graph read from" line and the CAIP-19 under the name removed.
- `apps/web/src/components/agent/tab-ids.ts` — `initialSectionOf`: linked tab, else first with count > 0, else first.
- `apps/web/src/components/agent/__tests__/tab-ids.test.ts` — 4 tests.
- Comments in `SectionTabs.tsx`, `AgentClaims.tsx`, `AgentIdentityPanel.tsx` follow the new order.

## Surprises

- The Declarations tab did not need a new home: the skill page already closes on `Block title="Relations"`, so following its layout turned the tab into that block.
- The mainnet declare sentence the row proposed to drop lives in shared `DeclareUse` (skill and atom pages too, asserted in `AtomPanel.test.tsx`). Deferred to the user rather than changed on three pages.
- The market lost its `<h2>Support</h2>`; the skill page has none either, so this matches the reference rather than regressing from it.

## Decisions made

- **Absent count is not zero** in `initialSectionOf`, so Endpoints (no count) is never picked as "has rows".
- **Tab order Capabilities, Ratings, Endpoints** — the tab with rows comes first in the ordinary case.

## Rules touched

- `.claude/rules/ui.md` — sufficient; two-column detail view already amended by ADR `0104`.
- `.claude/rules/code.md` — sufficient. No `any`, no new casts, no dead code. The page itself has no behavioural test; the new logic is extracted and tested.
- `.claude/rules/claims.md` — sufficient. Gates scoped to `apps/web`; verifier re-ran tsc, lint, check:tokens, prettier, and 81 tests over `src/components/agent` and `src/pages`.

## Suggestions for future tasks

- Before removing copy from a page, grep whether the component is shared; a "drop this sentence" row can be a three-page change.
- When following another page's layout, diff the heading outline against it, not only the grid.
- Open: phone reading order, where Identity follows the open tab below lg.
