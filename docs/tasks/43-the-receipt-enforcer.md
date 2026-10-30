# Task 43 — The receipt enforcer: "no signed receipt, no deposit", held by a contract

**Status:** **BUILT, `contract-reviewer` PASS, pending `task-verifier`**, 2026-10-30, on branch
`feat/43-receipt-enforcer`. Not deployed, and not to be until the open decision below is taken:
`contract-reviewer` left INFO-R1 (Medium) open on it, and recorded one Low, CR-1, documented
(`contracts/SECURITY_REVIEW.md`, "`contract-reviewer` pass"). Design choices are in ADR `0098`.
**Revised 2026-10-30** after review: the deposit's `value` is capped at the receipt's `paid`, and
what the contract rung holds is now the user's decision (_« ok option 2 »_, ADR `0098` point 9). The
title said "no proof, no deposit" until then; the contract holds a signature, not the payment.
**Open, the user's:** accept the v1 receipt's missing verifying contract, or sign a v2 receipt
(ADR `0098`, "Open decision").
Planned after task 40, which holds the rule in a service first.
**ADR:** `0094` §2, `0098`.
**Required skills:** `mms-smart-accounts-kit` (`references/delegations.md`), `ethskills`,
`secure-workflow-guide`, `guidelines-advisor`.
**Rules:** `code.md`, `solidity.md`, `security.md`, `metamask-delegation.md`, `claims.md`,
`workflow.md`.
**Reviewers:** `contract-reviewer`, then `task-verifier`.

---

## 1. Why

In task 40 the sponsoring service checks the proof, so ARP's server holds the rule. A caveat
enforcer that checks a signed receipt passed in the redemption moves **the signature half** of the
rule into a contract. The payment half stays with the service, which reads the payment transaction
(ADR `0098` point 9).
It follows the pattern of `DomainScopeEnforcer` and `TrustStakeCapEnforcer`.

## 2. Deliverables

- `ReceiptEnforcer`: in `beforeHook`, recover the signer of a receipt passed in `_args`, and check:
  - the signer is accepted (in `_terms`);
  - the receipt names the redeeming agent and the target term;
  - it is unused (keyed by its hash) and unexpired.

  Reject batch and try modes, the same as the two existing enforcers.
- Replay: nonce, chain id and verifying contract in the signed message (`security.md`, signature
  replay).
- Tests: 15 to 20, with 100% line and branch coverage, as `metamask-delegation.md` asks of an
  enforcer.

## 3. Open questions for the contract-reviewer

- Gas of signature recovery in a hook, against the rest of the redemption. **Answered**:
  `ecrecover` is 3,000 of a 66,564-gas happy-path `beforeHook`; the cold `SSTORE` (~22,100) and
  the ABI decode set the cost (`SECURITY_REVIEW.md`, Gas).
- Key rotation for the accepted signers. **Answered**: a new delegation, or a new binding next to
  the old one, up to 32 (INFO-R3).

## 4. Evidence ladder

Proven, partly. The contract rung holds "an accepted key signed the receipt", **not** "a payment
was made" (user decision, 2026-10-30, _« ok option 2 »_, ADR `0098`). The sponsoring service of task
40 stays the real guard, because it reads the payment transaction; `TrustStakeCapEnforcer` bounds
the abuse. It moves ARP up the ladder only for the signature: a second key's signature is held by a
contract instead of a server.
