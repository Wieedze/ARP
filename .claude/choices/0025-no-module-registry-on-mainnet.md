# 0025 — No `ModuleRegistry` on mainnet; domain lives in the graph

**Status:** Accepted
**Date:** 2026-09-16
**Triggered by:** user decision, after the two caveat enforcers were deployed to Intuition mainnet and the question "what is `ModuleRegistry` actually for" was put directly.

## Context

The two ARP caveat enforcers were deployed to Intuition mainnet (chain 1155) on 2026-09-16 — the guard rail belongs on the chain where the agents and the MultiVault are. That surfaced the next question: does `ModuleRegistry` follow?

Reading the contract rather than the narrative, it provides three things:

1. **A call a caveat can bound.** `registerModule` is a function, so `DomainScopeEnforcer` can restrict which domains an agent may publish in. This cannot be done on the graph: the domain is not a parameter of `createTriples`, it is semantics inside the graph.
2. **`creator` bound to `msg.sender`** — unforgeable authorship.
3. **On-chain composability** — another contract can read the module list.

And one thing it does _not_ provide, contrary to how it reads: its uniqueness constraint is on the
**schemaURI**, not on the tool. Two people registering the same tool under two different schemaURIs
produce two modules, two atoms and two pools of stake. What actually gives a tool one identity is the
schemaURI itself (ADR 0008), from which the atom deterministically derives. The registry only refuses
the same URI twice.

The decisive observation: **tool staking works without it.** An agent deposits into the tool's atom in
the MultiVault; the atom derives from the schemaURI. The reputation mechanism in `docs/12` runs with
no registry on that chain.

What breaks without it is only that a tool's domain has no on-chain answer on 1155 — and therefore
that `DomainScopeEnforcer` has nothing to gate there.

## Decision

**`ModuleRegistry` is not deployed to Intuition mainnet.** A tool's domain is expressed on the graph as
`(tool, has category, <domain>)`, using Intuition's canonical `has category` predicate — already a
constant in the connector.

Consequences accepted deliberately:

- **The domain guard rail does not exist on mainnet.** The stake cap does, and it is the one that
  bounds real money. A domain bound can come back later as a new enforcer shaped by what the data
  actually shows is needed, rather than by what was built for a hackathon.
- **`DomainScopeEnforcer` at `0x4E20279EeE9f77673A4f1605E58607cD9A597d70` on 1155 is inert.** It was
  deployed minutes before this decision, and under it there is nothing for it to gate. It is recorded
  in `deployments/1155.json` as deployed-and-unused rather than quietly left for someone to find and
  puzzle over. Cost: a fraction of the 0.0000228 TRUST the pair cost to deploy. Not worth a
  redeployment to tidy.
- **No on-chain composability for the module list on mainnet.** Nothing consumes it today.

`ModuleRegistry` on testnet 13579 is untouched and still the registry for everything demo-side.

## Alternatives considered

- **Deploy `ModuleRegistry` to mainnet** — rejected for now. It would exist mainly so that an enforcer
  built for it has something to gate, which is close to circular. The independent reasons — authorship
  and contract composability — have no consumer yet.
- **Redeploy a domain-aware enforcer that reads the graph** — rejected. A caveat enforcer runs inside
  a redemption and cannot query an off-chain indexer; reading domain from the graph on-chain is not
  available. If a domain bound is wanted later it needs a different mechanism, and that is exactly
  what "a new enforcer shaped by other measures" means.
- **Skip the mainnet enforcers entirely** — rejected, and already overtaken: the stake cap is the part
  that bounds real money, and `docs/12` makes the guard rail part of the mechanism rather than an
  add-on.

## Consequences

**Positive:**

- One fewer contract to maintain on a real-money chain, for a surface nothing consumes yet.
- The domain stays where the rest of the semantics already live, which is the graph.
- A future enforcer gets designed against observed behaviour instead of inherited assumptions.

**Negative:**

- An agent operating under a mainnet delegation can stake on a tool in any domain. The cap bounds how
  much; nothing bounds where. That is a real reduction in the guard rail and it is the price of this
  decision.
- An inert contract sits on mainnet. Documented here and in `deployments/1155.json`.

**Neutral:**

- `docs/12`'s mechanism is unaffected — it never required the registry for staking.
- Nothing about testnet changes.

## References

- Related doc: `docs/12_THE_IDEA.md` — the mechanism, and the guard rail's place in it
- Related ADR: `0008` (schemaURI as the canonical tool URI — why the registry's uniqueness is narrower than it looks), `0010` (two-layer model), `0017` (real TRUST on mainnet)
- Deployment record: `deployments/1155.json`
