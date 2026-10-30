# 0098 — The receipt enforcer verifies the v1 hire receipt as signed, and binds the term through its terms

**Status:** Accepted for point 9 (user decision, 2026-10-30, _« ok option 2 »_); the rest Proposed, reviewed by `contract-reviewer` (PASS, 2026-10-30); one decision open
**Status, in full:** point 9, what the contract rung holds, is Accepted on the user's words,
verbatim _« ok option 2 »_: the rung holds "an accepted key signed the receipt", not "a payment was
made". Points 1 to 8, 10 and 11 are Proposed and passed `contract-reviewer` on 2026-10-30: no
Critical or High, INFO-R1 (Medium) open on the decision below, one new Low, CR-1, documented
(`contracts/SECURITY_REVIEW.md`, "`contract-reviewer` pass"). One decision is open and is the
user's: see "Open decision". Do not deploy until it is taken.
**Date:** 2026-10-30
**Triggered by:** `docs/tasks/43-the-receipt-enforcer.md`, under ADR `0094` §2 ("Later: a caveat
enforcer checks a signed receipt passed in the redemption").

## Context

Task 43 asks for a caveat enforcer that recovers the signer of a hire receipt passed in `_args`
and checks four things: the signer is accepted (in `_terms`), the receipt names the redeeming agent
and the target term, and it is unused and unexpired. It also asks for a nonce, a chain id and a
verifying contract in the signed message. The workflow that assigned the task said to verify the
receipt **as `packages/protocol/src/hire-receipt.ts` already signs it**, with Solidity changes only.

Those requirements do not all fit the receipt that exists. The v1 receipt
(`packages/protocol/src/hire-receipt.ts:72-84` for the struct, `:87-89` for the domain):

- has a domain of `{name: "ARP Hire Receipt", version: "1", chainId}` and **no `verifyingContract`**.
  That was deliberate when v1 was fixed: the file's header said no contract checks the signature,
  so naming one would imply an on-chain check that did not exist. This enforcer makes that cause
  false, which is the subject of point 11 and of the open decision;
- has **no term id**. It names the hired agent as `agentRegistry` plus `agentId`;
- has **no expiry**. It has `issuedAt`;
- uses `payment`, the payment's transaction hash, as its nonce (header section "The nonce is the
  payment").

## Decision

**Verify the v1 receipt byte for byte as it is signed today. Bind everything the receipt does not
carry through `_terms`, which the delegator signs. Accept the missing verifying contract as a known
gap, and close it with a v2 receipt later.**

1. **Format.** `hashReceipt` rebuilds the EIP-712 digest from the same domain and the same struct in
   the same field order. `test_viemVector_digestAndSignatureVerify` checks a signature that
   `signHireReceipt` produced with viem. If either side drifts, that test fails.
2. **Accepted signer, agent and term, in one binding.** `_terms` is
   `(uint256 receiptChainId, uint256 maxAge, Binding[] bindings)`, where
   `Binding = {signer, agentRegistryHash, agentId, termId}`. A receipt passes only if one binding
   names its recovered signer, its agent (`keccak256(agentRegistry)`, `agentId`) and the `termId` of
   the deposit. This is the install handshake's binding of node key to agent (ADR `0094` §1),
   written into the delegation. It also settles the part `hire-receipt.ts` leaves to a chain read:
   whether the signing key **is** agent `agentId`. At most `MAX_BINDINGS = 32` bindings, so the
   loop is bounded.
3. **Names the redeeming agent.** `receipt.requester == _redeemer`, and the deposit's `receiver` must
   also be `_redeemer`. The agent that paid is the agent that deposits, and the position is the
   agent's (ADR `0094` §3).
4. **Unexpired.** `issuedAt <= block.timestamp` and `block.timestamp - issuedAt <= maxAge`, with
   `maxAge` taken from `_terms`. The receipt carries no expiry of its own.
5. **Unused.** The used set is keyed by `keccak256(abi.encode(chainId, payment))`, **not by the
   receipt's digest** as the task wording says. Keying by payment is strictly stronger: two receipts
   for one payment (a node re-signing with a different `issuedAt`) have different digests and would
   both pass a digest key. Here one payment unlocks one deposit, which is the invariant the receipt
   header already states.
6. **Chain id.** The domain's `chainId` is taken from `_terms` (`receiptChainId`, the chain the
   payment was made on), so a receipt from another chain recovers to a different address and is
   refused.
