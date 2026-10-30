# 12 — The idea

**Status**: canonical. Read this before `08`, `09` or `11` — those are analysis and they drifted from it.
**Date**: 2026-09-16

---

## The mechanism, in full

1. An agent has an **ERC-8004 identity**. ARP is where you get one: it **mints** a new identity into the canonical ERC-8004 registry (ADR 0027), or **imports** an existing one — the Base registry's next id was **444,562** on 2026-10-21 and Intuition reaches **28,720** through a `same as` edge, about **one in fifteen** (`scripts/measure/registry-mintability.ts`). Both paths end in the same place, and everything after this point is identical for either.

   **No daily rate is quoted here, and that is deliberate.** Two observations the same day: the id rose from 309,925 on 2026-10-20 to 444,562 on 2026-10-21, and 72 ids were consumed in the two minutes between two probes. Those imply rates 2.6× apart — ~135,000 a day against ~52,000 — so a two-minute sample cannot settle it and neither can two daily snapshots. An earlier version of this line said "~44,000 a day" as though it were a measurement. Re-run the script; do not quote a rate.

2. An agent is **composed of modules**. A module is a tool or a methodology registered in `ModuleRegistry`: a domain plus a schema. Anyone can register one.
3. The agent runs. It **deposits TRUST on the modules it actually used** — not the ones it claims to use.
4. That deposit is the signal. It produces reputation at two levels at once:
   - **tool reputation** — how many distinct agents put money on this module
   - **agent reputation** — what this agent is composed of, and how much it has committed to that composition
5. The agent operates under a **signed delegation whose caveats are the guard rail**. `DomainScopeEnforcer` bounds where it can stake; `TrustStakeCapEnforcer` bounds how much. Out-of-scope attempts revert before any state change.

That is the whole protocol. Nothing above requires ground truth, an oracle, a resolver, or visibility
into anyone's execution.

## Why the signal is not free

Every other reputation layer in this market takes free input: feedback, ratings, votes. ARP's input is a deposit of real TRUST on a tool the agent used, made under a cap its operator signed.

It costs money, it is bounded by a contract, and it is about **usage**, not opinion.

## What ARP is not

- **Not a registry.** ARP mints into ERC-8004's registry and reads from it; it never keeps an identity namespace of its own. Being an on-ramp to the standard is being its client, not its competitor.
- **Not a marketplace.** `/hire` was a demo that the index works; it was never finished and is now removed. Hiring is `docs/tasks/25`, and the delegation there caps the **buyer's** own spend so the seller needs no relationship with ARP.
- **Not consumer-facing.** B2B infrastructure — agents, dApps and protocols consume it (`docs/01`).
- **Not a scorer.** ARP publishes no score, rating or assessment of any agent. It makes staking
  possible and reads the result; every figure it surfaces is a deposit somebody else made. ARP cannot
  be wrong about an agent — the market can (ADR `0046`).
- **Not in the path of a request.** ARP ships a node the operator runs; it never hosts one they have
  to reach. The test is mechanical, which is why it replaced an earlier wording that was not: unplug
  ARP's servers, and every declaration, every stake and every agent-to-agent call still completes.
  The node holds no key — it prepares, the agent signs (ADR `0038`, `0045`). ARP still has no
  visibility into what an agent executes, and that is a **separate** guarantee: one sentence used to
  carry both, and the one about code was already false while the one about execution holds.

## Drift signals

Written down because this document exists to stop a specific failure, which has already happened three times in one day. If you catch yourself proposing any of these, stop and re-read the mechanism above.

- "ARP should measure whether the agent was _right_" → no, and **not as a later layer either** (ADR `0049`). It needs ground truth; this mechanism does not, and that is the point rather than a stage it has not reached. This bullet used to call it "a later layer on top of this one", which kept an unbuilt differentiator alive in the positioning for months.
- "ARP should score agents from other providers' assessments" → that is reading a competitor's output. It is distribution, not the product.
- "ARP should be the bounded-hiring rail / the marketplace" → no. See above.
- "ARP should route agents' requests through our own host" → no, and since ADR `0045` this is the
  load-bearing one. Shipping a node an operator runs is the **opposite** of this, not a version of it.
