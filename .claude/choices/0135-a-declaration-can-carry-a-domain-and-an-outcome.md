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
3. **A qualifier counts for an agent only if the wallet that wrote the `uses` edge stands behind it**:
   it created the triple or holds a position. A subject carries no authorisation (ADR `0032`), so
   anyone can write `(your edge, has outcome, failed)` first. `getPulseUsage` returns others' lines
   apart, as `byOthers`, and a plan given a `declarer` deposits on a line that already exists.
   Lists order on distinct wallets, not agents.
4. **An outcome is an agent's word about its own use, never ARP's verdict on a tool** (ADR `0049`).
5. **Testnet only, and direct signing only, for now.** `arp_declare_used` refuses a qualifier off
   13579. The sponsored path is not extended by this ADR.

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

**Latent, none reached today (`intuition-integrator`, 2026-11-05; all `has outcome` triples on 13579
were written by their edge's creator):**

- **Nothing proves a wallet controls the agent it writes about.** Anyone can write `(Agent 6, uses,
  tool)` first and it reads as that agent's word. The ordering counts wallets, so several wallets
  still buy several lines, at about 0.004 tTRUST of fees per line. Checking the writer against the
  agent's owner closes it where a registry is readable.
- **A sponsored edge's creator is the treasury** (31 of 184 `uses` edges on 13579), so an agent's own
  qualifier on it lands in `byOthers`.
- **A domain and an outcome are sibling triples**, so one edge with `audio`, `video` and `worked` counts
  as worked in both.
- **Unlike a declaration's plan, this one reads no preview**, as `category.ts` does not. It relies on
  `cost + minDeposit`; all six qualifiers read back with a position.
