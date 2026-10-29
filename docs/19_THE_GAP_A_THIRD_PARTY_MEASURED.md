# 19 — The gap, measured by somebody else

**Date**: 2026-10-29
**Serves**: the positioning. `docs/01` is still authoritative on what ARP is; this says what the
market looks like from outside, on evidence ARP did not produce.

---

## Why this document exists

Every figure ARP has used to argue its position was measured by ARP. That is a weakness and
`rules/claims.md` §3 names it: a claim about what a third party said carries a citation or it does
not get written.

There is now a peer-reviewable empirical study of the ERC-8004 ecosystem —
*Can Trustless Agents Be Trusted?*, arXiv [2606.26028](https://arxiv.org/abs/2606.26028). It crawled
on-chain Identity and Reputation events, off-chain registration files, and x402 payment transactions
on Ethereum, BNB Smart Chain and Base, from deployment through **2026-05-13**.

It is the first independent measurement of the surface ARP reads, and its conclusions are the
market ARP is positioned into.

## What it found

### Identity: the registry is mostly empty shells

> Most registrations are "placeholders rather than active agents."

| chain | exposes a valid registration file with **at least one live service endpoint** |
| ------- | ----- |
| Ethereum | **3%** |
| BSC | **4%** |
| Base | **15%** |

### Reputation: the feedback is mostly Sybil

| chain | reviewers showing **coordinated Sybil behaviour** | rated agents with **no valid feedback left** after Sybil removal |
| ------- | ----- | ----- |
| Ethereum | **73.5%** | 15.8% |
| BSC | **59.2%** | 77.9% |
| Base | **90.6%** | **86.8%** |

On Base, nine reviewers in ten are coordinated, and removing them leaves **seven agents in eight
with nothing at all**.

### Its conclusion, verbatim

> "the Registry, as currently deployed, cannot function as a trust signal"

And its diagnosis, which is the part that matters most here — three causes:

1. **values that are not commensurable**
2. **feedback rarely grounded in verifiable interactions**
3. **reputation that can be manipulated at minimal cost**

## How ARP's own measurement compares, and where it does not

ARP measured the callable rate on Base independently: **3 of 122 parsed registration documents
answered a protocol handshake — 2.5%, Wilson 95% CI 0.8–7.0%** (`docs/14`,
`scripts/measure/cohort-coverage.ts`, 2026-10-16).

The study reports **15%** for Base. The two are not the same measurement and the gap is not
evidence of anything yet:

- **Different method.** The study counts "a valid registration file with at least one live service
  endpoint". ARP counts an endpoint that completes an MCP or A2A **handshake**. A URL that returns
  200 is not a server that speaks the protocol, and ARP's own probe separates those
  (`arp_probe_endpoint` returns `serves-declared-protocol` and `declared-protocol-not-served` as
  distinct verdicts).
- **Different date.** The study stops 2026-05-13. ARP measured 2026-10-16, by which time Base had
  gone from 88,243 agents to a highest minted id of 309,925 — roughly a tripling, at the order of
  44,000 a day.

**A dilution would explain the difference and so would the method.** Settling it needs one re-run of
`cohort-coverage.ts` with both definitions reported side by side, and until that exists neither
number may be presented as a trend. Writing "it fell from 15% to 2.5%" today would be exactly the
failure `claims.md` §2 describes.

## The three causes, and what ARP answers each with

This is the whole of the positioning, and none of the three was invented here — the study named
them.

### 1. "Values that are not commensurable"

Two agents rated on different scales, by different raters, for different things, cannot be compared.
Nothing in the registry says what a number means.

**ARP's answer is one vocabulary, not one score.** A `has tag` triple onto a domain atom from a
shared tree says what a tool is *for*, in a word anybody can resolve. ADR `0046` already refuses to
compose a score; this is the other half of that refusal — if you will not rank, you must at least
make two things comparable by saying what each is.

And it is measured as a real problem, not a theoretical one: of 1,666 distinct tag objects on
mainnet, **53 labels are carried by more than one atom, 118 atoms in all** — `DeFi`×5, `Gaming`×4
(`scripts/measure/tag-object-discipline.ts`). Incommensurability starts in the vocabulary.

### 2. "Feedback rarely grounded in verifiable interactions"

This is the hardest of the three and ARP's answer has two parts, which must never be shown as one.

**Part one — the only verifiable thing.** An endpoint either answers or does not, and *anybody can
check*. It is the single claim in this design that a third party reproduces for the price of one
HTTP request, and `arp_probe_endpoint` already returns the exact request so the check is
reproducible. Verified by **replication**, never by an oracle.

**Part two — a two-party record.** A hire has two sides: A declares it, B confirms it. Two
addresses, two payments, opposing interests agreeing. That is a different class of evidence from one
party asserting, and it is available for *agents* in a way it is not for tools — a GitHub repository
has nobody home to confirm anything.

`docs/14` already established the rule this rests on: **only what touched a third party is a fact.**
The study's phrase is the same rule stated as a finding.

### 3. "Reputation that can be manipulated at minimal cost"

The sharpest of the three, and the easiest to answer, because the answer is a number.

A review is free, so it is worth what it cost. In ARP a declaration is a triple and a position: the
triple's fee does not come back and the position is attributable to an address. Measured on mainnet
1155: a triple costs **0.1 TRUST in a fee that is gone**, plus `minDeposit` 0.01 which is the
depositor's and redeemable.

Three properties follow, and the third is the one nobody else has:

- **it costs**, so a Sybil farm pays per claim rather than per account;
- **it is attributed**, so a farm is visible as one address or as a set of addresses with no history;
- **it can be withdrawn**, so a signal can go *down*. A GitHub star never decays. A position
  redeemed leaves the index the same block, and 0.0009801 of a 0.002 stake came back the one time
  ARP did it (`catalogue/ontology-13579.json`).

But the study's 90.6% is also a warning against ARP's own first instinct. **Counting positions is not
enough**: 100 addresses holding `minDeposit` costs 1 TRUST on mainnet. The rule has to be the user's
— count the accounts that themselves have standing, and read the **amount** beside the count,
because one of the two is cheap to fake and the other is not.

## What this does to the positioning

**ARP is not a competitor to ERC-8004.** The standard's reputation registry is deliberately minimal:
it stores feedback signals and **computes no score**, leaving aggregation to "indexers and client
applications" precisely so that no canonical ranking becomes a target.

ARP is an indexer and a client application. It occupies the slot the specification left open on
purpose — and the study is the evidence that the slot is both empty and load-bearing.

The sentence that follows is the whole pitch and it needs no adjective:

> **The registry tells you they exist. It does not tell you which ones work.**

## Who buys it

**Not the incumbent marketplace.** Its reputation database *is* its lock-in; making a record
portable takes the moat away.

**The challenger**, who starts at zero and would rather import a record than spend two years
growing one. And anyone building on ERC-8004 who has discovered what the study measured.

## What the project changes, concretely

Five consequences, ordered by how much they move:

1. **`reachable` goes first.** It is the only verifiable claim in the system, and the probe already
   produces the verdict and discards it.

   This said "the hire record goes first" until 2026-10-29, and the correction is not a reordering
   of preferences — **it is this document's own measurement applied to this document's own plan.**
   A hire record needs a supply of agents that answer. §2 above reports 3 of 122 on Base, 2.5%,
   Wilson 95% CI 0.8–7.0%, against the study's 15% on a looser definition. Whichever is right, a
   market cannot be built on a population that is between 1% and 15% present; one would build the
   venue and find nobody to hire. Finding the ones that answer is what comes before hiring them,
   and it is the half ARP can produce today.

2. **The hire record goes second.** It is still the only layer that produces a two-party fact and
   the study's cause 2 is still the one nobody else is answering — that part was right and stands.
   What was wrong was putting it before the thing that gives it something to operate on.
3. **The reputation rule is amended before it is built.** Accounts *with standing*, and the amount
   beside the count. 90.6% is what a count-only rule gets you.
4. **The domain tree is vindicated and stays.** Cause 1 is exactly what it answers, and the tree is
   the one piece already on chain and readable from both the MCP node and `/tools`.
5. **Re-run `cohort-coverage.ts` reporting both definitions.** The 15%-versus-2.5% gap is the one
   number in this document that cannot yet be used, and it is the one a reader will ask about first.

## What this document may not be used to say

That ARP has solved any of the three. It answers each with a mechanism whose limits are written
beside it:

- the vocabulary is commensurable **only inside one attestor's index**, and whose index is a
  property of the node, never of the request;
- the hire record is a fact about **two parties agreeing**, not about work performed;
- the cost makes manipulation expensive, **not impossible** — and the study's own numbers are the
  reason to keep saying so.

`docs/14`'s prohibition stands and is the operative rule here: never render a free self-report
beside a receipt without marking which is which.

## Evidence ladder

This document serves the **staked** tier by naming, with a third party's evidence, what the tier
below it looks like at scale: a registry where 90.6% of reviewers are Sybil is the *asserted* rung
measured in the wild. ARP's claim is not that it reaches **proven** — it is that it does not stay
where the study found everyone else.
