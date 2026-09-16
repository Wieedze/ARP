# 09 — ARP: positioning and plan

**Date**: 2026-09-16
**Status**: **Active strategic commitment.** Supersedes `docs/00_HACKATHON_PIVOT.md`, which expired
with the Cook-Off deadline on 2026-06-15 and is now historical record.
**Evidence base**: `docs/08_ERC8004_AGENT_LAYER_OPPORTUNITY.md` — every claim about the market below
is a measurement, reproducible with the queries in its Appendix A.

---

## 1. The sentence

> **ARP is the layer that makes agent reputation actionable: it indexes what agents can actually do,
> prices who is willing to lose money saying so, and produces on-chain proof that an agent did the
> work — then hands you a bounded delegation so you can pay one without trusting it.**

Everything below either supports that sentence or is out of scope.

---

## 2. Why this document exists now

Three things changed between June and September 2026.

**The agent population arrived.** 28,648 ERC-8004 agents were mirrored onto Intuition's knowledge
graph in September. Before that, ARP was a well-built demo with a 14-tool manifest. Now there is a
real cohort to serve.

**The reputation slot was taken while we were not looking.** Deep3 Labs holds 28,644 of the 28,683
`has trust provider` edges — 99.99% coverage — with an open-source, deterministic, competently built
scorer. ADR 0015 had ARP heading toward "become a trust provider". Arriving second into a
winner-takes-most slot with a worse distribution story is not a plan.

**The empty layers became visible.** Across the entire Intuition mainnet graph — 284,187 triples —
there are 194 `use` triples, 184 `uses`, and 120 `has category`. Every agent carries a trust score;
almost none carries a statement of what it is _for_. And every `has trust provider` vault, the
staking surface Intuition designed to answer "whose opinion deserves weight", carries one or two
positions, all bootstrap deposits from the wallet that wrote the edge.

So the market has a reputation layer with no capability layer under it and no economic layer behind
it. That is the opening.

---

## 3. The evidence ladder

This is the whole argument. Trust signals are not interchangeable; they differ by **what they cost to
produce**.

| Tier             | The claim                                     | What it costs to produce                   | Who supplies it today                          |
| ---------------- | --------------------------------------------- | ------------------------------------------ | ---------------------------------------------- |
| 1 — **Asserted** | "I am an agent, I do X"                       | one gas fee, once                          | ERC-8004 registration · 28,648 agents          |
| 2 — **Rated**    | "someone scored this agent 67.25"             | **nothing** — feedback is free to write    | Deep3 Labs · 99.99% coverage                   |
| 3 — **Staked**   | "I have capital at risk on this claim"        | capital that can be lost                   | **nobody, at any real size**                   |
| 4 — **Proven**   | "this action executed under enforced caveats" | an actual transaction a contract validated | **nobody — and ARP already has the machinery** |

ERC-8004's Reputation Registry is deliberately thin. It stores a number and a tag, enforces only that
an agent cannot rate itself, and costs nothing to write. The spec says outright that Sybil attacks
are possible and that it expects others to build the reputation systems. Everyone who has answered
that call so far has answered it at **tier 2** — aggregating free feedback more cleverly.

You cannot aggregate your way out of a costless input. Deep3's rank-based scorer is a genuinely good
answer to "reviewers use incompatible scales"; it is not, and does not claim to be, an answer to
"this review cost nothing to fabricate". The measured consequence: the median agent in the cohort is
scored on **one reviewer**, and three different agents currently show an identical 67.25 — the same
single review propagated through a deterministic curve.

**ARP's position is tiers 3 and 4.** Not because tier 2 is bad work, but because tier 2 is finished
work and the ladder has rungs above it that nobody is standing on.

Tier 4 deserves emphasis because it is the one that cannot be copied cheaply. An execution receipt is
not an opinion about an agent — it is the record that a specific action passed a specific caveat
enforcer before any state changed. Producing it requires having built bounded execution. That is the
expensive, unglamorous part of the stack that everyone else skipped, and ARP shipped it: two custom
enforcers, deployed and tested, composing with the delegation framework.

---

## 4. What ARP is, and what it is not

### Is

- **A capability index.** What each agent can do, in what domain, composed from which tools — written
  as immutable triples on the shared graph, queryable by anyone.
- **A conviction market.** Staked TRUST on specific claims, including the claim that a given
  provider's assessment of a given agent is worth believing.
- **A proof-of-execution layer.** Receipts derived from redeemed delegations, distinguishing what an
  agent _declared_ from what it _did_.
- **A bounded-hiring surface.** One signature gives an agent a domain-scoped, budget-capped authority
  that reverts at the framework level when exceeded.
- **A read API and SDK** that merges all of the above with every other provider's assessment, with
  signatures verified and freshness enforced.

### Is not

- **Not an identity registry.** ERC-8004 owns identity; Intuition owns the canonical atom. ARP's own
  `IdentityRegistry` was correct for the Cook-Off demo and stays a testnet fixture. Minting a
  competing identity on mainnet would fragment the exact surface this architecture exists to unify.
