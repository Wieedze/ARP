# 11 — Back to calibration: what ARP is, and the plan to get there

**Date**: 2026-09-16
**Status**: correction + plan. Supersedes the differentiation argument in `docs/08` and `docs/09`.

---

## 1. The correction

`docs/08` and `docs/09` were written in one day from live measurements, without `docs/01`–`04` in front
of them. The measurements hold. **The differentiation argument does not.**

Those documents claim ARP's wedge is a capability index, a conviction market and execution receipts.
`docs/01` says something different and stronger:

> _The core innovation is **calibration over volume**: an agent's reputation weight in a given domain
> is determined by the accuracy of their past attestations in that domain, not by how many
> attestations they've made._

ARP is a **prediction-market-shaped reputation protocol**. An attestation is a falsifiable claim with
capital behind it. Reputation is having been right, per domain.

That is not adjacent to what `docs/09` argued — it sits above it.

### The evidence ladder was one rung short

`docs/09` §2 ends at _proven_. The real top rung is **calibrated**.

| Tier             | The claim                                          | Cost to produce                 | Who has it                                   |
| ---------------- | -------------------------------------------------- | ------------------------------- | -------------------------------------------- |
| 1 Asserted       | "I do X"                                           | one gas fee                     | ERC-8004 · 28,648 agents                     |
| 2 Rated          | "someone scored me 67.25"                          | nothing                         | Deep3 · 99.99% coverage                      |
| 3 Staked         | "capital is at risk on this"                       | capital                         | nobody, at size                              |
| 4 Proven         | "this executed under enforced caveats"             | a validated transaction         | nobody                                       |
| **5 Calibrated** | **"my past judgements in this domain were right"** | **being wrong costs the stake** | **nobody — and it is ARP's original thesis** |

Tiers 3 and 4 measure _commitment_. Tier 5 measures _accuracy_. Every competitor in this market —
Deep3, 8004scan, AsterPay, Helixa — scores agents on opinions held **about** them. ARP scores agents
on whether they were **right**. Nothing else on this graph does that.

---

## 2. What ARP actually is, in its own terms

`docs/02` names four components. This repo was only ever scoped to build the first.

| #   | Component                                                                                                                            | Status today                                                                                                                     |
| --- | ------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Module Registry** — permissionless registry of evaluation modules: a domain plus a schema for what an attestation in it looks like | **Built and deployed** (testnet 13579)                                                                                           |
| 2   | **Admission Contract** — verifies an ERC-8004 `agentId` exists before admitting an agent                                             | Not built. The hackathon's `IdentityRegistry` is a different thing — it _mints_, which `docs/01` explicitly says ARP must not do |
| 3   | **Reputation Loop** — agent stakes TRUST on an attestation, written via ERC-8004 `postFeedback`, indexer updates the derived score   | Not built. **This is the protocol.**                                                                                             |
| 4   | **Forked Indexer** — consumes ERC-8004 events + Intuition atoms + module definitions, outputs calibrated scores                      | Not built                                                                                                                        |

The storage rule from `docs/02` is load-bearing and was not violated today: attestations are canonical
on ERC-8004's Reputation Registry, scores are **never stored** — `algo + input = result`, reproducible
by anyone. A Merkle checkpoint is the periodic on-chain anchor, with a ZK proof of correct execution
as its eventual replacement.

---

## 3. Where today's work actually sits

Honest accounting, because a plan built on a flattering one is useless.

**Serves the real thesis:**

- `ModuleRegistry` — component 1, done.
- The three seed schemas (`solidity-audit`, `url-classification`, `claim-verification`) — each already
  names a **ground truth source** in `docs/04`. That is the hard part of calibration, already thought
  through.
- `@arp-protocol/erc8004` — an indexer needs exactly this read path, and component 4 is an indexer.

**Adjacent — good software, wrong axis:**

- The trust panel and the connector's assessment merging read _other providers' opinions_. Under the
  real thesis that is a competitor's output, not ARP's product. It earns its place as distribution and
  as proof of execution capacity, not as the differentiator.
- The curation market stakes on whose opinion to believe. Useful; not calibration.

**From the hackathon, not from the thesis:**

- The ERC-7710 enforcers and the delegation flow. `docs/02`'s four components do not mention them.
  They bound _spend_; calibration measures _accuracy_. They are a real asset with a real use (§6) but
  they are not the protocol.

Nothing here is wasted. But the centre of gravity moved during the hackathon and never moved back, and
`docs/08`/`09` codified the drift rather than catching it.

---

## 4. The crux nobody has solved: ground truth

Calibration needs an answer to _"was the attestation right?"_. Without resolution there is no
calibration, and every phase below is gated on it. `docs/00` listed it as out of scope; that deferral
is now the critical path.

`docs/04` already names a source per domain, and they are not equally hard:

