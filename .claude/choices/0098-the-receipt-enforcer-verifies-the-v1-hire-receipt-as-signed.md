# 0098 — The receipt enforcer verifies the v1 hire receipt as signed, and binds the term through its terms

**Status:** Proposed (pending `contract-reviewer`)
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
  That is deliberate: the file's header says no contract checks the signature, so naming one would
  imply an on-chain check that did not exist;
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
   calldata.** The enforcer does not check the target or the amount: compose it with
   `AllowedTargetsEnforcer` and `TrustStakeCapEnforcer`.

## Alternatives considered

- **A v2 receipt with `verifyingContract`, `termId` and `expiresAt` in the signed message.** This
  matches the task's replay wording exactly. It was not taken because it changes
  `hire-receipt.ts`, the node, and every receipt already issued, and the task was scoped to
  Solidity and to the receipt as it is signed today. It is the right next step: see Consequences.
- **Key the used set by the receipt's digest**, as the task says. Rejected because of the
  double-signing case in point 5.
- **Leave the hooks ungated**, the way `TrustStakeCapEnforcer` does. Rejected because of the
  front-run in point 7.
- **Derive the term from the agent on chain.** Not possible. The agent's atom id is derived off chain
  from its registration file (ADR `0015`), and a triple's id depends on the hirer.

## Consequences

**Positive:**

- "No proof, no deposit" is held by a contract for the agent-to-agent path. A sponsored deposit
  under this caveat cannot happen without a receipt from a node key the delegator accepted, naming
  the agent that redeems.
- The node does not change. Every v1 receipt signed today can be used.

**Negative:**

- **No verifying contract in the signed message.** The used set exists per deployment. A receipt
  consumed here can still be presented to a second verifier, such as another deployment of this
  enforcer or task 40's sponsoring service, and unlock a second sponsorship there. This closes only
  with a v2 receipt that names its verifier. Until then, run one verifier per receipt chain, or
  have the sponsoring service read `isPaymentUsed` before it pays.
- **Key rotation means signing a new delegation.** The accepted signers are fixed in `_terms` at
  signing time. A rotated node key needs a new delegation, or a new binding added next to the old
  one, up to 32 bindings.
- **The amount is not bounded by the proof.** ADR `0094` says a sponsored amount stays below the
  cost of the proof that unlocks it. This enforcer does not compare the execution's `value` with the
  receipt's `paid`, because the task does not list that check. Self-dealing is bounded only by
  `TrustStakeCapEnforcer` until it does. That check is open for the reviewer.
- **One operator running both agents can still self-deal.** ADR `0094`'s correction applies here
  too: _proven_ means a second key signed, not a second operator.

**Neutral (worth knowing):**

- Gas, measured on 2026-10-30 by `forge test --match-test test_beforeHook_acceptsAndConsumes -vvvv
  --isolate`: one `beforeHook` with one binding costs 66,247 gas in its call frame. Of that,
  `ecrecover` is 3,000, and the cold `SSTORE` that marks the payment used is about 22,100. Signature
  recovery is therefore a small part of the hook. The cost is set by the state write and by the
  ABI decode of `_terms` and `_args`.
- Signers must be EOAs. EIP-1271 is not supported, because node keys are EOAs.
- Not deployed. No transaction was sent on any chain.

## References

- Related task: `docs/tasks/43-the-receipt-enforcer.md`
- Related code: `contracts/src/enforcers/ReceiptEnforcer.sol`,
  `contracts/test/enforcers/ReceiptEnforcer.t.sol`, `packages/protocol/src/hire-receipt.ts`
- Related ADR: `0094` (§1 handshake, §2 proof as condition, §3 receiver), `0083` (the hire receipt),
  `0015` (the agent's atom)
- Related rule: `.claude/rules/security.md` (signature replay), `.claude/rules/metamask-delegation.md`
