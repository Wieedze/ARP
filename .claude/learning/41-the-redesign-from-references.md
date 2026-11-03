# 41 — The redesign from references, 46c: `/activity` splits Yours from Everyone

**Task:** `docs/tasks/46-the-redesign-from-references.md` (row 46c in §4)
**Completed:** 2026-11-02
**Commit:** `2f4c63c` plus round-2 fixes, uncommitted at verification (branch `feat/46-redesign-from-references`, PR #29 to `dev`)
**Verifier verdict:** PASS on round 2 (round 1 FAIL: a retraction landed in one place of two). `ui-reviewer` FAIL then PASS; `intuition-integrator` PASS

## What shipped

- `apps/web/src/components/brand/DisplayTabs.tsx` — the view words beside the title, shared by `/tools` and `/activity`. A `null` count reads "—", never a zero.
- `apps/web/src/pages/ActivityPage.tsx` — Yours (positions, the wallet's public rows, the local runtime) and Everyone (the public table, All / Declared / Supported / Withdrawn). The view is in `?view=`, set with `replace`. A connected wallet opens on Yours. The timeline is hidden when it has no rows.
- `apps/web/src/services/chain-facts-view.ts` — `isOwnFact`: the row is yours if you signed it or `receiver` is you, compared without case.
- `packages/graphql/src/queries/recent.ts`, `packages/protocol/src/recent.ts` — the stakes query reads `receiver_id`.
- Tests: `pages/ActivityPage.test.tsx`, `services/__tests__/chain-facts-view.test.ts`, `packages/protocol/test/recent.test.ts`.
- Same branch: `AgentTrustPanel.tsx` renders the description cell only with content. `DeclareUse` turns the mainnet sentence into a "Switch to testnet" button.

## Surprises

- The public read is the latest 50 rows for everyone, not a query by wallet. So an empty Yours means "none among the latest", and the copy now says so. ui-reviewer round 1.
- intuition-integrator found ADR `0096` item 3's reason wrong. A redemption pays the share owner, so a `BOTH` approval lets a sponsor close the agent's position, not take its TRUST. The ADR was corrected with a strikethrough. The same wrong sentence survived in `packages/protocol/src/sponsor/approval.ts`, which the verifier caught in round 1: `claims.md` check 5, again.
- The comments in `recent.ts` and `chain-facts-view.ts` said the sponsor signs today. It has never run (STATE task 40).

## Decisions made

- **Yours reads `receiver_id` as well as the signer**, so a sponsored deposit (ADR `0094`) is the operator's. On testnet today every signer is its own receiver.
- **The positions move under Yours only**: they are the reader's and have no place in the global view.
- **Counts are unknown while the read is out**, never 0.

## Rules touched

- `.claude/rules/ui.md` — sufficient. No ui.md rule relaxed; the custom modules are untouched (empty diff).
- `.claude/rules/code.md` — sufficient. No `any`, no uncommented casts, the service is pure and the page is tested behaviourally.
- `.claude/rules/claims.md` — sufficient, and check 5 fired as written. The verifier re-ran, on round 2:
  - protocol tests: 822 pass;
  - protocol lint;
  - web `tsc -b` 0, lint;
  - web tests: 69 files, 718 pass;
  - prettier on the touched files.

## Suggestions for future tasks

- When a reviewer corrects an ADR's reasoning, grep the code for the same sentence before closing. Doc comments in `packages/protocol/src` are outside every gate.
- An "empty" state over a bounded window names the window. "Nothing yet" over the latest 50 rows is a claim about all rows.
