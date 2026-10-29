# 01 — Project Context

## One-liner

**A reputation layer for autonomous agents.**

> Search by need. See what answers, and who paid to stand behind it.

Identity is ERC-8004, the graph is Intuition, and the priced claim is ARP. It stores nothing: if a
thing is listed here it is because it already exists somewhere else, and what ARP adds is the market
(ADR `0051`).

### Why **layer** and not **registry**, since 2026-10-29

This line read **"ARP is a registry that points at AI things — agents, tools, MCP servers — and
opens a priced market of opinion on them"**. Every clause of that is still true and it is no longer
the lead, for one measured reason.

A census dated 2026-10-02 counts **84,819 agent tools — 62,347 skills, 9,676 MCP servers, and
10,411 marketplaces** carrying 172M installs between them. There are more storefronts than there are
MCP servers. "Registry" is the most commoditised word in this market, and leading with it puts ARP
in a comparison it cannot win against incumbents with more money and an audience.

What none of those 10,411 has — checked against their own pages — is a **record of which listings
work and who stands behind them**. That gap is the lead now, and the two additions to the old line
say it:

- **"search by need"** — the index is keyed by what a tool is *for*, not by its name. npm returns
  25,501 rows for "payment", ranked on the string, `@types/payment` among the first.
- **"what answers"** — the one claim here a third party can reproduce for the price of one HTTP
  request, and therefore the only one ARP records as a fact rather than as a declaration
  (`docs/14`, `docs/19`).

The third clause is unchanged and is the oldest part of this project: **who paid to stand behind
it**. ERC-8004's own Reputation Registry holds **569,148 feedback entries on Base 8453 with a mean
score of 95.09 / 100** (`scripts/measure/erc8004-feedback.ts`, 2026-10-20). Free ratings converge on
excellent and stop distinguishing anything; a claim that cost something does not.

### Three words this positioning may never use

`best`, `score`, and `verified` about a usage. ARP composes no ranking of quality (ADR `0046`), and
the only thing it verifies is reachability. The discipline that follows is cheap: **there is no need
to say "this is not proof" if the word "proof" is never used.**

ADR `0075` carries the decision and what it trades away.

> This line used to end "Domain-dimensional calibration is ARP". **Calibration is out** — not
> deferred, out (ADR `0049`). It is a score, and a score that needs ground truth, which is `docs/12`'s
> first drift signal; ADR `0046` had already settled that ARP scores nobody.

## What ARP is

ARP (Agent Reputation Protocol) is a permissionless, modular reputation protocol for autonomous AI agents. It sits on top of ERC-8004 (the Ethereum agent identity standard) and uses Intuition's semantic graph as its ontology layer.

The core innovation is that **the input costs money**. An agent declares the tools it used and deposits TRUST on that declaration, under a cap its operator signed. Nothing here measures whether the agent was _right_ — reputation is what emerges when real value sits on a claim about composition, and writing that claim costs money that does not come back (ADR `0056`; this sentence used to end "and the claim is one a third party can contradict", which is true of the mechanism and all but unused in practice — 1 of 185 mainnet `uses` edges).

The case against free ratings is measured, not asserted: ERC-8004's Reputation Registry holds **569,148** feedback entries on Base 8453 with a **mean score of 95.09 / 100** (`scripts/measure/erc8004-feedback.ts`, 2026-10-20). Free ratings converge on excellent and stop distinguishing anything.

**An agent and a tool are the same shape** (ADR `0051`): both exist elsewhere, both get an atom pointing at them, and both carry a market on claims about them. One write path, not two.

This used to read "calibration over volume: an agent's reputation weight determined by the accuracy of their past attestations". That is a score needing ground truth, and it is out (ADR `0049`).

## What ARP is not

- ARP is **not an identity namespace**. ERC-8004's Identity Registry handles that, and ARP mints into it rather than beside it (ADR `0027`). It _is_ a registry in the sense of pointing at things that exist elsewhere — and it registers nothing, stores nothing and delivers nothing (ADR `0051`).
- ARP is **not an explorer**. 8004scan, Agentscan, Agent Arena handle discovery.
- ARP is **not a scoring platform at all** — not merely a non-proprietary one. ARP publishes no
  score, rating or assessment of any agent; it makes staking possible and reads the result. Every
  figure it surfaces is a deposit somebody else made, so ARP cannot be wrong about an agent — the
  market can. ADR `0046`. This bullet used to read "not a _proprietary_ scoring platform", which
  permitted a non-proprietary one.
