# 0040 — The cap bounds the amount, not the kind

**Status:** Accepted
**Date:** 2026-10-19
**Triggered by:** `docs/tasks/16` — found while writing down what the delegated write path is bounded by

> **Paths in this ADR predate the 2026-10-19 reorganisation.** Read `erc8004/src/…` as
> `packages/protocol/src/…` and `@arp-protocol/erc8004` as `@arp-protocol/core`. The text is left as
> written because an ADR is a record of a decision on its date; ADR `0041` carries the full mapping.

## Context

Five places in this repo said some version of:

> The triple **fee** sits outside `TrustStakeCapEnforcer`, which bounds the deposit only.

`.claude/rules/portability.md:38`, `.claude/STATE.md:108`, `.claude/choices/0036-an-agent-may-stake.md:80`,
and twice in `docs/15_ROADMAP.md` — where it is listed as **one of the two gaps testnet can never
close**. A sixth copy was about to be written into this task's roadmap update.

It is false. Measured against the contract, three independent ways:

1. `contracts/src/enforcers/TrustStakeCapEnforcer.sol:101` —
   `(, uint256 value,) = ExecutionLib.decodeSingle(_executionCallData);` and `value` is what is
   accumulated against the cap. The calldata is never decoded.
2. The contract's own NatSpec, lines 80-82: `_executionCallData` is "(target ++ value ++ callData).
   **Only `value` is consumed.**"
3. `contracts/test/enforcers/TrustStakeCapEnforcer.t.sol:174` — the test helper builds
   `ExecutionLib.encodeSingle(TARGET, value, hex"")`, with **empty calldata**, and the enforcer caps
   it. It cannot be bounding a `deposit` amount, because there is no `deposit` call in the test.

`createTriples` is payable and the fee is sent as `value`
(`erc8004/src/declare/multivault.ts`, and the same in the app's existing `redeemDeclareTriple`), so
the fee is counted against the cap like any other spend.

Nobody had checked. The claim reads plausibly — "a stake cap bounds stakes" — and it survived into a
rule file and a roadmap gap because it was never put next to the 27 lines of Solidity that answer it.
`claims.md` check 3 is about third parties; this is the same failure against our own contract, which
is worse, because the source was in the repo the whole time.

## Decision

`TrustStakeCapEnforcer` is a **native-spend cap**, and that is what it is called from now on. It
bounds total TRUST leaving the delegator per rolling window, whatever call moves it.

The real limitation is narrower and worth stating precisely, because it is still a limitation:

> **The cap bounds the amount, not the kind.** It cannot distinguish a non-recoverable fee from a
> recoverable deposit, so an agent can exhaust an operator's whole cap on term-creation fees and
> hold no position at all. 1 TRUST of cap buys either ten mainnet triples and nothing to show, or
> ten deposits that can be redeemed.

And the case that genuinely has no cap is **direct mode**: no delegation, no enforcer, no bound. That
is a property of signing with your own key, not a defect in the enforcer, and ADR `0038`'s
`totalValue` on every plan is the mitigation available — the caller sees the cost before signing.

## Alternatives considered

- **Leave the claim and note the nuance.** Rejected. It is in a rule file and a roadmap gap; a wrong
  rule is worse than a missing one, and the next session would design against a gap that is not
  there.
- **Split the cap into a fee budget and a deposit budget on-chain.** That is a contract change, and
  it is real work with a real design question (the enforcer would have to decode calldata and know
  every term-creating selector). Recorded as the honest shape of Phase 3's gap 2; not done here.
- **Say the cap is sufficient.** Rejected — it bounds the amount, and burning the whole cap on fees
  is a genuine failure mode for an operator who thought they were funding positions.

## Consequences

**Positive:**

- The delegated write path from `docs/tasks/16` is bounded by the cap for **every** call it produces,
  fees included. That is better than the repo believed, and it is now checkable.
- `docs/15`'s "two gaps testnet cannot close" is down to one-and-a-half: the mainnet domain mechanism
  is untouched, and the fee gap is narrower than stated.

**Negative:**

- A deposit cap and a spend cap are different products, and the contract is the second while its name
  suggests the first. Renaming a deployed contract is not an option; the NatSpec and every reference
  now say what it does.

**Neutral (worth knowing):**

- This changes no code. Five claims and one rule were wrong; the contract was right all along and
  has been since `docs/tasks/02b`.
- The counter-check still holds from ADR `0036`: a fee is non-recoverable and a deposit is not, so
  an operator reading "cap: 1 TRUST" should be told it is a spend cap and not an exposure limit.

## References

- Contract: `contracts/src/enforcers/TrustStakeCapEnforcer.sol:80-82, 101`
- Test: `contracts/test/enforcers/TrustStakeCapEnforcer.t.sol:152-175`
- Corrected: `.claude/rules/portability.md`, `.claude/STATE.md`, `docs/15_ROADMAP.md`,
  `.claude/choices/0036-an-agent-may-stake.md`
- Related rule: `.claude/rules/claims.md` — the same shape as check 3, against our own source
- Related ADR: `.claude/choices/0038-the-write-path-is-a-plan-not-a-transaction.md`
