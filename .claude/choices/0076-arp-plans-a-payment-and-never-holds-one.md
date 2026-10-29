# 0076 — ARP plans a payment and never holds one

**Status:** Accepted
**Date:** 2026-10-29
**Triggered by:** user decision, 2026-10-29 — « ok pour les 3 »

## Context

ADR `0075` makes a participant's place depend on what others put behind it. Part of what others put
behind an agent should be **what they paid it**, because a payment is the strongest thing a third
party can say: you do not pay someone who delivered nothing.

ARP cannot see payments today. An agent pays another however it likes, off this chain or on it, and
ARP sees only what the parties declare. So "this agent routes a share of its earnings back to the
tools it used" — the loop the user asked for — rests on a number only the earner knows.

The obvious objection is ADR `0038`: `@arp-protocol/core` must never hold a key, the connector
plans and the agent's own runtime signs. And `0035`: ARP is not a party.

## Decision

**ARP plans payments. It never holds, routes or custodies one.**

`arp_pay_agent` (name provisional) returns a prepared, unsigned call — the same shape every other
planner returns. The paying agent signs it with its own key, as it already does for
`arp_declare_used` and `arp_stake_on_used`.

This does **not** breach ADR `0038`. That ADR forbids holding a key and forbids signing; it says
nothing about what kind of call may be prepared, and preparing a transfer is the same act as
preparing a deposit. The invariant that matters — ARP cannot spend an operator's TRUST even by
mistake, because it holds no key — is untouched.

**What it does breach is a guard, deliberately and in writing.** `scripts/send-plan.ts` enforces
that every `to` must have code, because a value-bearing call to a codeless address does not revert:
it is a plain transfer that succeeds into nothing. Paying an agent is exactly a value-bearing call
to a codeless address.

The exception is therefore **named and bounded**: a `kind: 'pay'` call may target a codeless address
**only** when that address was resolved from an ERC-8004 identity by reading `ownerOf` on the
registry in the same plan, and the plan records which token id it came from. A payment to an address
supplied by a caller, or to one not resolved that way, is refused as before.

## Alternatives considered

- **Custody — ARP receives and forwards.** Rejected outright. It makes ARP a party (`0035`), puts
  other people's funds in reach of our code, and turns "ARP cannot spend your TRUST" from a property
  into a promise. It also attracts obligations that have nothing to do with the product.
- **Leave payments off-protocol and trust the declared share.** This is today, and it is why the
  redistribution loop cannot be stated as anything stronger than "this agent routes consistently".
  Workable, and it was the fallback if this ADR had been rejected.
- **Relax the codeless-address guard generally.** Rejected: that guard exists because a transfer to
  a wrong address succeeds silently. Removing it to allow one case would remove it for every case,
  including the plan files this repo writes by hand.

## Consequences

**Positive:**

- The amount paid becomes **on chain, attributed and dated**, so a redistribution to the tools used
  can be computed from a real figure rather than asserted.
- A hire and its payment can be one plan — the transfer and the deposit on the hire triple signed
  together, so the record and the money do not drift apart.
- A payment is the two-party fact `docs/14` says is the only kind worth having: the payee cannot
  have been paid by someone who paid nobody.

**Negative:**

- A planner that constructs value transfers is a larger attack surface than one that constructs
  deposits. A wrong `to` is unrecoverable, which is precisely what the guard it excepts was built to
  prevent. The resolution-from-`ownerOf` requirement is the whole of the mitigation and it has to
  hold on every path.
- It invites the reading that ARP is a payment product. It is not, and nothing in the interface
  should suggest otherwise.

**Neutral (worth knowing):**

- A plain transfer carries no memo, so the payment and the record are two calls, not one. Tying
  them is the plan's job and the plan is what the agent signs.
- This does not require Intuition to be the payment chain. The planner takes a chain id like every
  other, and `rules/portability.md` applies unchanged.

## References

- Related ADR: `0038` (the connector never holds a key), `0035` (ARP is not a party),
  `0075` (your place comes from others), `0017` and `0036` (who may sign what, where)
- Related rule: `.claude/rules/security.md` — the one canonical statement on mainnet signing
- Guard being excepted: `scripts/send-plan.ts`, guard 2