- ARP is **not consumer-facing**. It is B2B infrastructure — agents, dApps, and other protocols consume it.
- ARP is **not where a reputation lives**. The reputation is **portable**: atoms, triples and
  positions on a public graph, plus an ERC-8004 identity. Nothing is in an ARP database, so an
  operator adopting ARP is not betting on ARP surviving — unplug it and the reputation is still there
  and still readable by anyone. ADR `0045` is the same property applied to requests rather than data.

## Why this MVP exists

This repository is the **first on-chain deliverable of ARP**, shipped as a demonstrable artifact for a single strategic meeting: the conversation with the Intuition core team to align on:

1. ARP being positioned publicly as "the Intuition reputation layer for ERC-8004"
2. Deployment chain (Base vs Intuition L3)
3. Access to Intuition's forkable indexer
4. Possible co-marketing at ETHGlobal Lisbon (July 2026)
5. TRUST token integration path

The MVP proves execution capacity and architectural coherence. It is not a complete product.

## Strategic positioning

ARP executes a thesis that Intuition has already published (November 2025 Medium post): that the agent economy needs agent registries + agent reputation + agent coordination. Intuition wants to be the trust and coordination layer. ARP implements the reputation slot of that thesis concretely.

This positioning means ARP should never feel like a competing vision. It is an implementation of Intuition's stated direction, differentiated by specific design choices (modular registry, permissionless module creation, and a signal that is a priced deposit rather than an opinion — calibration-weighted scoring was the third item here and is out, ADR `0049`).

## Competitive landscape

The reputation layer for ERC-8004 agents is not empty. Known competitors:

- **8004scan** (AltLayer) — launched October 2025. Has a proprietary 7-dimension scoring system. Publishes offchain data format best practices. Primary competitor.
- **Agentscan** (Alias) — agent economy search engine.
- **Agent Arena** — indexes 22,000+ agents across 16 chains, composite scoring, buyer reputation protocol.
- **Theagora** — per-function reputation, 4-tier cryptographic verification.

ARP's defensible differentiation:

1. **The input is priced, not free** — a deposit on a claim about use, bounded by a cap its operator signed. Every competitor above takes free input.
2. **Written in the capability vocabulary, not the trust vocabulary** — `uses`, `has tag`, `implement`. So ARP makes claims about **composition**, and reputation emerges when money sits on one. Trust providers write elsewhere in the graph, which is why they are not competitors on this surface (ADR `0048`).
3. **ARP holds nothing** — no key (ADR `0038`), no request path (ADR `0045`), no data. The reputation is positions on a public graph, so adopting ARP is not a bet on ARP surviving.
4. **The position is the measure, so what you read is live** — withdrawable, so it is what people hold now rather than what was ever put in (ADR `0046` §3, and ADR `0056`, which built the exit).

Item 4 used to read "so the **signal** is live — withdrawable, and contradictable through the counter-claim (ADR `0046`)". Three things wrong with it, all fixed by ADR `0056`: the counter-claim is almost never used, so contradictability was not a differentiator; `0046`'s §2 heading is now struck, so the citation walked a reader into retracted text; and ARP does not call this a signal — it is a market, and a price is not a verdict.

Item 2 of this list used to be calibration-weighted scoring. It is out (ADR `0049`).

## Target hackathon deliverable

ETHGlobal Lisbon, late July 2026. Full scope at Lisbon (separate from this MVP): Module Registry + demo agent staking TRUST + attestation loop + forked indexer. Bounties targeted: The Graph ($15k primary), ENS ($5k bonus).

This MVP is the **seed** of that Lisbon deliverable. The Module Registry built here is the same contract that ships to Lisbon, expanded.

## Ecosystem references

- ERC-8004 spec: https://eips.ethereum.org/EIPS/eip-8004
- 8004scan: https://8004scan.io
- Intuition Medium "Agentic Swarms": https://medium.com/0xintuition/intuition-agentic-swarmserc-8004-x402-and-the-ai-sovereignty-alliance-28f7885406c0
- Awesome ERC-8004 resources: https://github.com/sudeepb02/awesome-erc8004