- **Not a feedback aggregator.** That slot is filled, the incumbent is good at it, and the input is
  free. ARP consumes those scores and displays them honestly next to its own.
- **Not a compliance or KYA product.** Sanctions screening and operator KYB are a different business
  with different buyers.
- **Not an agent runtime.** ARP does not run models, invoke tools, or deliver results. It is
  declarative, coordination, and economic accounting. Runtime-agnostic by design, and that stays
  true.
- **Not a competing graph.** Every write goes onto Intuition using the canonical predicates and the
  frozen recipe.

The discipline in that second list is the point. ARP's failure mode has always been doing more, not
less.

---

## 5. Who it is for

Three audiences, three jobs, one substrate.

**The buyer — someone who needs work done.**
Job: _"which agent, and how do I cap the damage if I'm wrong?"_
Today they get a number with no capability context and no safe way to pay. ARP gives them a
capability filter, a merged trust panel showing every provider's view with signatures checked, and a
single delegation that bounds what the agent can spend and where.

**The builder — someone who ships an agent or a tool.**
Job: _"how do I get found, and how do I get credit for being genuinely useful?"_
Today, 54% of the cohort is an anonymous `Agent 8453:NNNN` with no statement of purpose. ARP gives
them a capability declaration that makes them discoverable, composition triples that credit the tools
they build on, and stake accrual on those tools as others adopt them.

**The ecosystem — wallets, marketplaces, frameworks, other providers.**
Job: _"give me one query that answers everything about an agent."_
ARP is the integration point: one read, every provider, provenance on every field. This audience is
also the distribution strategy — ARP does not need its own users if it is the layer other products
read.

---

## 6. Why ARP and not someone else

Honest ranking, strongest first.

1. **The execution tier requires infrastructure nobody else built.** Enforcer contracts, a delegation
   flow, runtimes that redeem. A competitor starting today would need to build all of it before
   producing a single receipt. This is the durable advantage.
2. **The capability layer compounds.** Every agent indexed makes the "which agent can do X" query
   more useful, which attracts the next integrator. Copyable in principle; expensive to catch up on
   in practice, and only one party is doing it.
3. **Curation is first-come.** The partner guide says it plainly: the providers who publish early are
   the ones consumers learn to query first. The market is nearly empty, so position is available at
   almost no cost.
4. **Complement, not competitor.** ARP's dimensions are deliberately orthogonal to the incumbent's.
   That makes partnership the natural posture rather than a fight for the same slot — and partnership
   is how a small project gets distribution.

And the honest counterweight: **none of this is the binding constraint.** The binding constraint is
adoption. See §9.

---

## 7. The plan

Four phases, each gated on an outcome rather than a date. A phase does not start until its gate
passes; a failed gate is information, not a delay to push through.

### Phase 0 — Unblock the write path

`tasks/06-pin-writes-server-side.md`. Pinning moved to a gated endpoint and ARP never followed; every
atom-minting path in the repo is dead. The partner key is in hand.

**Gate — PASSED 2026-09-16.** `bun run verify:pin` returns MATCH: the canonical recipe for agent
`8453:6649` reproduces `ipfs://bafkreif6xwptjdsux2iwnhdbxyjom23bzzimhk62y574rreexdghi6hlbq`,
byte-for-byte identical to that atom's on-chain `data`. ARP can derive any agent's canonical atom
locally and preflight before minting, so the duplicate-atom fragmentation this architecture cannot
recover from is off the table. The refactor in task 06 is what remains of Phase 0.

### Phase 1 — Become a credible reader

`docs/08` **O1** (connector + public read API) and **O6** (curation market UI). Both read-side, both
unblocked, neither needs the key.

The deliverable is a merged trust panel for any of the 28,648 agents: every provider's assessment,
each signature verified, each freshness window enforced, each provider's claim shown with its live
support and opposition market and a way to take a position.

Nobody ships this today. Nobody verifies provider signatures at all.

**Gate:** the panel renders correctly for an arbitrary agent picked at random, including one with no
metadata and one with multiple providers. Then — and this is the real point of Phase 1 — take it to
Intuition and Deep3 as a working artifact rather than a proposal.

### Phase 2 — Claim the empty layer

`docs/08` **O2**. Index capability for the cohort: read each agent's registration file, extract
declared skills, tools and endpoints, write the canonical classification triples.

Start with the ~13,000 agents that have real metadata. The 15,513 anonymous ones are a second pass
and a data-quality contribution in their own right.

**Gate:** "which agents can do X" returns a useful, non-trivial answer for at least three distinct
domains. If registration files turn out to be too sparse or too heterogeneous to parse honestly, this
gate fails — and that failure is the falsifier in §9, not something to paper over with inference.

### Phase 3 — Publish a signal that costs something

`docs/08` **O3** (trust provider with stake-derived dimensions) and **O4** (execution receipts).

O3 publishes `null` with an explicit `insufficient-evidence` band wherever the evidence is thin.
Refusing to score is a feature when half the market scores on one reviewer.

O4 turns a byproduct into the product: the enforcers already emit on every check, and
`DomainScopeEnforcer` already proves an action fell inside a declared domain. Index those, fold them
into the assessment as evidence, and the distinction between _declared_ and _proven_ becomes legible
to everyone.

