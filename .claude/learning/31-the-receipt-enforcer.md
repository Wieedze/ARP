# 31 — The receipt enforcer: "no signed receipt, no deposit", held by a contract

**Task:** `docs/tasks/43-the-receipt-enforcer.md`
**Completed:** 2026-10-30
**Commit:** `8aa347f` on `feat/43-receipt-enforcer` (not merged, not deployed)
**Verifier verdict:** PASS

Numbered 31, not 29: sibling worktrees `wf_152303a2-e65-2`/`-3` and `wf_bda2d3c9-b23-*` already hold
two `29-*` and one `30-*`, so the next free number across the branches about to merge is 31.

## What shipped

- `contracts/src/enforcers/ReceiptEnforcer.sol` — 398 lines; verifies the v1 hire receipt as
  `hire-receipt.ts` signs it, binds signer + agent + term through `_terms`, caps `value <= paid`,
  keys replay by `(chainId, payment)`, gates all four hooks on `DELEGATION_MANAGER`.
- `contracts/test/enforcers/ReceiptEnforcer.t.sol` — 40 tests (2 fuzz), one viem-signed vector.
  Coverage re-run by the verifier: 100% lines (58/58), statements (80/80), branches (15/15),
  functions (13/13) — `forge coverage --no-match-coverage "(test|script|lib)/"`.
- `contracts/SECURITY_REVIEW.md` — threat model, Slither triage, `contract-reviewer` pass.
- ADR `0098` — Accepted for point 9 on the user's words, the rest Proposed.
- Corrections in place: `.claude/rules/security.md` (six signature sites), ADR `0083`, ADR `0094` §2
  (struck through), `packages/protocol/src/hire-receipt.ts` header (comment-only diff).

## Surprises

- The task's three replay requirements did not fit the receipt that exists: v1 has no
  `verifyingContract`, no term id, no expiry. Term and expiry moved into `_terms`; the verifier is
  the open decision.
- The task title's "no proof, no deposit" was a claim the contract cannot hold: nothing on the
  deposit chain can read a payment transaction by hash. The user decided (_« ok option 2 »_) that
  the rung holds a signature, not a payment.
- Gating hooks on `DELEGATION_MANAGER` was forced, not optional: the replay key is public, so an
  ungated hook lets a stranger burn a receipt.

## Decisions made

- **Rung holds "an accepted key signed the receipt", not "a payment was made"** — user decision,
  2026-10-30. Service of task 40 stays the payment guard; `TrustStakeCapEnforcer` bounds abuse.
  ADR: `.claude/choices/0098-the-receipt-enforcer-verifies-the-v1-hire-receipt-as-signed.md`.
- **Replay keyed by payment, not by receipt digest** — stronger than the task wording. ADR `0098` §5.
- **Missing verifying contract left open** — INFO-R1 (Medium), user's decision between v1 and v2.
  Do not deploy until taken.

## Rules touched

- `.claude/rules/security.md` — was wrong after this task ("no contract checks" the hire receipt);
  corrected under ADR `0098` point 11.
- `.claude/rules/solidity.md` — `^0.8.24` deviation again (0.8.23 pinned to the framework), INFO-R4.
- `.claude/rules/claims.md` check 5 — swept: no file on the branch says the contract holds the
  payment. Main's ADR `0094` still carries the uncorrected line 78 until this branch merges.

## Suggestions for future tasks

- Task 40 must ship the `isPaymentUsed` read on every known `ReceiptEnforcer` deployment before it
  pays; until then both replay orders are open.
- `.claude/STATE.md` has no task 43 row on this branch — add it at merge.
- The TS gates for `packages/protocol` did not run in this worktree (no `tsc`/`node` usable); the
  only TS change is inside a doc comment, so it is outside what those gates check anyway.
- When a task title states what a contract "holds", check first whether the contract can read it.