7. **Hooks are gated on `msg.sender == DELEGATION_MANAGER`.** This is a departure from
   `TrustStakeCapEnforcer`, and it is forced. The replay key is public: anyone can read it from a
   pending redemption. An ungated `beforeHook` would let a stranger call it first with the same
   arguments and burn the receipt.
8. **The execution must be a `deposit(address,bytes32,uint256,uint256)` with exactly 132 bytes of
   calldata.** The enforcer does not check the target or the cumulative amount: compose it with
   `AllowedTargetsEnforcer` and `TrustStakeCapEnforcer`.
9. **What the contract rung holds: "an accepted key signed the receipt", not "a payment was made".**
   User decision, 2026-10-30, verbatim _« ok option 2 »_. `payment` and `paid` are values the signer
   asserts; nothing in the enforcer reads the payment transaction, and a contract on the deposit's
   chain cannot read a transaction by hash at all. So:
   - the **sponsoring service of task 40 stays the real guard** on payment, because it reads the
     payment transaction (`docs/tasks/40-the-sponsoring-service.md` §40c);
   - **`TrustStakeCapEnforcer` bounds the abuse**: an accepted key that signs a receipt for a payment
     that never happened unlocks at most the cap per period;
   - nothing written about this enforcer, in code, review, task or ADR, says it holds the payment.
     ADR `0094` §2's "so 'no proof, no deposit' is held by a contract" is struck through in place
     for this reason.
10. **The deposit's `value` is at most the receipt's `paid`.** `_depositTerm` decodes the value with
    `ExecutionLib.decodeSingle`, and `beforeHook` reverts with `DepositExceedsPaid(value, paid)`
    after the binding check, so a tampered receipt still fails as `SignerNotAccepted`. Because of
    point 9, this bounds the deposit by what the signer **states** was paid, which is ADR `0094`'s
    "a sponsored amount stays below the cost of the proof" as far as a contract can hold it. The
    service holds the rest by comparing `paid` with the payment it reads. `paid` is the payment
    chain's native wei, so the bound means something only when `receiptChainId == block.chainid`
    (CR-1, Low, documented in the contract header).
11. **Rule change, `.claude/rules/security.md` signature replay.** The rule's site list said five,
    and said of both receipts that they carry no verifying contract "with cause — no contract checks
    them". With this enforcer that is false for the hire receipt. The rule now lists six sites,
    `ReceiptEnforcer` the sixth, keeps the cause for the content receipt only, and names the hire
    receipt's missing verifier as a deviation open under this ADR. The same correction is in
    `packages/protocol/src/hire-receipt.ts`'s header and, struck through in place, in ADR `0083`.

## Alternatives considered

- **A v2 receipt with `verifyingContract`, `termId` and `expiresAt` in the signed message.** This
  matches the task's replay wording exactly. It was not taken because it changes
  `hire-receipt.ts`, the node, and every receipt already issued, and the task was scoped to
  Solidity and to the receipt as it is signed today. It is one side of the open decision below.
- **The rung holds the payment.** Not possible without reading the payment, which a
  contract on the deposit's chain cannot do by hash; it would need an oracle or a cross-chain proof.
  Not taken: user decision, point 9.
- **Key the used set by the receipt's digest**, as the task says. Rejected because of the
  double-signing case in point 5.
- **Leave the hooks ungated**, the way `TrustStakeCapEnforcer` does. Rejected because of the
  front-run in point 7.
- **Derive the term from the agent on chain.** Not possible. The agent's atom id is derived off chain
  from its registration file (ADR `0015`), and a triple's id depends on the hirer.

## Consequences

**Positive:**

- "No signed receipt, no deposit" is held by a contract for the agent-to-agent path. A sponsored
  deposit under this caveat cannot happen without a receipt from a node key the delegator accepted,
  naming the agent that redeems, for no more than the receipt says was paid. Whether the payment
  happened is still the service's check (point 9).
