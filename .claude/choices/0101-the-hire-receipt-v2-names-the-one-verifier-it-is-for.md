# 0101 — The hire receipt v2 names the one verifier it is for, and the hirer chooses it

**Status:** Proposed; the v2 receipt itself is the user's decision (2026-10-30), the shape is this task's
**Date:** 2026-11-02
**Triggered by:** `docs/tasks/44-hire-receipt-v2.md`, answering ADR `0098`'s open decision.

## Context

ADR `0098` left one decision to the user: keep the v1 hire receipt, which names no
`verifyingContract`, or sign a v2 that does. With v1 a receipt consumed by `ReceiptEnforcer` is not
consumed at the sponsoring service (`apps/sponsor`), or at a second enforcer deployment, so one
payment could be sponsored twice from ARP's funds (`contracts/SECURITY_REVIEW.md` INFO-R1, Medium).
The user chose v2 (`docs/tasks/44-hire-receipt-v2.md` §1). What v2 had to settle on top of that:
which address the service names, who picks the verifier, how v1 is treated, and where expiry lives.

## Decision

1. **Domain** `{name: "ARP Hire Receipt", version: "2", chainId, verifyingContract}`. **Struct** is
   v1's nine fields in v1's order, then `bytes32 termId`, `uint256 expiresAt`
   (`packages/protocol/src/hire-receipt.ts`, `HIRE_RECEIPT_TYPES`; the same string is
   `ReceiptEnforcer.RECEIPT_TYPEHASH`).
2. **The hirer picks the verifier and the term; the node signs what it is asked.** `POST /task`
   requires `verifier` (an address) and `termId` (32 bytes) and refuses the request with 400 before
   any chain read without them. The node cannot know which sponsorship path the hirer will take.
   Naming a verifier the hirer did not ask for only produces a useless receipt, and the verifier is
   what refuses it.
3. **The service's verifier address is its sponsoring account** (`wallet.address`), published as
   `receiptVerifier` in `GET /`. The service has no contract. Its account is the one address that
   already identifies it on chain and that no enforcer deployment can share.
4. **Each verifier accepts only a receipt that names it.** The enforcer gets this for free: its
   digest uses `address(this)`, so a receipt for anything else recovers to a different key and
   fails as `SignerNotAccepted`. The service checks it explicitly, with `hireReceiptIsFor`
   (version 2, `verifyingContract` equal to its own, not past `expiresAt`), and then that
   `termId` is the deposit's.
5. **v1 stays readable, and unlocks nothing.** `verifyHireReceipt` still recovers a v1 signer, so a
   receipt issued before task 44 can still be checked by a stranger. `signHireReceipt` signs v2 only.
   The enforcer reverts `UnknownReceiptVersion(1)` and the service refuses with "a v1 receipt names
   no verifier".
6. **Two expiries, both enforced.** `expiresAt` is the node's own bound, `issuedAt +
AGENT_NODE_RECEIPT_TTL` (default 86,400 s). The enforcer keeps the delegator's `maxAge` from
   `_terms` as well. The receipt has to satisfy both.
7. **One cross-implementation vector, checked on both sides.** `contracts/test/enforcers/ReceiptEnforcer.t.sol`
   (`test_viemVector_digestAndSignatureVerify`) and `packages/protocol/test/hire-receipt.test.ts`
   ("the vector ReceiptEnforcer.t.sol holds") assert the same digest
   `0xa97f63e5…4bb7` and the same signature bytes for one receipt. The Solidity test deploys the
   enforcer at the vector's `verifyingContract` with `deployCodeTo`. A drift in the struct, its order
   or the domain now fails in TypeScript too, not only in Solidity.

## Alternatives considered

- **Keep v1 and rely on `isPaymentUsed` reads** (ADR `0098`'s first option). Rejected by the user.
- **The node chooses the verifier** (one fixed in its config). Rejected: the node cannot know which
  path the hirer takes, and one node serves hirers on either path.
- **Sign one receipt naming several verifiers.** Defeats the purpose: each verifier's used set is
  its own, so a receipt valid at two verifiers is sponsored twice.
- **A dedicated contract address for the service**, so its verifier is a contract. No such contract
  exists and none is needed; an address no one else can use is enough for EIP-712 separation.
- **Drop `maxAge` from the enforcer now that the receipt carries `expiresAt`.** Rejected: `maxAge`
  is the delegator's bound and `expiresAt` the node's. The delegator should not depend on the node's.

## Consequences

**Positive:**

- One receipt unlocks one sponsorship, at the verifier it names. INFO-R1 is closed, and the
  service no longer needs to read every enforcer deployment before it pays.
- The receipt names the term the deposit will be on, so the service and the enforcer both check
  that the receipt was issued for this deposit.

**Negative:**

- A v1 receipt already issued unlocks nothing anywhere. All of them are testnet receipts; none has
  been accepted by the enforcer, which is not deployed.
- `POST /task` now takes two more required fields. A hirer written against v1 gets a 400.
- One payment gets one receipt only as far as the node's `PaymentLedger` holds. A dishonest node
  can sign two receipts for one payment, naming two verifiers, and both are used. The two
  signatures over one payment hash are the evidence against it.

**Neutral (worth knowing):**

- `ReceiptEnforcer.hashReceipt` is `view` now (it reads `address(this)`), not `pure`.
- Gas, `cd contracts && forge test --match-contract ReceiptEnforcerTest --gas-report`, 2026-11-02:
  deployment 1,125,098 gas (was 1,085,111). Happy path `beforeHook` 67,190 gas in its frame
  (was 66,564), by `forge test --match-test test_beforeHook_acceptsAndConsumes -vvvv --isolate`.
- Not deployed. No transaction on any chain.

## References

- Task: `docs/tasks/44-hire-receipt-v2.md`
- Code: `packages/protocol/src/hire-receipt.ts`, `packages/protocol/src/sponsor/proof.ts`,
  `apps/node/src/task.ts`, `apps/sponsor/src/service.ts`, `contracts/src/enforcers/ReceiptEnforcer.sol`
- Related ADR: `0098` (the open decision this answers), `0083` (the v1 receipt), `0094`, `0096`
- Related rule: `.claude/rules/security.md` (signature replay)
- Review: `contracts/SECURITY_REVIEW.md`, "Task 44: v2 receipt"
