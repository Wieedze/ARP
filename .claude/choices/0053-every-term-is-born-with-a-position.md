# 0053 — Every term is born with a position

**Status:** Accepted
**Date:** 2026-10-21
**Triggered by:** user request — _« tout atome doit naître avec une position »_, and _« si il y a 0 position dessus c'est comme si il n'existait pas ; ce qui compte c'est les positions pour faire corps »_

## Context

An atom or triple exists on Intuition the moment `createAtoms` / `createTriples` returns. Whether it
is a **market** is a separate question, and the answer is its position count.

The two come apart because of how the contracts take payment. `assets[i]` is the **deposit**, and the
creation fee is subtracted from it. So paying exactly the fee leaves nothing to deposit: the vault is
seeded with `minShare` and the term has zero positions. Measured on testnet 13579, 2026-10-20, by
creating one atom each way:

| `assets` passed     | the vault ends up with                  |
| ------------------- | --------------------------------------- |
| `cost` exactly      | 1,000,000 wei, **0 positions**          |
| `cost + minDeposit` | 980,000,001,000,000 wei, **1 position** |

A positionless term is worse than absent. It occupies the id the real one would have had, so a later
depositor either finds it and funds a slot nobody vouched for, or misses it and mints a second atom
beside it — and Intuition has no deletion. `scripts/measure-position-substance.ts` puts numbers on
how common this is: of 269,675 mainnet atoms, 256,644 carry at least one position, but the population
drops **16×** between two positions and three (121,129 → 7,656). Most of the graph is slots.

## Decision

**Every term any ARP code path creates is born with a position.** `assets` is always
`creationFee + birthDeposit`, where `birthDeposit` defaults to the chain's `minDeposit`, **read from
the chain per plan** and never carried as a constant — it is 0.001 TRUST on testnet 13579 against
0.01 on mainnet 1155.

A caller may pass `birthDeposit: 0n` to get the old behaviour. It has to say so, in one place, and
the plan then reports `shares: 0` on the call.

**The rule is enforced by a read, not by discipline.** Every create is previewed before signing:

- `prepareDeclareUsed` → `ZeroPositionError`
- `planIdentityAtom` → `PositionlessTermError`

Both fire when the preview returns `shares = 0` and `birthDeposit` was not explicitly `0n`.

## Alternatives considered

- **State the rule and trust callers.** This is what the project did between 2026-10-20 and
  2026-10-21, and it is how the rule got broken: `prepareDeclareUsed` was fixed,
  `scripts/plan-identity-atom.ts` was the copy the correction missed, and it kept passing `atomCost`
  and `tripleCost` alone. Measured on testnet 13579 on 2026-10-21 — of 33 atoms carrying the
  canonical `Agent 8453:…` fallback label, **6 have no position** and hold exactly `minShare`. That
  is `rules/claims.md` failure 5 happening in code rather than in prose.
- **Compute the shares instead of previewing them.** The entry fee is a governance parameter and the
  shares are rounded down, so a positive deposit can still buy nothing. The rounding is the part a
  reimplementation gets wrong, and it is the part that decides this. Measured the same day: the fee
  is 200 bps for an atom and 100 for a triple on testnet, 175 and 125 on mainnet — four numbers, all
  governance-settable.
- **Check after the write.** The fee is already spent by then, and it does not come back.

## Consequences

**Positive:**

- A declaration costs more and means something. `creationFee + minDeposit` on mainnet 1155 is
  0.11 TRUST for an atom rather than 0.10.
- The invariant is now falsifiable before signing, by a call that costs nothing.
  `previewAtomCreate` and `previewTripleCreate` are **callable on a term that does not exist** —
  measured on both chains, `scripts/measure-preview-before-create.ts`. That is what makes the guard
  possible at all.
- Every `PreparedCall` carries `preview.shares`, so an operator reading a plan sees what the money
  buys and not only what it costs.

**Negative:**

- Six positionless atoms already exist on testnet 13579 and cannot be removed. They are a rehearsal's
  litter, not a loss — but the same bug on mainnet would have cost 0.1 TRUST each and produced the
  same unremovable slots.
- One extra `eth_call` per created term.

**Neutral (worth knowing):**

- `previewDeposit` is **not** symmetric: it reverts on a term that does not exist. So
  `prepareStakeOnUsed` previews only the targets `termExists` confirmed, and `PlannedStake.shares` is
  absent for the rest. That asymmetry is measured, not assumed.
- The deposit a term is born with is the creator's own, and it is a **position**, not a fee — it can
  be redeemed. The creation fee cannot.

## References

- Related rule: `.claude/rules/portability.md` rule 3 — read the cost from the chain, never tune on testnet
- Related rule: `.claude/rules/claims.md` failure 5 — a correction that landed in one place
- Related ADR: `.claude/choices/0051-arp-points-and-prices-it-stores-nothing.md`
- Related ADR: `.claude/choices/0054-a-tool-atom-is-derived-from-its-url.md`
- Scripts: `scripts/measure-preview-before-create.ts`, `scripts/measure-position-substance.ts`