- "ARP should host the endpoint agents are reached at" → no. That is the relay above wearing a product
  name. It solves NAT and makes ARP a liveness dependency that sees every payload and can drop any of
  them. ARP verifies an endpoint; the operator provides it.
- "ARP should weight sentiment by staker track record" → interesting, and not this. It has no falsifiable subject.
- "ARP should keep its own agent registry" → no. Minting **into ERC-8004** is fine and is a product surface; a parallel ARP identity namespace is not. An agent minted through ARP must be indexable by everyone else reading the standard.

## The state of it

| Piece                                                           | Status                                                 |
| --------------------------------------------------------------- | ------------------------------------------------------ |
| `ModuleRegistry` — modules with domain + schema                 | built, deployed                                        |
| `declareUsesTriple` — `(agent, uses, tool)`                     | built                                                  |
| `stakeOnUsedMethodologies` — stake on what was actually used    | built                                                  |
| `DomainScopeEnforcer`, `TrustStakeCapEnforcer` — the guard rail | built, deployed on testnet 13579                       |
| Tool and agent reputation surfaced in the UI                    | built                                                  |
| **Adoption of an existing ERC-8004 agent**                      | **missing — the whole gap**                            |
| **The guard rail on the chain where the agents are**            | **missing — enforcers are on testnet, agents are not** |

The mechanism works today for agents ARP mints. It does not work for the agents that already exist — **28,720** reachable out of a registry whose next id is **444,562**, measured 2026-10-21 — and those are the population, so that gap is what stands between this and a live system. Worse than it reads: the mirror has not moved since 2026-09-16 while the registry kept going, so for roughly **fourteen agents in fifteen** the identity atom does **not exist** and has to be written (`scripts/agent-identity-atom.ts`, ADR `0047`). `/agent/import` writes it now rather than waiting.

## What closes it

**Import, alongside the mint that already works.** Minting is built. What is missing is the other door: an operator proving control of an existing ERC-8004 agent. The registry names the `owner`, so a signature from that address is the whole proof — no bridge, no mint, no second identity.

**Which registry ARP mints into — settled, and this paragraph used to say it was not.** ADR `0027`
decided it: when ARP mints, it mints into the canonical registry `0x8004A169…A432`, Base by default,
and ARP's own deployment on testnet 13579 is a **demo fixture only**. Minting into ARP's registry
produces an agent nobody else indexes, which is the fragmentation the standard exists to prevent.
Re-confirmed by the user on 2026-10-21 in those terms — canonical in production, ARP's own on testnet
— so it is one decision twice agreed, not an open question.

What was never measured until 2026-10-21 is the premise ADR `0027` rests on: that anyone **can** mint
there. `scripts/measure/registry-mintability.ts` settles it — `register()` simulates successfully
from an arbitrary address. The registry has an `owner()` but minting is not behind it, and `paused()`
reverts. The same run: next id **444,562**, up from 444,490 two minutes earlier, against **28,720**
reachable through a `same as` edge. One agent in fifteen.

**The Base mint path is still not built.** `/agent` mints into the testnet fixture, and the page has
to say so.

**The canonical atom as the subject.** The agent's atom already exists on Intuition mainnet, derived from its registration file. ADR 0015 already settled that it is the subject of everything ERC-8004-facing. `declareUsesTriple` points at it rather than at a freshly minted one.

**The enforcers where the staking happens.** Composition triples and tool stakes land on Intuition mainnet, because that is where the agents and the MultiVault are. The guard rail has to be on the same chain or it is not a guard rail. The MetaMask Delegation Framework is already deployed there at its usual CREATE2 addresses.

## What the measurements say about the timing

`docs/08` counted 194 `use` triples across the entire Intuition mainnet graph, against 28,720 reachable agents — and the Base registry's next id was 444,562 on 2026-10-21, so the real ratio is worse. That was recorded as a market opportunity. It is better read as the exact hole this mechanism fills — and the reason there is no incumbent in it.
