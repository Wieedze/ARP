# 0135 — A declaration can carry a domain and an outcome, written by the declarer

**Status:** Accepted
**Date:** 2026-11-05
**Triggered by:** `docs/tasks/63`, the user's question « dans quel contexte cet événement arrive ? » and
their answer that written facts must be reliable and paid

## Context

A `uses` edge says that a wallet paid to say an agent used a tool. It does not say in what situation,
or how it went. So the graph cannot answer "in video editing, what was used, and what failed?", and
the user named that as what makes traversing the graph worth anything. A triple can be another triple's
subject on 13579, and that shape already exists (459 of 81,324 triples, read 2026-11-05 by the session
that proposed this; not re-measured here).

## Decision

```
((agent, uses, tool), in context of, <category>)
((agent, uses, tool), has outcome, worked | failed)
```

1. **The vocabulary is closed.** A domain must already be a category under `tool`, an outcome one of
   two words. Free text never reaches the chain, and a request's own words never do.
2. **`in context of` is the predicate already on this chain's deployment record**
   (`arp.endpointBinding.inContextOf`). `has outcome`, `worked` and `failed` are plain-string atoms.
3. **A qualifier counts for an agent only if the wallet that wrote the `uses` edge wrote it.** A subject
   carries no authorisation (ADR `0032`), so anyone can write `(your edge, has outcome, failed)`.
   `getPulseUsage` returns those apart, as `byOthers`.
4. **An outcome is an agent's word about its own use, never ARP's verdict on a tool** (ADR `0049`).
5. **Testnet only, and direct signing only, for now.** The sponsored path is not extended by this ADR.

## Alternatives considered

- **A predicate per context** (`uses-in-video`): one vocabulary term per pair, and a reader cannot walk
  from the category. The memory of this idea predates nested triples being checked.
- **A document with the context, pinned and attached**: readable only after fetching each one, and the
  question is one a graph query should answer.
- **Local only**: the user's constraint and trace stay local, but a fact other agents read has to be
  public, attributed and paid.

## Consequences

**Positive:** the graph can be walked from a situation to a tool, and a failure has an author.

**Negative:** each qualifier is a paid triple, about 0.1 TRUST each on mainnet at the 2026-11-04 cost,
plus the first-time atoms. `(edge, has outcome, worked)` and `(edge, has outcome, failed)` can both
stand, since an agent can use a tool twice; a reader sees both. A triple has one creator and later
writers only deposit, so reading the creator misses a later backer.

**Neutral (worth knowing):** the first writer of `(edge, has outcome, failed)` other than the declarer
takes the triple's creator slot, so the declarer's own later statement would be a deposit that this
reader does not see. Reading positions instead of creators closes that, and is left for when anybody
but ARP writes these.
