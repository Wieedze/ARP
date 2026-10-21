# 0039 — The deposit goes on the edge, not on the tool's atom

**Status:** Accepted
**Date:** 2026-10-19
**Triggered by:** `tasks/16` — found while deciding what `prepareStakeOnUsed` should target

> **Paths in this ADR predate the 2026-10-19 reorganisation.** Read `erc8004/src/…` as
> `packages/protocol/src/…` and `@arp-protocol/erc8004` as `@arp-protocol/core`. The text is left as
> written because an ADR is a record of a decision on its date; ADR `0041` carries the full mapping.

## Context

"The agent deposits TRUST on the modules it used" has two readings on Intuition, and they are
different claims with different vaults:

| vault                            | what a deposit there says                                   |
| -------------------------------- | ----------------------------------------------------------- |
| the `(agent, uses, tool)` triple | "I stand behind the claim that this agent used this tool"   |
| the tool's own atom              | "I think this tool is valuable" — by anyone, for any reason |

ARP had already picked both, in different files, and nobody had noticed:

- `getToolUsage` (`erc8004/src/tool-usage.ts`) prices the **triple** — `term` and `counter_term`.
- `scripts/agent-stake-on-use.ts` deposits on the **atom**, via `redeemStakeOnAtom`.

So ARP's own writer put TRUST where ARP's own reader cannot see it. Reachability, before the blast
radius is stated (`claims.md` check 1): that script's only callers are `scripts/agent-server.ts` and
`scripts/agent-server-specialist.ts`, both in the hackathon surface set aside by ADR `0033`. The
defect is **latent, not live** — no path runs it today. What made it urgent is that task 16 names
that script as the thing to adapt, so copying its choice is how it would have become live.

Measured before deciding, on Intuition mainnet 1155, 2026-10-19, over the 185 `uses` edges that
exist — `scripts/measure/stake-vault-placement.ts`:

| vault             | edges with positions | assets, all curves                     |
| ----------------- | -------------------- | -------------------------------------- |
| the edge (triple) | 110 of 185           | 245.776495 TRUST                       |
| the object's atom | 146 of 185           | 2,673,997 TRUST over 84 distinct atoms |

Both are in real use. 72 edges carry stake on both; **74 carry it only on the atom**, invisible to
any reader of the edge; 1 carries none.

**These figures are all-curve, and the first version of this ADR was not.** It said 109 edges and
26.232648 TRUST on the edge side, which is the **curve-1 slice** — `claims.md` check 2, an
unlabelled population. The cause was in the script: `vaults(limit: 1)` with no `order_by` and no
`curve_id` filter reads a nondeterministic single vault, which also contradicted ADR `0023`, this
repo's own decision to read the market across every curve. Fixed in
`scripts/measure/stake-vault-placement.ts`, and the corrected run was reproduced independently by
the `intuition-integrator` review the same day. **89% of the TRUST on `uses` edges sits on curve
2**, so the slice was 11% of the total. The load-bearing figure — 74 edges staked only on the atom —
reproduces exactly either way.

The atom figure is summed once per distinct atom. The first run of that script printed 49,569,934
TRUST by adding the object's vault once per incoming edge — `claims.md` check 2, caught because the
number was absurd rather than because anything complained.

## Decision

**`prepareStakeOnUsed` deposits on the triple.** Three reasons, in order of weight:

1. **It is the claim.** The deposit is the attestation (ADR `0034`). A deposit on the atom is not
   attributable to any usage claim — it is a market on the tool, and it would be there whether or
   not anyone ever used it.
2. **It is contestable.** Every triple gets a counter-triple for free, so a false `uses` edge can be
   bet against. An atom has no counter-vault; there is no way to take the other side of "this tool
   is valuable".
3. **It is what the reader reads.** A deposit elsewhere is invisible to `getToolUsage`, and 74
   mainnet edges are in that state today.

The larger figure is on the atom, and that is not an argument for it: it answers a different
question.

No atom-deposit option is exposed. `code.md` forbids flexibility added for the future, and a
parameter choosing between two vaults would make the wrong one reachable by typo — permanently,
since Intuition has no deletion.

## Alternatives considered

- **The tool's atom, matching `agent-stake-on-use.ts`.** Rejected: invisible to ARP's reader, not
  attributable to a usage claim, and not contestable.
- **Both vaults, splitting the amount.** Rejected: it doubles the cost of every attestation to buy
  nothing the edge does not already give, and it makes "how much was staked on this claim" a figure
  a reader has to reconstruct from two places.
- **A parameter, defaulting to the edge.** Rejected per `code.md` — and the cost of the wrong branch
  being reachable is permanent.

## Consequences

**Positive:**

- What the connector writes is what the connector reads. The loop closes.
- The claim can be contested by anyone, which is what makes a staked self-report worth more than an
  unstaked one.
- A test asserts the decoded `termId` **is** the triple id and **is not** the atom id, so a
  regression fails rather than writing permanently into the wrong vault
  (`erc8004/test/declare-plan.test.ts`, mutation-tested).

**Negative:**

- A stake needs the edge on chain first, so declaring and staking cannot be one transaction. The
  plan reports `exists: false` and skips those targets rather than reverting.
- ARP's edge vaults will look thin next to the atom vaults, because the atom vaults carry
  everything anyone ever deposited on the tool for any reason. A UI comparing the two numbers
  side by side would mislead.

**Neutral (worth knowing):**

- `scripts/agent-stake-on-use.ts` still deposits on the atom. It is not fixed here: it is set-aside
  surface (ADR `0033`), it has no live caller, and changing it would be editing historical record.
  Recorded in `.claude/STATE.md` as a known defect so the next reader does not copy it either.

## References

- Related ADR: `.claude/choices/0034-the-deposit-is-the-attestation.md`
- Related ADR: `.claude/choices/0030-the-use-edge-is-chosen-on-meaning.md`
- Related ADR: `.claude/choices/0033-the-hackathon-surface-is-set-aside.md`
- Related ADR: `.claude/choices/0038-the-write-path-is-a-plan-not-a-transaction.md`
- Related rule: `.claude/rules/claims.md` checks 1 and 2, both of which this measurement tripped
- Script: `scripts/measure/stake-vault-placement.ts`