**Gate:** first assessment live at the canonical resolver path with a verifying signature; first
execution receipt produced by a real delegated action.

### Phase 4 — Close the loop

`docs/08` **O5**. Point the existing hire flow at the real cohort. Hiring produces receipts, receipts
feed assessments, assessments improve ranking, ranking drives hiring.

Scope the launch to agents with a resolvable endpoint — an honest subset — and say so in the UI
rather than pretending the whole cohort is hireable.

**Gate:** one end-to-end hire by someone who is not us.

### Not a phase

**O7 (cross-chain coverage)** is a partnership offer, raised in Phase 1 and built only if invited.
Two thirds of the ERC-8004 population is invisible to the graph, and mirroring it unilaterally risks
duplicating canonical atoms — the exact fragmentation the frozen recipe prevents. Propose it; do not
ship it uninvited.

---

## 8. What we measure

Per phase, in public, because a trust layer that reports its own numbers selectively has no business
scoring anyone.

| Phase | Metric                                                                          | Why this one                                                     |
| ----- | ------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| 1     | agents renderable through the connector; provider signatures verified vs failed | proves coverage and surfaces provider quality nobody else checks |
| 2     | agents with ≥1 capability triple; distinct domains populated                    | the moat, counted                                                |
| 3     | assessments published; **agents scored `insufficient-evidence`**                | the second number keeps the first one honest                     |
| 4     | hires completed; execution receipts produced; receipts per hire                 | the loop either closes or it does not                            |

Throughout: **distinct stakers** on ARP-touched vaults, never bare market cap. A market this thin is
moved by one participant, and reporting market cap alone would misrepresent it.

---

## 9. How we would know we are wrong

Four falsifiers, each with a stated consequence. Written down now so they cannot be rationalised later.

**Nobody stakes.** Phase 1 ships the curation UI and the vaults stay at one or two positions. Then
economic conviction does not work at this market size, tier 3 is aspirational, and ARP's real product
narrows to capability indexing plus execution receipts. Survivable, materially smaller.

**Registration files are garbage.** Phase 2 finds the metadata too sparse or inconsistent to index
without guessing. Then the capability moat does not exist to be claimed, and the honest response is
to build the capability layer from _observed_ behaviour — which means execution receipts become the
only path, and the plan collapses into Phase 3.

**The incumbents ship capability indexing.** Entirely possible; it is the obvious next move for
whoever owns the identity mirror. Then ARP's wedge narrows to tier 4 alone. Still defensible, much
smaller, and it argues for moving fast on Phase 2 and for proposing partnership early rather than
competing quietly.

**Nobody hires.** Tier 4 starts empty by construction and only fills through use. If Phase 4's gate —
one end-to-end hire by someone who is not us — cannot be met, the proof layer never accumulates
evidence and the whole ladder argument is theoretical.

The common thread: **cold start is the actual risk, not competition.** Every measurement in `docs/08`
says the market is empty, and an empty market is as easily evidence of no demand as of an opening.
Phase 1 is deliberately cheap and read-only so that this question gets answered before much is spent
on it.

---

## 10. Governance

On acceptance of this document:

1. `docs/00_HACKATHON_PIVOT.md` becomes **historical record**. It stays in the repo as the reason the
   MetaMask and Intuition stack was chosen; it stops being a source of authority.
2. `CLAUDE.md`'s "source of authority" list re-points: this document first, then
   `docs/02_ARCHITECTURE.md` (locked decisions, unchanged), then `docs/03_MVP_SCOPE.md`.
3. The **narrative-preservation check** on tasks 02b/03b/04b/05b retires with the hackathon. Its
   replacement, for tasks under this commitment, is one sentence in the completion report:

   > _Which tier of the evidence ladder does this serve, and does it move ARP up it?_

   Same function — a cheap check that an implementation has not drifted from the thesis.

4. `ADR 0015` stands, with its emphasis corrected: ARP still adopts the canonical pattern and still
   publishes as a trust provider, but that is Phase 3 and a _consequence_ of the positioning rather
   than the positioning itself. Becoming one more voice in the rating slot was never the plan worth
   having.
5. `ADR 0014` is superseded by 0015 as already recorded; ARP's `IdentityRegistry` is explicitly
   scoped to testnet as a demo fixture, per §4.

Items 1–3 are edits to `CLAUDE.md` and are not applied by this document. They need an ADR of their
own, because the router does not change silently.

---

## References

- `docs/08_ERC8004_AGENT_LAYER_OPPORTUNITY.md` — the measurements, the option set, the sequencing detail
- `docs/07_INTUITION_ERC8004_PARTNER_GUIDE.md` — canonical write pattern and term IDs
- `docs/02_ARCHITECTURE.md` — locked decisions, unchanged by this document
- `docs/00_HACKATHON_PIVOT.md` — superseded; historical record
- ADR `0015` (canonical ERC-8004 pattern), `0016` (server-side writes), `0010` (two-layer model), `0012` (agent positioning)
- `tasks/06-pin-writes-server-side.md` — Phase 0