- The node does not change. Every v1 receipt signed today can be used.

**Negative:**

- **No verifying contract in the signed message. Rated Medium** (`SECURITY_REVIEW.md` INFO-R1,
  re-rated from Info on 2026-10-30). The used set exists per deployment. One payment can be
  sponsored once by task 40's service and once by this enforcer, or once by each of two
  deployments, because the signature names neither. Both sponsorships are ARP's funds.

  **The service-side mitigation, made explicit.** Before it pays, the sponsoring service calls
  `isPaymentUsed(chainId, payment)` on every `ReceiptEnforcer` deployment it knows, and refuses if
  any returns true. It also writes the payment to its own used set. That closes the order
  _enforcer first, service second_. It does **not** close _service first, enforcer second_: the
  enforcer cannot read the service's ledger, and its hooks are gated to the DelegationManager, so
  the service cannot mark a payment used there. In that order the bound is `TrustStakeCapEnforcer`'s
  cap on the delegation, and the second sponsorship is at most `paid` (point 10). One deployment per
  receipt chain keeps the deployment-to-deployment case closed by construction.
- **The mitigation is a requirement on task 40, not a property of this contract.** Until task 40
  ships with the `isPaymentUsed` read, both orders are open.
- **Key rotation means signing a new delegation.** The accepted signers are fixed in `_terms` at
  signing time. A rotated node key needs a new delegation, or a new binding added next to the old
  one, up to 32 bindings.
- **The amount is bounded by `paid` as signed, not as paid** (point 10). A key that lies about
  `paid` lies about the bound too. That case is the service's to catch, and the cap's to bound.
- **One operator running both agents can still self-deal.** ADR `0094`'s correction applies here
  too: _proven_ means a second key signed, not a second operator.

**Neutral (worth knowing):**

- Gas, measured on 2026-10-30 by `cd contracts && forge test --match-test
  test_beforeHook_acceptsAndConsumes -vvvv --isolate`, after the value check was added: one
  `beforeHook` with one binding costs 66,564 gas in its call frame (66,247 before it). Of that,
  `ecrecover` is 3,000, and the cold `SSTORE` that marks the payment used is about 22,100. Signature
  recovery is therefore a small part of the hook. The cost is set by the state write and by the
  ABI decode of `_terms` and `_args`.
- Signers must be EOAs. EIP-1271 is not supported, because node keys are EOAs.
- Not deployed. No transaction was sent on any chain.

## Open decision (the user's, not taken here)

**The v1 receipt names no verifying contract. Accept the deviation, or sign a v2 receipt?**

- **Accept the deviation.** Keep v1. The service-side mitigation above is a requirement on task 40,
  one `ReceiptEnforcer` is deployed per receipt chain, and the _service first, enforcer second_
  order stays open, bounded by `TrustStakeCapEnforcer` and by `paid`. `security.md` records the
  deviation as accepted.
- **A v2 receipt.** `hire-receipt.ts` signs a domain with `verifyingContract`, and each verifier
  accepts only receipts that name it: the enforcer its own address, the service an address of its
  own. One receipt then unlocks one sponsorship anywhere. Costs a node change and a version bump,
  and v1 receipts already issued stay usable only where v1 is still accepted.

Until the user decides, the enforcer verifies v1 and the gap is rated Medium.

## References

- Related task: `docs/tasks/43-the-receipt-enforcer.md`
- Related code: `contracts/src/enforcers/ReceiptEnforcer.sol`,
  `contracts/test/enforcers/ReceiptEnforcer.t.sol`, `packages/protocol/src/hire-receipt.ts`
- Related ADR: `0094` (§1 handshake, §2 proof as condition, §3 receiver), `0083` (the hire receipt),
  `0015` (the agent's atom)
- Related rule: `.claude/rules/security.md` (signature replay, amended by point 11),
  `.claude/rules/metamask-delegation.md`
- Corrected in place: ADR `0083` ("no contract checks it"), ADR `0094` §2 ("held by a contract")
