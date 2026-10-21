# 0046 — ARP scores nobody; it makes staking possible and reads the result

**Status:** Accepted
**Date:** 2026-10-20
**Triggered by:** user decision, verbatim — _« ARP ne note personne. ARP permet de miser et de lire.
C'est la décision. »_ Reached while working out where an agent must deposit for reputation to build.

## Context

Two questions turned out to be one. "Where does an agent buy a share so that reputation builds?"
cannot be answered without first answering "does ARP publish an opinion?", because the canonical
Intuition pattern routes a provider's opinion through a stakeable vault and that is the obvious place
to put ARP.

**ADR `0015` already decided this — and never took.** Dated 2026-07-23, it is the only ADR of 46 still
at `Proposed`. Its decision point 3 commits ARP to publishing "calibrated dimensional scores" signed
by a provider key, and point 4 to registering as a trust provider. Nothing in the repo implements
either, and the decision has been load-bearing in the codebase only through its _other_ points.

**Measured before deciding** — mainnet 1155, 2026-10-20,
`scripts/measure/trust-provider-objects.ts` (committed with this ADR):

| predicate              | edges  | distinct objects | distribution                                                          |
| ---------------------- | ------ | ---------------- | --------------------------------------------------------------------- |
| `has trust provider`   | 28,683 | **3**            | Deep3 Labs 28,644 (99.86%) · AsterPay KYA 27 (0.09%) · Helixa Cred 12 |
| `has trust assessment` | 28,757 | 250              | one source per agent-provider pair                                    |

So the edge is a **provider slot** in practice. The four-triple pattern is permissionless, so nothing
structurally stops one agent becoming a provider for another — but what the edge _means to a reader
today_ is "a dedicated scoring company assessed this agent". Treating a semantic possibility as
current meaning is exactly ADR `0030`'s failure, which cost 21 permanently stranded triples.

**And the method ARP would have been copying is Deep3's.** Its own assessment documents, vendored at
`packages/protocol/test/fixtures/deep3-*.assessment.json`, declare
`"source": "ERC-8004 ReputationRegistry feedback, revoked entries excluded"`. Aggregating free 8004
feedback into a score is its existing product, with 28,644 edges against ARP's zero.

## Decision

**ARP scores nobody. ARP makes staking possible and reads the result.** Three parts.

### 1. ARP publishes no score, rating or assessment of any agent

It prepares calls the agent signs (ADR `0038`) and it reads the graph. Every figure ARP surfaces is a
deposit somebody else made, never ARP's judgement.

The reason is internal consistency, not modesty. ARP's whole argument is that its input is not free
because it is staked money. Adding ARP's own score on top replaces the money with a judgement, and
then the argument is somebody else's.

### 2. ~~A deposit goes on a claim that can be contradicted~~ — **both halves amended by `0056`**

- ~~**Not on an identity atom.**~~ **Amended by ADR `0056`, 2026-10-21 — read it before relying on
  this bullet.** The reasoning below still holds and `0056` accepts it; the *prohibition* does not.
  A deposit on an agent's identity atom is now allowed, on three conditions: it is named a **market**
  and never reputation, the UI states it has no other side, and it is never added to the count of
  clients who declared using the agent. What forced the change is that the only claim left —
  `(client, uses, agent)` — turned out not to be a market either: measured on mainnet 1155,
  **1 of 185** `uses` edges has ever been contradicted and **969 of 285,775** triples chain-wide
  (`scripts/measure/counter-side-usage.ts`).

  The original reasoning, which stands: an identity carries no assertion, so a stake on it cannot be
  wrong and nobody can meaningfully take the other side. What it would measure is **attention**, not
  trust — a visibility market wearing a reputation label.
- **Not one triple per interaction.** `docs/07` names this anti-pattern directly: mutable data written
  as direct triples "fragments the staking surface and forces consumers to migrate". Stable shell,
  mutable JSON behind it.
- **The claim that works today is `(agent, uses, tool)`** — an assertion about a fact, which the tool
  can deny, which gets a free counter-triple, and which `getToolUsage` already prices. `docs/12`
  points 3 and 4, already built.

### 3. The position is the measure; the triple is only its support

Because a position can be withdrawn and the counter-triple staked, reputation is **live** rather than
accumulated. Therefore **no historical cumulative is ever displayed.** "50 TRUST staked since the
beginning" is false if 40 were withdrawn. Current position, with the counter beside it.

**Reachability, before anyone reads this as a bug report** (`rules/claims.md` check 1): no historical
total is displayed anywhere today. `app/src/hooks/use-vault-metrics.ts:47` says "cumulative" but
reads current vault state. This part is **latent protection, not a live fix.**

