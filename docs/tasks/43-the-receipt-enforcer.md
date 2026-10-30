# Task 43 — The receipt enforcer: "no proof, no deposit", held by a contract

**Status:** **BUILT, pending review**, 2026-10-30, on branch `feat/43-receipt-enforcer`. Not deployed.
`contract-reviewer` and `task-verifier` have not run yet. Design choices are in ADR `0098`.
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
enforcer that checks a signed receipt passed in the redemption moves the rule into a contract.
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

- Gas of signature recovery in a hook, against the rest of the redemption.
- Key rotation for the accepted signers.

## 4. Evidence ladder

Proven: this is the rung held by a contract instead of a server.
