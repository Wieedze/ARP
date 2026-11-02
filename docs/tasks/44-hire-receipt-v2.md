# Task 44 — Hire receipt v2: the receipt names the contract that verifies it

**Status:** **IMPLEMENTED, not yet verified**, 2026-11-02, branch `feat/44-hire-receipt-v2`. ADR
`0101` records the shape; ADR `0098`'s open decision is answered (v2). Still owed: the
`contract-reviewer` pass on the enforcer change, then `task-verifier`. (Was: **PLAN**, 2026-10-30,
after task 39; task 43's `ReceiptEnforcer` then aligned on v2.)
**ADR:** `0094`, `0083` (the v1 receipt), task 43's ADR `0098`, and this task's `0101`.
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
