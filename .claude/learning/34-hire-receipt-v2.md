# 34 — Hire receipt v2: the receipt names the contract that verifies it

**Task:** `docs/tasks/44-hire-receipt-v2.md`
**Completed:** 2026-11-02
**Commit:** `6145977` on `feat/44-hire-receipt-v2` (not merged, not deployed)
**Verifier verdict:** PASS (second pass; the first returned a four-item punch list)

Numbered 34, not 33: sibling worktree branches already hold `32-*` twice and `33-the-account-page`.

## What shipped

- `packages/protocol/src/hire-receipt.ts` — v2 domain `{name, version "2", chainId,
  verifyingContract}`, struct adds `termId` + `expiresAt` after v1's fields; v1 types/domain kept
  for recovery only; `signHireReceipt` signs v2 only; `hireReceiptIsFor(signed, verifier, now)`.
- `apps/node/src/task.ts`, `node.ts` — `POST /task` requires `verifier` and `termId`; signs v2 with
  `expiresAt = issuedAt + AGENT_NODE_RECEIPT_TTL` (default 86,400 s).
- `contracts/src/enforcers/ReceiptEnforcer.sol` — v2 only, domain names `address(this)`, new
  `ReceiptTermMismatch` and `ReceiptPastExpiry`. Verifier re-ran: 48 tests green, coverage 100%
  (61/61 lines, 17/17 branches, 13/13 functions).
- `packages/protocol/src/sponsor/proof.ts`, `apps/sponsor/src/service.ts` — service accepts a hire
  receipt only when it names its sponsoring account as `receiptVerifier`, for the deposit's term,
  unexpired.
- `.claude/rules/security.md` — signature-site list now says the hire receipt names its verifier.
- ADR `0101`; ADR `0098`'s open decision marked answered; `SECURITY_REVIEW.md` "Task 44: v2 receipt".
- Gates re-run by the verifier, scope named: `forge test` 65/65 over `contracts/test`;
  `packages/protocol` vitest 811 pass + tsc; `apps/node` 55 pass + tsc; `apps/sponsor` 42 pass +
  tsc; `check:scripts` (tsc over `scripts/**/*.ts`) exit 0; `test:scripts` 17 pass.

## Surprises

- The first verifier pass failed on claims.md check 5, not on code: INFO-R1 was closed in the new
  section but still read "open … Do not deploy until it is taken" in three older sites of the same
  `SECURITY_REVIEW.md`. The closure landed in one place out of four.
- Task 43's status line dated the closure to the user's decision (2026-10-30) rather than to the
  task that carried it out (2026-11-02). Decision date and closure date are two facts.

## Decisions made

- **Verifier chosen by the hirer, signed by the node** — the node signs whatever `verifier` it is
  asked; each verifier refuses a receipt naming someone else. ADR `0101`.
- **Service's verifier is its sponsoring EOA** — no contract exists for it, so the account address
  is the name it accepts. ADR `0101`.
- **Two expiries hold together** — the delegator's `maxAge` and the node's signed `expiresAt`.

## Rules touched

- `.claude/rules/security.md` — updated (hire receipt now carries `verifyingContract`).
- `.claude/rules/claims.md` — sufficient; check 5 is what caught the stale INFO-R1 sites.

## Suggestions for future tasks

- When a finding closes, grep its ID (`INFO-R1`) across `contracts/`, `docs/`, `.claude/choices/`
  before the first verifier run, and read every hit; append-only post-mortems are the only hits to
  leave alone.
- A node still signs two receipts for one payment if its ledger fails; v2 makes each usable at one
  verifier, not the payment usable once overall. Keep that sentence wherever "one payment, one
  sponsorship" is claimed.
- Caller still owes: task 44 completion note, `.claude/STATE.md` update, and
  `bun run scripts/build/build-claude-index.ts` for this post-mortem.
