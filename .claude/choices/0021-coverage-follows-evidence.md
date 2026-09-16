# 0021 — Read coverage is total; write coverage follows evidence

**Status:** Accepted
**Date:** 2026-09-16
**Triggered by:** user decision, after costing Phase 3 against live mainnet contract values and
working through whether a cheaper blanket write would do.

## Context

`docs/09` §7 describes Phase 3 as publishing ARP as a trust provider. Neither it nor `docs/08` O3
carried a number. Reading the mainnet MultiVault directly supplied one:

```
atomCreationProtocolFee     0.1   TRUST      protocol fee — not recoverable
tripleCreationProtocolFee   0.1   TRUST      protocol fee — not recoverable
minDeposit                  0.01  TRUST      a deposit — becomes your position
```

The canonical shell is one assessment-source Atom plus four Triples per agent. All five are
_creations_, so all five are fees: **0.5 TRUST per agent**, none of it recoverable. The ARP provider
Atom is paid once, globally.

Against 28,648 agents that is ~14,300 TRUST. Cheaper shapes exist:

| Shape                                  | Per agent | Cohort  | What a pattern-following consumer sees              |
| -------------------------------------- | --------- | ------- | --------------------------------------------------- |
| `has trust provider` only              | 0.1       | ~2,865  | ARP listed as a provider. **No link to the score.** |
| + source Atom + `has trust assessment` | 0.3       | ~8,594  | Provider and a resolvable score                     |
| Full canonical shell                   | 0.5       | ~14,300 | The complete documented read, both indexes          |

The one-Triple shape is not as crippled as it looks: the resolver path is canonical
(`.well-known/intuition/erc8004/agents/{chainId}/{tokenId}/trust-assessment.json`), so the URL is
derivable from the ARP provider Atom plus the agent's identity. But the guide tells consumers to read
the URL from `object.value.thing.url` on the `has trust assessment` object, and most will not
implement a fallback they were never told to write.

**An earlier draft of this ADR argued that writing a shell without evidence would contradict ARP's
positioning. That argument was wrong and is withdrawn.** `(agent, has trust provider, ARP)` does not
claim the agent is good. It claims ARP publishes an assessment for that agent. If ARP's resolver
genuinely serves a document for every agent — including one that says `insufficient-evidence` — the
claim is simply true, and serving it is a real service rather than a pretension.

What actually blocks a blanket write is neither cost nor honesty. It is **order**, and it rests on one
property: Intuition has no deletion. Shares can be redeemed from a vault; the term itself is permanent.
Writing 28,648 Triples is a one-way door. ARP's resolver does not exist yet, so a mass write today
would point 28,648 permanent claims at an endpoint that answers nothing.

## Decision

**Two coverage surfaces, decoupled on purpose.**

**Read coverage is total from day one.** `getAgentProfile` answers for any ERC-8004 agent, on any
supported chain, whether or not anything was ever written for it. This costs nothing on-chain: the
agents are already indexed by the ERC-8004 registries and by the Triples Intuition already wrote. ARP
reads them. An agent with no ARP evidence returns a well-formed assessment whose verdict is
`insufficient-evidence` — an answer, not a gap.

**Write coverage follows evidence.** ARP writes the canonical shell for an agent when it holds
evidence no one else has — at least one of:

- ≥1 distinct staker on an ARP-surfaced claim about that agent,
- ≥1 execution receipt from a redeemed delegation naming that agent,
- capability data ARP indexed that is not already in the graph.

Supporting rules:

1. **Demand ranks; it does not trigger.** A lookup says what to investigate next, not what to publish.
2. **Sponsored writes are a separate opt-in path.** An operator may pay the 0.5 TRUST to have ARP's
   assessment on the graph. Marked as sponsored — it must never read as ARP having found evidence it
   did not find. This is also the layer's first natural revenue.
3. **Blanket presence is deferred, not rejected.** Buying the one-Triple shape across the cohort for
   ~2,865 TRUST is a legitimate distribution move and the funds exist. It is revisited **after** the
   resolver is live and proven on a handful of agents with the full shell. Sequence: build, prove,
   then decide. The TRUST will still be there; a botched permanent write will not undo.
4. The difference between the two surfaces must be legible to a consumer, never hidden.

## Alternatives considered

- **Blanket four-Triple coverage now** — rejected. ~14,300 TRUST, and most of it spent writing
  `insufficient-evidence` before the resolver that would serve it exists.
- **Blanket one-Triple coverage now (~2,865 TRUST)** — _deferred_, per decision 3. The objection is
  sequencing and permanence, not cost or integrity.
- **A chosen subset picked up front** — rejected, and this is what `docs/08` and `docs/09` currently
  say. It inverts the order: decide coverage first, find evidence afterwards, then defend a list.
- **Shrink the shell permanently below four Triples** — rejected as the steady state. Each Triple
  serves a distinct query and the recipe is frozen upstream. Saving 0.2 TRUST per agent by becoming
  unreadable is not a saving. (Distinct from decision 3, which is a deliberate partial write for
  distribution, not a redefinition of the shell.)
- **One shared assessment-source Atom with a directory resolver** — rejected for now. It is the only
  idea that would genuinely cut the per-agent fee, but it breaks the
  `agent → has trust assessment → source → url` shape consumers traverse. Revisit only if Intuition
  blesses a batched form.

## Consequences

**Positive:**

- Phase 3 stops being a capital decision and becomes a variable cost tied to usage.
- ARP answers for every agent from day one without spending anything, which is the strongest possible
  version of "usable by any platform": a consumer gets a result for any identity they hold.
- The coverage map becomes a signal: _this provider writes only where it has proof._
- The ~2,865 TRUST distribution option stays open and gets taken, if taken, with the resolver already
  proven.

**Negative:**

- ARP's on-graph footprint stays small for a while, and footprint is the first thing an integrator
  sees. The partner guide's coverage query will show tens of agents against a competitor's tens of
  thousands. Out of context that comparison is unflattering, and the context has to be carried in
  ARP's own copy rather than assumed.
- Two coverage surfaces is a thing to explain, and an easy thing to get quietly wrong in the UI.

**Neutral (worth knowing):**

- Nothing here changes Phase 1 or the read path. Reads are keyless and free.
- The 0.5 TRUST figure is a governance-configurable protocol fee. Re-read it when Phase 3 is built
  rather than hardcoding it.
- Deposits are unaffected: staking into an existing vault costs `minDeposit` (0.01 TRUST) and becomes
  a position rather than a fee.
- A cohort-wide write is ~28,648 sequential transactions from one wallet — feasible, gas is
  negligible, but it is a long-running job with its own operational care, not a single call.

## References

- Related doc: `docs/09_POSITIONING_AND_PLAN.md` §7 Phase 3 — **corrected by this ADR**
- Related doc: `docs/08_ERC8004_AGENT_LAYER_OPPORTUNITY.md` O3 — **corrected by this ADR**
- Related doc: `docs/07_INTUITION_ERC8004_PARTNER_GUIDE.md` — the frozen four-Triple recipe, the canonical resolver path, Read 3 coverage query
- Related ADR: `0015` (canonical pattern), `0017` (real TRUST on mainnet — deposits; this ADR governs creations), `0019` (connector surface)
- Live values read 2026-09-16 from MultiVault `0x6E35cF57A41fA15eA0EaE9C33e751b01A784Fe7e`, chain 1155
