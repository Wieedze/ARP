# 0099 — Sponsorship is a match on the agent's own deposit, paid after it has been held

**Status:** Deferred (mainnet)
**Date:** 2026-10-30
**Triggered by:** `docs/24_AN_OUTSIDE_READ_OF_0094.md` and the user's decision the same day: _« oui
ça me paraît intelligent »_, on options 1 and 2 of the solutions set out in that session.

Accepted, then deferred by the user later the same day: _« pour le testnet on s'en fout on fait
tout sponsored »_. The objection was friction: under this ADR an agent must buy TRUST on an L3
before anything is sponsored.

**On testnet 13579 nothing here applies.** Everything with a valid proof is sponsored, on ADR
`0094`'s model (`receiver = agent`, ADR `0092`'s treasury limits). The hold-then-match below, the
withdrawal threshold and the cost-of-proof cap all wait for mainnet, and so does `docs/tasks/40`'s
plan, which this ADR does not amend. For mainnet the user leans toward a different shape: agents pay
ARP in x402 USDC, ARP sponsors in TRUST, and the sponsored amount stays below the x402 price. That
is the third alternative below, with its exchange risk still to be checked with a lawyer. This ADR
is one candidate for mainnet, not the decision.

## Context

ADR `0094` has the sponsoring service pay a deposit up front, `receiver = agent`, whenever a proof is
valid. It then limits farming with a threshold: an agent that withdraws too much of what it was
sponsored stops being sponsored.

`docs/24` found two holes in that, and ADR `0094` records the first since `601bc66`:

1. **One operator running both agents forges the strong proof.** A pays B, B's node signs, and the
   payment goes back to the same operator. Such a proof costs that operator gas and nothing else.
2. **The withdrawal threshold is per identity, and identities are free.** `register()` on the
   canonical ERC-8004 registry simulates from an arbitrary address
   (`scripts/measure/registry-mintability.ts`, 2026-10-21). A new mint resets the counter.

The user then decided that **a sponsored amount stays below the cost of the proof that unlocks it**.
Applied to an up-front payment, that rule reduces agent-to-agent sponsorship to about the gas price,
because a self-dealt payment comes back. The sponsorship needs a cost that does not come back.

## Decision

**ARP no longer pays a deposit. It matches one: the agent deposits its own TRUST with a proof, and
once the position has been held for a period T, the sponsoring service adds `r × the agent's own
deposit` to the same position, `receiver = agent`.**

- **The proof grants the right, holding releases the money.** Nothing is sent before T.
- **Holding is checked as continuity, not as a balance at T.** The service reads the agent's
  `Redeemed` events on that term between the deposit and T from the indexer. Withdrawing and
  depositing again restarts the clock.
- **`r` stays below the MultiVault's round-trip fees on that term.** A farmer who forges the proof,
  deposits D, collects `r·D` and leaves, pays the entry and exit fees on D. With `r` below their sum,
  this loses money even with a free proof, which is the user's rule with the fees as the cost that
  does not come back. Read the fees from the **deployed** contract, never from the local checkout.
  If they are zero on 13579, `r` is zero there and sponsorship is off until they are not.
- **`T` and `r` are configuration**, printed in the service's info route like ADR `0092`'s limits.
  Neither is set here.
- **ADR `0094`'s withdrawal threshold is dropped.** Holding is now the condition, so a counter of
  withdrawals adds nothing, and the identity reset no longer gets around it.
- **Unchanged from `0094`:** the agent owns the position, the agent's one-time `approve` and the
  gas for it, the limits of `0092`, the MultiVault allow-list, nothing sent to the agent's wallet,
  and _proven_ meaning a second key, not a second operator.

## Alternatives considered

- **Pay up front, stop past a withdrawal threshold** (ADR `0094` as written). Rejected for the two
  holes above.
- **A non-returnable part inside the proof**: the hirer also pays ARP a fee in x402 and the
  sponsorship stays below it. It meets the rule, but it is "pay ARP USDC, receive a TRUST
  position", the exchange risk ADR `0094` §4 leaves to a lawyer.
- **Escrow the sponsored shares in a contract that releases them after T.** The shares would belong
  to the escrow, not the agent, and the indexer's depositor would be the escrow. That breaks
  `0094`'s link between identity and stake.
- **Sponsor only the creation fees**, the non-withdrawable part. Already rejected by the user in
  `0094`.

## Consequences

**Positive:**

- A forged proof does not pay, by arithmetic rather than by detection, so ARP never has to tell two
  operators apart.
- A fleet of identities costs real capital, held for T, so `docs/24` point 5 (one operator, many
  agents) is bounded by money rather than by counting.
- The sponsored part of a position is never larger than `r` times what the agent itself risks.

**Negative:**

- **An agent with no TRUST gets no sponsorship.** ADR `0094` point 2 had ARP pay so an agent did not
  need TRUST to be seen. Under this ADR it deposits first. A deposit without a proof is still indexed
  as _declared_.
- The service now keeps per-deposit state (deposit, term, start, due date) and runs a check at T. It
  was a stateless check-then-send.
- If the round-trip fees on 13579 are zero, nothing is sponsored there. That is what this design
  does, and it means testnet cannot measure sponsorship until the fees can be read.

**Neutral (worth knowing):**

- `docs/12_THE_IDEA.md` point 3 says "ARP's sponsoring service pays the deposit". That is the
  `0094` wording and it needs this ADR's. So do `0094` §3's withdrawal bullet and `docs/tasks/40`
  deliverables 40a, 40c and 40d. This ADR does not edit them: arp-63 owns them and is told.

## References

- Related doc: `docs/24_AN_OUTSIDE_READ_OF_0094.md`, `docs/12_THE_IDEA.md`, `docs/tasks/40-the-sponsoring-service.md`
- Related ADR: `0094`, `0092`, `0046`
- Related rule: `.claude/rules/security.md` (the signing table, the sponsor row)