| Module               | Ground truth source                                                | Honest difficulty                                                                                                                                    |
| -------------------- | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `solidity-audit`     | post-audit disclosure by the project or a third-party audit        | **Tractable.** Slow (months), sparse, but unambiguous and externally verifiable. Start here.                                                         |
| `claim-verification` | consensus of high-calibration agents, plus a human-labelled subset | **Circular at genesis.** Needs calibrated agents to calibrate agents. The human-labelled subset is the bootstrap, and its size is the real question. |
| `url-classification` | community consensus or human expert labels                         | **Subjective.** "Scam" resolves; "tutorial vs product" often does not.                                                                               |

This ordering is the plan's spine: resolve where truth is externally checkable, and only then extend
to domains where it is contested.

---

## 5. The plan

Gated on outcomes, not dates. Each phase is worthless without the one before it.

### Phase A — Make an attestation a real object

Component 3's write half. An agent stakes TRUST on a prediction conforming to a registered module's
schema, and it lands on ERC-8004's Reputation Registry via `postFeedback` — not in an ARP contract,
per `docs/02`'s single-source rule.

Scope to `solidity-audit` alone. One schema, one domain, real stake.

**Gate:** an attestation posted by an agent, on the canonical registry, that any third party can read
and validate against the module schema without asking ARP anything.

### Phase B — Resolution, for one domain

The part nobody has. A resolver that takes a `solidity-audit` attestation and a later published audit
and produces a verdict: what did the agent predict, what turned out to be true, how far off.

Deliberately not automated at first. A resolution is a claim like any other — it can be published,
disputed and staked against. Building the _record_ of resolutions matters more than building a machine
that produces them.

**Gate:** ten resolved attestations against real post-audit disclosures, with the reasoning published
and reproducible.

### Phase C — Calibration, and it is falsifiable

The algorithm `docs/02` calls "the differentiation". Given resolved attestations, a per-agent,
per-domain accuracy score, weighted by stake and stated confidence — an agent that says 0.9 and is
wrong must lose more than one that said 0.6.

Non-negotiable per `docs/02`: **the score is not stored.** It is derived, reproducible from
`algo + input`, and anyone re-running it must get the same number. That is the property no competitor
offers — Deep3 publishes a number, ARP publishes a number _and the means to check it_.

**Gate:** two independent implementations of the spec agree on the same inputs.

### Phase D — The indexer, and the anchor

Component 4. Consumes ERC-8004 events, Intuition atoms and module definitions; serves calibrated
scores. Periodic Merkle checkpoint on-chain as the composability anchor, shaped so a ZK proof of
correct execution can replace it without migration.

**Gate:** a third party reproduces a checkpoint from public inputs.

### Not a phase

The trust panel, the connector and the curation market ship as they are. They are the credibility
artifact and the distribution surface — and the panel is the natural place for a calibrated score to
appear next to everyone else's, once one exists.

---

## 6. How this articulates with an agent infrastructure

The question that prompted this document.

An infrastructure like Deep3 runs agents that make **falsifiable claims about the world** — wallet
analyses, trade recommendations, risk assessments. Those claims resolve. Today nobody scores them on
whether they were right; they are scored on feedback from whoever bothered to leave some.

ARP is where those claims get measured against outcomes. Concretely:

- **For the infrastructure:** "our agents are calibrated at 0.82 in this domain over 400 resolved
  attestations" is a claim no competitor can make, because no competitor resolves anything. It is also
  a claim they cannot fake, because being wrong costs stake.
- **For ARP:** a partner with agents that already make resolvable claims is the fastest path to a
  populated Phase B. The bottleneck is resolved attestations, and they have the volume.
- **For a buyer:** a calibration score is the first number in this market that answers "should I act
  on what this agent tells me" rather than "did people like it".

This is also why ARP must not become one more scoring provider first. `docs/01` says ARP is B2B
infrastructure and not a proprietary scoring platform. A participant cannot be the neutral scorer of
other participants — and today's signature-verification work already established ARP in the neutral
role. Publishing a rival score would spend that.

The delegation layer has a real place here, and a narrower one than `docs/09` implied: an attestation
posted under a bounded delegation is one whose stake was capped and whose domain was enforced
on-chain. That makes the _stake_ behind a prediction credible without trusting the agent's operator.
It supports calibration; it is not a substitute for it.

---

## 7. What this changes

- `docs/09` §2's ladder gains tier 5, and §3's "what ARP is" is subordinate to `docs/01`'s one-liner.
- `docs/08`'s option set stands as analysis. Its O3 — ARP as a trust provider — is **demoted**: it
  publishes a score of the same kind as everyone else's. It becomes worth doing only once there is a
  calibrated score to publish, and then it is the delivery mechanism, not the product.
- The competitor to watch is the one `docs/01` already named: **8004scan**, with a fixed 7-dimension
  proprietary grid. `docs/08` treated Deep3 as the thing to answer because Deep3 holds the coverage.
  On the real axis both are the same answer — a grid someone else defined, scored on opinions.

Nothing in `docs/02` is amended. Its four components and its storage rule are the architecture; this
document is the route back to them.
