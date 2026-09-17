# 0017 — ARP stakes real TRUST on Intuition mainnet

**Status:** Accepted
**Date:** 2026-09-16
**Triggered by:** user request — "on peut aller avec du vrai TRUST, j'ai du TRUST en quantité", given
in response to the proposal in `docs/10` §2 to ship the staking control disabled.

## Context

`CLAUDE.md` carries a hard constraint: _"Do not deploy to mainnet without explicit user confirmation
per session."_ Every ARP contract lives on Intuition testnet 13579, and the Cook-Off build never
touched mainnet.

The positioning in `docs/09` puts ARP on tiers 3 and 4 of the evidence ladder — staked conviction and
proven execution. Tier 3 is only reachable on mainnet, because that is where the 28,648 ERC-8004
agents and their `has trust provider` vaults exist. Testnet has the contracts but not the cohort.

Task 08 was specified to ship the staking control **disabled** behind a flag, pending a decision. The
user has now made it, explicitly, and that message is the per-session confirmation `CLAUDE.md`
requires.

There is also a substantive argument, not just a permission one. `docs/08` O6 notes that ARP staking
its own TRUST on its own assessments is _the credible commitment its competitors have not made_. A
curation market with a disabled button is a mockup. The whole thesis is that a signal is worth what it
cost to produce; shipping a read-only version of it would contradict the document it implements.

## Decision

**ARP's trust panel stakes real TRUST on Intuition mainnet (chain 1155), against the MultiVault at
`0x6E35cF57A41fA15eA0EaE9C33e751b01A784Fe7e`.** The control ships enabled.

Scope is deliberately narrow. This authorises **deposits into existing `has trust provider` triple
vaults and their counter-triples** — supporting or opposing the claim that a given provider's
assessment of a given agent is trustworthy. It does **not** authorise:

- deploying any ARP contract to Intuition mainnet (not needed; the deposit targets Intuition's own
  MultiVault),
- creating atoms or triples on mainnet at scale — that is Phase 2 capability indexing, which carries a
  gas and atom-cost budget question of its own and needs a separate decision,
- any automated or agent-initiated stake. Every transaction is signed by the operator in their wallet.

Seven safeguards are acceptance criteria of task 08, not advice:

1. **Chain guard** — refuse to build a transaction unless the wallet is on 1155; offer an explicit
   switch. A stake from the wrong chain is the most plausible way to lose funds here.
2. **No spending default** — the amount field starts empty; no preset that submits.
3. **Hard ceiling** — `VITE_MAX_STAKE_TRUST`, default **1 TRUST** per transaction.
4. **Confirmation before the wallet opens** — which claim, which side, how much, and the vault's
   current position count, so the user knows when they are about to be the only participant.
5. **Never auto-stake** — nothing on mount, no resubmitting retry, nothing triggered by navigation.
6. **Show the real cost** — `previewDeposit` before every transaction, displaying both shares minted
   and assets after fees. Several fee layers apply and the bonding curve is not linear; implying 1:1
   would be a lie.
7. **`minShares` from the preview** — never `0`, which disables slippage protection outright.

And one rule for the build itself: **no agent or automated process executes a real stake to verify its
own work.** Verification is unit tests over a mocked wallet client, `previewDeposit` reads, and
`eth_call` simulation. The first real transaction is the operator's, deliberately.

## Alternatives considered

- **Ship disabled behind a flag** (the original task 08 spec) — rejected by the user's decision, and
  weak on its own terms: it would have shipped a mockup of the exact mechanism the positioning claims
  as ARP's differentiator.
- **Stake on testnet 13579 instead** — rejected. The vaults that matter do not exist there; the cohort
  is a mainnet artifact. A testnet stake signals nothing, which is precisely the property that makes
  free signals worthless.
- **Server-side automated staking from an ARP wallet** — rejected, and not proposed. It would make ARP
  a market participant acting without a human in the loop, on someone else's capital, with no
  authorisation covering it. If ARP-as-staker ever becomes a product decision it needs its own ADR and
  its own key management.

## Consequences

**Positive:**

- Tier 3 of the evidence ladder becomes reachable instead of aspirational.
- ARP can take positions behind its own reads — the credible commitment `docs/08` O6 identifies.
- The Phase 1 artifact shown to Intuition and Deep3 is a working market, not a screenshot.

**Negative:**

- Real money moves through code written today and reviewed once. The seven safeguards are the
  mitigation; the ceiling is the backstop.
- The app now spans two networks: it reads and stakes on mainnet 1155 while ARP's own contracts remain
  on testnet 13579. The UI must make that unambiguous or a user will mistake one for the other. This
  is the sharpest new failure mode and it is a UI problem, not a contract problem.
- `CLAUDE.md`'s mainnet constraint is now partially spent. It should be restated rather than treated
  as lifted: this ADR authorises deposits into existing vaults, nothing else.

**Neutral (worth knowing):**

- Gas on the Intuition L3 is negligible (~0.0001 TRUST per transaction); the cost that matters is the
  deposit itself.
- Depositing into a triple signals agreement; depositing into its counter-triple, obtained via
  `getCounterIdFromTripleId`, signals disagreement. Both sides are priced, which is what makes the
  vault a market rather than a tally.
- Markets on these vaults currently carry one or two positions. Early stakes will move them visibly —
  a reason to display position counts and distinct stakers rather than bare market cap.

## References

- Related doc: `docs/09_POSITIONING_AND_PLAN.md` §2 (the evidence ladder), §6 (credible commitment)
- Related doc: `docs/08_ERC8004_AGENT_LAYER_OPPORTUNITY.md` O6 (the curation market)
- Related task: `tasks/08-agent-trust-panel.md` — the safeguards are its acceptance criteria
- Related skill: `.claude/skills/intuition/operations/deposit.md`, `reference/simulation.md`
- Related rule: `.claude/rules/security.md` (deployment posture), `CLAUDE.md` (mainnet constraint)
- Supersedes: the "ship it disabled" provision of `docs/10` §2, written before this decision
