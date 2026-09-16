# 12 — The idea

**Status**: canonical. Read this before `08`, `09` or `11` — those are analysis and they drifted from it.
**Date**: 2026-09-16

---

## The mechanism, in full

1. An agent has an **ERC-8004 identity**. ARP is where you get one: it **mints** a new identity into the ERC-8004 registry, or **imports** an existing one — 28,648 already exist. Both paths end in the same place, and everything after this point is identical for either.
2. An agent is **composed of modules**. A module is a tool or a methodology registered in `ModuleRegistry`: a domain plus a schema. Anyone can register one.
3. The agent runs. It **deposits TRUST on the modules it actually used** — not the ones it claims to use.
4. That deposit is the signal. It produces reputation at two levels at once:
   - **tool reputation** — how many distinct agents put money on this module
   - **agent reputation** — what this agent is composed of, and how much it has committed to that composition
5. The agent operates under a **signed delegation whose caveats are the guard rail**. `DomainScopeEnforcer` bounds where it can stake; `TrustStakeCapEnforcer` bounds how much. Out-of-scope attempts revert before any state change.

That is the whole protocol. Nothing above requires ground truth, an oracle, a resolver, or anyone's runtime.

## Why the signal is not free

Every other reputation layer in this market takes free input: feedback, ratings, votes. ARP's input is a deposit of real TRUST on a tool the agent used, made under a cap its operator signed.

It costs money, it is bounded by a contract, and it is about **usage**, not opinion.

## What ARP is not

- **Not a registry.** ARP mints into ERC-8004's registry and reads from it; it never keeps an identity namespace of its own. Being an on-ramp to the standard is being its client, not its competitor.
- **Not a marketplace.** `/hire` is a demo that the index works.
- **Not consumer-facing.** B2B infrastructure — agents, dApps and protocols consume it (`docs/01`).
- **Not in anyone's runtime.** The only thing an operator adopts is a delegation they sign once.

## Drift signals

Written down because this document exists to stop a specific failure, which has already happened three times in one day. If you catch yourself proposing any of these, stop and re-read the mechanism above.

- "ARP should measure whether the agent was _right_" → that is `docs/01`'s calibration, a **later layer** on top of this one. It needs ground truth. This mechanism does not.
- "ARP should score agents from other providers' assessments" → that is reading a competitor's output. It is distribution, not the product.
- "ARP should be the bounded-hiring rail / the marketplace" → no. See above.
- "ARP should require the infrastructure to route its runtime through us" → no. The only integration is a signed delegation.
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

The mechanism works today for agents ARP mints. It does not work for the 28,648 that already exist — and those are the population, so that gap is what stands between this and a live system.

## What closes it

**Import, alongside the mint that already works.** Minting is built. What is missing is the other door: an operator proving control of an existing ERC-8004 agent. The registry names the `owner`, so a signature from that address is the whole proof — no bridge, no mint, no second identity.

**One open question the mint path now raises**: which registry does ARP mint into? The 28,648 live in `0x8004A169…A432` on Base. ARP's own deployment of the reference implementation sits on Intuition testnet 13579. Minting there produces an agent nobody else indexes — the fragmentation the standard exists to prevent. If minting is a real product surface it should target the registry the ecosystem reads. That is a decision, not an implementation detail, and it needs an ADR.

**The canonical atom as the subject.** The agent's atom already exists on Intuition mainnet, derived from its registration file. ADR 0015 already settled that it is the subject of everything ERC-8004-facing. `declareUsesTriple` points at it rather than at a freshly minted one.

**The enforcers where the staking happens.** Composition triples and tool stakes land on Intuition mainnet, because that is where the agents and the MultiVault are. The guard rail has to be on the same chain or it is not a guard rail. The MetaMask Delegation Framework is already deployed there at its usual CREATE2 addresses.

## What the measurements say about the timing

`docs/08` counted 194 `use` triples across the entire Intuition mainnet graph, against 28,648 agents. That was recorded as a market opportunity. It is better read as the exact hole this mechanism fills — and the reason there is no incumbent in it.
