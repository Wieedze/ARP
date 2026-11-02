# 35 — The activity bar, amended: every agent, from the indexer (36, 2026-11-02)

**Task:** `docs/tasks/36-the-activity-bar.md` (section "Amended 2026-11-02 — every agent, from the indexer")
**Completed:** 2026-11-02
**Commit:** `b8b650f` on `feat/36-chain-facts` (docs: `20fe5b0`, ADR `0102`, a separate user decision)
**Verifier verdict:** PASS (second pass; first FAIL on 3 items)

## What shipped

- `packages/graphql/src/queries/recent.ts`: `RECENT_STAKES_QUERY`. Reads only the claim's own vault (`type: "Triple"`), filters zero deposits in the query so `limit` counts real ones, returns the event `id`.
- `packages/protocol/src/recent.ts`: `getRecentStakes`, `RecentStake` (+ tests).
- `apps/web/src/services/chain-facts-view.ts`: `chainFacts`. Folds a deposit made in the declaring transaction into the declaration row, trims at the capped list's oldest row, uses stable keys, sorts by instant (+ tests).
- `apps/web/src/hooks/use-chain-facts.ts`: 15 s poll on the chosen chain, one status for both reads.
- `apps/web/src/pages/ActivityPage.tsx`: "On chain · every agent" first, the local feed below as "This machine" (+ tests, including both failed-read paths).

## Surprises

- A counter term's `triple` resolves to the claim it opposes. Without `type: "Triple"`, a position against a declaration would have been listed as support for it. ui-reviewer caught a wrong comment about this in round 2.
- Creating a triple can log a zero deposit. Filtering it after the read would let it consume the limit, so the filter belongs in the query.

## Decisions made

- **Fold the opening deposit into the declaration row**: same hash, same act, so one line instead of two.
- **Trim the merged list at the oldest row of any list that hit its cap**: otherwise a cut-off list reads as "none".
- **Show the signer on stakes**: the signer is not the agent, since one operator signs for several.

## Rules touched

- `claims.md`: sufficient. Figures were correct (re-derived 9 / 15 / 18 rows on 13579, 0 on 1155), but the first pass recorded no method for them and the "no against-positions" claim named no query. Reworded to name the one-off calls. A task file is not stranger-facing, so check 6 did not require a committed script.
- `claims.md` check 5: the task file's "Open" section contradicted STATE.md, edited in the same pair of commits ("/profile … not started" against "done in task 35"; "not pushed" against origin/dev).
- `code.md`: the failed-read branches of the page had no behavioural test in the first pass.

## Suggestions for future tasks

- When STATE.md is edited, reread the task file's "Open" and "Completion note" sections in the same commit. They go stale together.
- Every UI state the task file describes (here "incomplete") gets a test before review.
- A live figure written into a task file names the exact call and endpoint, even when nothing is committed.

Evidence ladder: serves the staked tier. It shows on-chain deposits behind declarations to any visitor, and does not move ARP up the ladder by itself.
