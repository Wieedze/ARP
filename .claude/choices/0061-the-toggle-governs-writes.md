# 0061 — The chain toggle governs writes, and the chain rides on the quote

**Status:** Accepted
**Date:** 2026-10-27
**Triggered by:** user request — _« si c'est du trust on paye en trust, si c'est sur testnet il n'y a que du tTRUST, car on lit **et agit** sur testnet obligatoirement, sinon aucun intérêt d'avoir un toggle »_

## Context

A mainnet/testnet toggle was added on 2026-10-27 for **reads only**, and **without an ADR** — there
is no `0059`, the number is unused, and this file is the first record of the toggle as well as of the
change to it. `lib/chain-choice.ts` stated the original scope in its own header: _"Reads only. Every
write path keeps its own explicit chain and its own guard … That separation is deliberate."_

It stopped being tenable within a day, for two reasons that compound.

**The labels went wrong first.** Commit `07bdf61` made every figure the toggle governs print
`chain.symbol`, so a reader on testnet sees `tTRUST`. The deposit button beside those figures still
targeted mainnet. A page that says `tTRUST` over a button that spends `TRUST` is a worse state than
the bug it replaced, and it is the clearest way to lose money on this surface.

**The toggle had no point.** Its purpose is to run ARP's loop end to end before any of it touches
real value — declare, take a position, withdraw. A toggle that moves the reads and not the writes
cannot do that: the loop's second half always lands on 1155.

Three facts made the port safe rather than speculative, all measured by
`scripts/measure/predicate-parity.ts` on 2026-10-27:

- **All nine predicate atoms this app names exist on both chains.** `same as`, `uses`, `use`,
  `has trust provider`, `has trust assessment`, `has tag`, `has category`, `has type`, `implement`.
  Term ids are `keccak(atomData)` and so chain-independent, but an atom must have been _created_ on
  a chain before a triple can reference it — a predicate testnet had never seen would make
  `createTriples` revert after the operator had signed.
- **The costs are 100× apart.** `atomCost` 0.1 TRUST on 1155 against 0.001 on 13579; `tripleCost`
  the same ratio; `minDeposit` 0.01 against 0.001. So every cost must be read per chain, which
  `rules/portability.md` rule 3 already required.
- **`feeThreshold` differs too** — 1e18 on 1155, 1e17 on 13579. Worth recording because the exit-cost
  rule determined earlier in this project (125 bps always, +75 unless the redemption leaves the
  vault under `feeThreshold` shares) is stated against the mainnet value, and the testnet threshold
  is ten times lower.

## Decision

**The toggle governs reads and writes.** Everything addressed to Intuition's MultiVault — the trust
panel's deposit and withdrawal, the operator link, the identity atom, the tool registration, and
every vault read behind them — takes its chain from `lib/chain-choice.ts`.

**The chain travels on the quote, not beside it.** `StakeQuote`, `RedeemQuote`, `ImportLinkPlan` and
`ToolRegistration` each carry a `StakeChain` (`chain`, `chainId`, `multiVault`, `symbol`,
`explorerUrl`, `isMainnet`). Every write derives the MultiVault address, viem's `chain` argument and
the guard's expected chain id from that one field. `assertMainnetWallet(chainId)` becomes
`assertWalletOnChain(expected, chainId)`.

This is the part that makes the port safe rather than merely possible. There is no second argument
that could disagree with the quote, a quote priced on testnet cannot be signed on mainnet, and a
reader who moves the toggle between pricing and signing gets the chain guard's sentence instead of a
silent switch of target.

**What stays pinned to 13579, by construction, is everything addressed to ARP's own deployed
contracts**: the `IdentityRegistry`, and the `/agent` register and delegation flows that depend on
it (`agent-identity.ts`, `delegation-redeem.ts`, and the `atom-stake.ts` / `intuition-graph.ts`
writes bundled with them — 11 `chain: intuitionTestnet` sites in five services). Those contracts
exist on one chain only and `ModuleRegistry` is not going to mainnet (ADR `0025`, retired by
`0051`). Porting half of a flow whose other half cannot move would produce a mainnet path that
fails at its second step.

