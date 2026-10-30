# 0036 — An agent may stake. That is what ARP is.

**Status:** Accepted
**Date:** 2026-10-19
**Triggered by:** user authorisation — _"un agent peut stake, c'est le but même de notre app, c'est
un connecteur entre le protocole Intuition et les agents, pour créer un réseau de réputation d'agents
et d'outils"_. This is the decision ADR `0035` said was still owed.

## Context

ADR `0017` authorised one narrow class of mainnet transaction and scoped itself away from this one in
as many words: _"it does not authorise … any automated or agent-initiated stake."_ ADR `0035` then
established that the signer in `docs/12`'s mechanism is **the agent's own operator**, not ARP and not
ARP's author, and that `rules/security.md`'s automation rule governs this repo's funds during
development rather than the protocol's design.

That left agent-initiated staking **not forbidden and not yet authorised**. This ADR authorises it,
and states plainly what ARP is, in the user's own words:

> **A connector between the Intuition protocol and agents, to create a network of agent and tool
> reputation.**

## Decision

**An agent may stake.** It is not a tolerated edge case or a later phase — it is the mechanism
(`docs/12` points 3 and 4) and the reason the project exists.

What makes it safe is not a prohibition. It is the structure already in place:

- **The operator signs once, with a cap.** `TrustStakeCapEnforcer` bounds how much per rolling
  period; `DomainScopeEnforcer` bounds where. An out-of-scope or over-cap attempt reverts **before
  any state change**. Both are deployed on mainnet 1155 (`data/deployments/1155.json`).
- **ARP holds no funds and signs nothing.** It cannot lose anyone's money by operating, because it
  never has any. The TRUST is the operator's, and the limit is the operator's own.
- **The deposit is recoverable.** A position can be redeemed. A fee cannot — see the costs below.

### What this authorises, precisely

An agent, under a delegation its operator signed, may:

- create the `(agent, uses, tool)` triple for a tool it used, and
- deposit TRUST on that triple,

on **Intuition testnet 13579 without further ceremony**, and on **mainnet 1155** once the path has
been proven on testnet end to end.

The testnet-first step is engineering prudence, not a rule: no rule forbids mainnet here, and the
money is not ARP's. But a spend path whose first execution is against real funds has never been
exercised, and the costs are not symmetric — read from the contract on 2026-10-19, mainnet 1155:

|                                          |                                                       |
| ---------------------------------------- | ----------------------------------------------------- |
| `getTripleCost()`                        | **0.100000000002 TRUST** — a fee, **not recoverable** |
| `minDeposit` (from `getGeneralConfig()`) | **0.01 TRUST** — a deposit, recoverable as shares     |

So one declared-and-staked tool costs about **0.11 TRUST**, of which 0.01 comes back. A bug that
loops costs 0.1 TRUST per iteration, unrecoverably, and the cap enforcer bounds the _deposit_ rather
than the _fee_. **That asymmetry is the reason for testnet first**, and it is worth stating because
the enforcer's name suggests more protection than it gives.

### What it does not authorise

- Deploying any ARP contract to mainnet. ADR `0025` stands.
- Atom or triple creation **at scale** on mainnet. ADR `0021` priced blanket coverage at ~14,300
  TRUST; this authorises an agent's own edges, not a sweep.
- ARP's own scripts spending ARP's own TRUST automatically. `rules/security.md`, unchanged.
- Anything signed on the agent's behalf by ARP. There is no such path and none should be built.

## Consequences

**Positive**

- `docs/tasks/16` is unblocked and is the project's front task. It is the loop itself.
- The risk sits with the party that chose it: an operator who signed a cap for their own agent.
- `docs/12`'s two recorded gaps are now both addressable — the guard rail is on the right chain, and
  this is the authorisation for the adoption half.

**Negative**

- ~~**The fee is outside the cap.**~~ **Corrected by ADR `0040` on 2026-10-19 — this bullet was
  wrong.** It claimed `TrustStakeCapEnforcer` bounds the deposit and that an agent in a loop "burns
  0.1 TRUST per iteration with the cap untouched". The enforcer decodes `value` out of the execution
  and nothing else (`contracts/src/enforcers/TrustStakeCapEnforcer.sol:101`), so the fee **is**
  counted and the loop would hit the cap. Left struck through rather than deleted, because this ADR
  is append-only record and the wrong version propagated to four other files from here.

  The real limitation: **the cap bounds the amount, not the kind.** It cannot tell a non-recoverable
  fee from a recoverable deposit, so an agent can exhaust an operator's cap on term creation and
  hold no position. A bound that could tell them apart would have to decode calldata and know every
  term-creating selector; **not built**, and recorded as such in `docs/15_ROADMAP.md` Phase 3.

- A first mainnet spend will happen without ARP being able to reverse it. Intuition has no deletion,
  and a wrong edge is permanent even when its deposit is redeemed.
- The testnet-first condition is a judgement, not a mechanism. Nothing enforces it, so it holds only
  as long as someone reads this ADR.

**Neutral**

- This changes no rule. `rules/security.md` was scoped in the same session (ADR `0035`) and already
  distinguishes the two signers.
- The seven safeguards of ADR `0017` are about the panel's human-signed deposits and do not transfer;
  the agent path's safeguards are the caveats, which is a different and stronger mechanism.
