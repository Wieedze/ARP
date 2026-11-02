# 42 — The journeys: what a visitor meets, and the conventions they expect

**Task:** `docs/tasks/48-the-journeys.md`
**Completed:** 2026-11-02
**Commit:** `uncommitted` (branch `feat/48-journeys`, from `dev` after PR #29)
**Verifier verdict:** PASS on round 2. Round 1 failed on two items: `useSearchShortcut` had no behavioural test (only its `isTypingTarget` predicate was tested), and the task file gave NavSplit's test count as (3) when the file had 4. `ui-reviewer` failed twice, then passed. `intuition-integrator` passed.

## What shipped

- `apps/web/src/lib/chain-choice.ts` — the app opens on testnet 13579, and a stored "mainnet" is kept. ADR `0105`.
- `apps/web/src/pages/ActivityPage.tsx`, `services/chain-facts-view.ts` — agent and tool cells link to `/atom/`, and a tool reads as name over `owner/repo`.
- `apps/web/src/components/brand/BackLink.tsx` — the way back from the skill, repo, atom and agent pages.
- `apps/web/src/pages/SearchPage.tsx`, `hooks/use-search-shortcut.ts` — `/search?q=` covers both indexes, and `/` opens it from any page.
- `packages/protocol/src/sources/intuition/index.ts` (`cohortWhere`), `packages/graphql/src/queries/agent.ts` — the cohort filter is now `$where`: membership by term id, plus an optional escaped `_ilike` on the label OR the Thing's name.
- `apps/web/src/components/brand/NavSplit.tsx` — below `md`, one 65px row with a Menu disclosure.
- `apps/web/src/services/trust-format.ts` — `shortTrust`, four significant digits, used in lists only.
- 24 `text-[10px]` and 1 `text-[9px]` labels now use `--text-label`. ADR `0106`, `ui.md` amended.

## Surprises

- Unbanged link utilities lost to the unlayered `a { color; text-decoration }` rule twice, colour first and underline next, each in its own ui-reviewer round. `check:tokens` cannot see this (`ui.md` Gates).
- Item 9 (a 15s atom page) did not reproduce in the browser: every read finished within about 2s. No code changed.

## Decisions made

- **Testnet is the default chain.** ADR `0105`.
- **Labels are at least 11px.** The `Hint` `?` glyph stays at 9px. ADR `0106`.
- **The name search matches the label OR the pinned Thing's name**, because the list shows the second. The name only narrows the result: membership is still decided by term id.

## Rules touched

- `.claude/rules/ui.md` — the label range is now 11–12px (ADR `0106`). Otherwise sufficient.
- `.claude/rules/claims.md` §5 — sufficient. A count that grew during review (NavSplit, 3 to 4) was left stale, which is the failure that section describes.

## Suggestions for future tasks

- When a hook ships with an exported predicate, test the hook rendered under a router, not only the predicate.
- When a review adds a test, update the count in the task file in the same edit.
- Any link styled by utilities gets `!` on both its colour and its decoration, and a call-site comment.

Evidence ladder: serves no tier on its own. A first visit now lands on the chain where ARP's staked tier is visible. It does not move ARP up the ladder.