## Alternatives considered

- **Leave the writes on mainnet and hardcode `TRUST` wherever a write is involved.** What the code
  did for one commit. It is internally consistent and useless: the loop cannot be rehearsed, which
  is the only reason the toggle exists.
- **Read the live toggle at submit time instead of carrying the chain.** One less field. It
  introduces a window between pricing and signing in which the chain can change, and in that window
  the guard would compare the wallet against the _new_ chain while the quote's figures came from the
  old one. The field is cheaper than reasoning about that race every time this code is touched.
- **Derive `isMainnet` from `chainId` inside the service.** Would need a chain constant in a module
  whose whole point is not to have one. It rides on the chain object instead.
- **Port the ARP-registry writes too.** Refused above: the registry is not on mainnet.
- **Gate the staking panel to mainnet only and leave the toggle for reads.** Keeps ADR `0017`'s
  surface exactly as audited. Rejected on the user's instruction, and because it preserves the
  label/button mismatch rather than resolving it.

## Consequences

**Positive:**

- The loop runs end to end on testnet, which is what the toggle was for.
- A quote is now a complete record of what was priced and where. The confirmation step, the receipt
  and the error state all read the chain from it, so an explorer link always points at the chain the
  transaction actually went to — including for a reader who switched the toggle after signing.
  `WithdrawControl`'s error phase carries `explorerUrl` for exactly that case.
- `assertWalletOnChain` is testable in both directions. The old guard could only assert "mainnet is
  right"; the new one asserts that testnet is right on testnet **and wrong on mainnet**, which is the
  half that was unexpressible.
- `lib/intuition-mainnet.ts` shrinks to three constants. Its client and its two URL helpers are
  gone — a client pinned to one chain is what the toggle exists to remove.
- `ChainChoice.chainId` is now a two-member union rather than `number`, so `switchChain` typechecks
  without a cast and the type says there are exactly two chains.

**Negative:**

- ADR `0017`'s safeguards were written against one chain. All seven still hold — they are about the
  amount, the confirmation and the absence of automation, none of which changed — but the chain
  guard is now parameterised, so a future reader has one more thing to check when auditing it.
- The confirmation line needed **two sentences, not one with the token substituted**: "Real tTRUST"
  would be a false claim. `StakeControl` and `WithdrawControl` both branch on `isMainnet` for that
  one line. It is the kind of branch that rots, and it is in two places.
- `StakeChain` carries two fields the service never reads (`explorerUrl`, `isMainnet`). They are
  there for the receipt. Documented at the type, because a field no caller in the module uses looks
  like a mistake.

**Neutral (worth knowing):**

- `security.md`'s canonical sentence is **unchanged and still governs**: no ARP agent, script or
  automated process may sign a mainnet transaction with ARP's own funds. A human still clicks, the
  ceiling still applies, and nothing here automates anything. What this removes is the accident of
  _silently_ defaulting to mainnet.
- `wagmi.ts` keeps testnet first in its chain array — the safe default for a connector that ignores
  the explicit `chain` argument.
- The `/agent` register flow now has a visible asymmetry: the toggle moves above it and it does not
  move with it. That is honest rather than hidden, but it will read as a bug to somebody until the
  registry question is settled.

## References

- Related rule: `.claude/rules/portability.md` — its table and its exception clause are updated by
  this ADR
- Related rule: `.claude/rules/security.md` — the mainnet-signing sentence, unchanged
- Related ADR: `.claude/choices/0017-arp-stakes-real-trust-on-mainnet.md` (the seven safeguards)
- Related ADR: `.claude/choices/0025-no-module-registry-on-mainnet.md` and
  `0051-arp-points-and-prices-it-stores-nothing.md` (`ModuleRegistry` is not going to mainnet)
- Measurement: `scripts/measure/predicate-parity.ts`