What _is_ live in the same family: `packages/protocol/src/tool-usage.ts:235-238` sums `totalAssets`
and position counts **across edges**. True per vault, false of a sum — the error ADR `0023:90-92`
predicted in writing, and the third member of the family after ADR `0042` (a vault's assets are not
evidence of a stake).

## What this resolves in ADR `0015`

Partially accepted, and it stops being `Proposed`:

| `0015`'s point                                      | now                                                                         |
| --------------------------------------------------- | --------------------------------------------------------------------------- |
| 1 — term IDs are constants, never resolved by label | **stands** — implemented in `sources/intuition/terms.ts`                    |
| 2 — the registration-derived atom is the subject    | **moot** — settled independently by ADR `0032`                              |
| 3 — no mutable scores as triples                    | **stands**; "ARP's calibrated dimensional scores" **rejected** — none exist |
| 4 — register ARP as a trust provider                | **rejected**                                                                |
| 5 — preflight before minting                        | **stands**                                                                  |
| 6 — ADR `0010` amended                              | stands, minus the clause making `has trust provider` ARP's stake surface    |

Two obligations `0015` listed under Negative disappear with it: **operating a resolver domain** with
uptime and freshness commitments, and the **mainnet Partner API key** dependency on Intuition's
timeline.

## Alternatives considered

- **ARP as a trust provider whose assessment is a transparent function of public staked data** — not
  rejected on principle. Staking on `(agent, has trust provider, ARP)` would then price ARP's
  **method** rather than its opinion, which is a real difference from aggregating free feedback.
  Declined for now: it is not needed for the loop to work, it re-adds both obligations above, and it
  is the one shape that slides into being a score without anyone noticing. If revisited it needs its
  own ADR and the assessment must never be proprietary.
- ~~**Staking on the agent's identity atom** — rejected. Nothing to contradict, so nothing is
  learned.~~ **Amended by ADR `0056`, 2026-10-21**, on the same terms as §2 above: allowed, named a
  market, never summed with the edge count. This is the second copy of that prohibition in this file
  and it survived the first retraction — `rules/claims.md` §5, for the fourth time in this project.
- **Inventing a peer-vouching predicate** — deferred, not rejected. Unnecessary while
  `(agent, uses, tool)` carries the loop, and ADR `0030` is the price of choosing one carelessly.

## Consequences

**Positive:**

- ARP has no opinion to defend, so **ARP cannot be wrong about an agent** — the market can.
- Removes a production obligation (resolver uptime, freshness windows) and an external dependency
  (Partner API key) from the critical path.
- Settles the only `Proposed` ADR in the repo, open since 2026-07-23.
- Separates ARP from Deep3 **by kind rather than by quality**: Deep3 aggregates free feedback into a
  score, ARP prices usage. Competing on the first would start 28,644 edges behind.

**Negative:**

- ARP ships **no number a consumer can sort by**. Everything is "here is who staked what, decide".
  Consumers who want one figure will go elsewhere for it. That is `docs/01`'s positioning accepted on
  purpose, not a surprise to discover later.
- An agent's reputation is only as rich as what it declared and what others staked. With nobody
  staking the surface is empty, and ARP has **no way to fill it by fiat** — which is the honest cost
  of not scoring.

**Neutral (worth knowing):**

- A third party can build a score on ARP's data, and that is the intended division of labour —
  `docs/07:20`'s own framing of 8004 versus Intuition, applied one layer up.
- ERC-8004's **Reputation Registry** stays the canonical home for free feedback: `giveFeedback` costs
  nothing and the contract's one rule is that an agent cannot rate itself. ARP neither deploys nor
  writes it (ADR `0010:71`). Pricing that feedback — surfacing the gap between "left a review" and
  "paid to back it" — is a separate and undecided surface, and it is the one place the Reputation
  Registry becomes interesting to ARP.

## References

- Measurement: `scripts/measure/trust-provider-objects.ts` (mainnet 1155, 2026-10-20)
- Related ADR: `0015` (partially accepted here — the provider role is declined), `0030` (choose a
  predicate on meaning, not publication), `0032` (the subject atom), `0038` (prepare, never sign),
  `0042` (assets are not a stake), `0045` (the node, and the ladder rung it opens), `0010:71`
  (ReputationRegistry deliberately not deployed), `0023:90-92` (the cross-edge sum trap)
- Related doc: `docs/01_PROJECT_CONTEXT.md` (not one more score), `docs/12_THE_IDEA.md` points 3–4,
  `docs/07_INTUITION_ERC8004_PARTNER_GUIDE.md` (the four-triple pattern and its anti-pattern),
  `docs/14_THE_WITNESS_PROBLEM.md:159` (the ladder)
- Related rule: `.claude/rules/claims.md` (check 1 — reachability before blast radius)
