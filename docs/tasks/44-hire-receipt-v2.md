# Task 44 — Hire receipt v2: the receipt names the contract that verifies it

**Status:** **PLAN**, 2026-10-30. Not started. After task 39 is merged into `dev` (both touch
`apps/node`). Task 43's `ReceiptEnforcer` is then aligned on v2.
**ADR:** `0094`, `0083` (the v1 receipt), and task 43's ADR.
**Rules:** `code.md`, `security.md` (signature replay), `claims.md`, `workflow.md`.
**Reviewers:** `contract-reviewer` (for the enforcer side), then `task-verifier`.

---

## 1. Why

The v1 hire receipt (`packages/protocol/src/hire-receipt.ts`) carries no `verifyingContract`. A
receipt accepted by task 43's enforcer could also be accepted by task 40's sponsoring service, so
one payment could be sponsored twice. User decision, 2026-10-30: a v2 receipt that names its
verifier, rather than accepting the risk.

## 2. Deliverables

- A v2 EIP-712 domain and struct in `hire-receipt.ts`: `verifyingContract`, the target `termId`,
  and `expiresAt`, beside the v1 fields. v1 stays readable; new receipts are v2.
- The node signs v2 (`apps/node`).
- `ReceiptEnforcer` verifies v2 only, and the sponsoring service accepts a receipt only when it
  names the service's own verifier address.
- `security.md`'s list of signature sites is updated (claims.md check 5: grep "no contract checks").
- Unit tests for v1 read-compatibility, v2 signing and verification, and the cross-verifier
  rejection.

## 3. Do not do in this task

- No deployment and no transaction.

## 4. Evidence ladder

Proven: one payment unlocks one sponsorship, on either path.
