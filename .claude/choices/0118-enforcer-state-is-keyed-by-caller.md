# 0118 — Enforcer state is keyed by its caller; a receipt's replay key names its signer

**Status:** Accepted
**Date:** 2026-11-02
**Triggered by:** `docs/tasks/59-audit-cleanup.md` stream A, the read-only audit of 2026-11-02, and
the user's decision that day: fix `TrustStakeCapEnforcer`, test it, redeploy it on testnet 13579,
leave the mainnet copy as it is. Task 59 assigned this ADR the number `0114`. That number was already
taken (`0114-one-path-per-profile-…`, task 53), so it is `0118`.

## Context

`TrustStakeCapEnforcer.beforeHook` is `public`, `_terms` is the caller's to choose, and its state was
keyed by `_delegationHash` alone. A delegation hash is not a secret. ARP publishes signed delegations
on testnet (ADR `0092`), and any redemption reveals one. So anyone could call `beforeHook` directly
with `cap = value = 2**255` and a victim's hash. Every real redemption under that delegation then
reverted `CapExceeded` for the delegation's own period, and one call per period kept it blocked.

The Task 02b review said this could not happen, in four places in `contracts/SECURITY_REVIEW.md`,
in the contract's own header, in `ReceiptEnforcer`'s header ("unlike `TrustStakeCapEnforcer`") and in
post-mortem 03. Its reasoning was _"`_delegationHash` is bound by signature upstream"_. That is true
of the hash the DelegationManager passes during `redeemDelegations`. It says nothing about who else
can call the hook. The enforcer never required its caller to be the DelegationManager, and the
review read the signature binding on the redemption path as a property of the storage slot. A
related claim, that the hook "is unreachable without a redemption" (`docs/14`, `docs/tasks/22`,
`scripts/measure/enforcer-events.ts`), came from the same mistake.

`ReceiptEnforcer` (not deployed) had a different version of the same flaw. Its hooks are gated on
`DELEGATION_MANAGER`, but its replay set was keyed by `keccak256(chainId, payment)`, one set for
every delegation. Anyone running a node key could bind that key in a delegation of their own and
sign a receipt naming a victim's payment hash. Redeeming first then made the victim's genuine
receipt revert `PaymentAlreadyUsed`.

## Decision

1. **`TrustStakeCapEnforcer` keys its state by `(msg.sender, delegationHash)`.** This is the pattern
   MetaMask's own stateful enforcers use (`LimitedCallsEnforcer.sol:16`,
   `NativeTokenPeriodTransferEnforcer.sol:34` under `contracts/lib/delegation-framework/src/enforcers/`).
   A direct caller can write only its own slot. `getState` takes the manager's address, and
   `StakeCapChecked` names its caller as its first indexed topic, so a log counts as a redemption
   only when that topic is the DelegationManager.
2. **`ReceiptEnforcer` keys replay by `(chainId, signer, payment)`**, and `isPaymentUsed` takes the
   signer.
3. **The NatSpec says the window is fixed, not rolling.** About 2 × `cap` can pass across a boundary.
4. **The mainnet copy at `0x99921C234d4Ca518DC58ba63ff9bfD2Cc9435f34` keeps the old code.** It has
   never fired: 0 `StakeCapChecked` logs, measured 2026-10-27 by `scripts/measure/enforcer-events.ts`.
   No known delegation uses it, so the defect is latent there. A mainnet redeploy is a mainnet
   deployment and needs the user's confirmation in that session (`CLAUDE.md`).

## Alternatives considered

- **Gate `TrustStakeCapEnforcer` on an immutable `DELEGATION_MANAGER`**, as `ReceiptEnforcer` does.
  This closes the grief too. Not chosen because the caller-keyed map is upstream's pattern, needs
  no constructor argument, and lets one bytecode serve any DelegationManager deployment.
- **Key `ReceiptEnforcer` replay by delegation hash** (the first suggestion in task 59). This also
  closes the grief. Not chosen because one receipt could then unlock a deposit in every delegation
  that accepts its signer, two delegators funding one payment. The signer key keeps one payment,
  one deposit, per node, across delegations.
- **Also key `ReceiptEnforcer` by `msg.sender`.** Adds nothing, because its hooks only accept
  `DELEGATION_MANAGER`.
- **Leave the event signature unchanged.** Not chosen: a v1 log cannot say whether a redemption
  produced it, and the measurement script treated every log as one.

## Consequences

**Positive:**
- A stranger cannot block a delegation's spend or a receipt's deposit.
- A `StakeCapChecked` log from the DelegationManager is now evidence of a redemption.
- `test_redemption_succeedsAfterAttackerFillsTheHashDirectly` runs the attack through the real
  `DelegationManager`. It fails on the old contract and passes now.

**Negative:**
- Two deployed copies (testnet `0x7BB5…0F8E`, mainnet `0x9992…5f34`) run code this ADR calls
  defective. The testnet copy is replaced by a redeploy and the mainnet copy is not.
- The event topic changed, from `0x0ccea75b…` to `0x16a2d870…`. A reader must query both, and
  `enforcer-events.ts` does.
- Anything that reads `getState(bytes32)` or `isPaymentUsed(uint256,bytes32)` has to change.
  Nothing in `apps/`, `packages/` or `scripts/` does today.

**Neutral (worth knowing):**
- For testnet 13579, whether the old copy was ever griefed was **not measured**, because a v1 log
  does not record its caller.
- Once the testnet redeploy happens, the new address has to reach every place that reads
  `arp.trustStakeCapEnforcer`. `deploy.sh` writes `data/deployments/13579.json`, and `README.md`'s
  address table is the one hand-written copy (grep `0x7BB56819`, 2026-11-02). Delegations signed
  against the old address keep pointing at it.

## References

- Related rule: `.claude/rules/security.md`, `.claude/rules/metamask-delegation.md`, `.claude/rules/claims.md` §1, §5
- Related doc: `contracts/SECURITY_REVIEW.md`, "Task 59"
- Related ADR: `0040`, `0055`, `0092`, `0098`
- Triggered by: `docs/tasks/59-audit-cleanup.md`
