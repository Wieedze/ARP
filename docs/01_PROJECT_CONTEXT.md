# 01 — Project Context

## One-liner

ARP is the Intuition reputation layer for ERC-8004 agents. Identity is ERC-8004. Trust graph is Intuition. Domain-dimensional calibration is ARP.

> **Open conflict, 2026-10-20 — not resolved here.** "Domain-dimensional calibration is ARP" and
> "calibration over volume" below both describe **scoring**, which ADR `0046` has now ruled out:
> _ARP scores nobody._ `docs/12` already treats calibration as "a **later layer** on top of this one"
> that "needs ground truth", and its first drift signal is proposing it too early. So the two are not
> flatly incompatible — calibration can only ever be a layer above the staked mechanism, and building
> it would need an ADR reversing or scoping `0046`.
>
> What is **not** settled is whether it still belongs in this document's one-liner and core-innovation
> claim, which is a positioning decision and the author's to make. Read the mechanism in `docs/12`
> and the decision in `0046` as current; read these two lines as the older framing.

## What ARP is

ARP (Agent Reputation Protocol) is a permissionless, modular reputation protocol for autonomous AI agents. It sits on top of ERC-8004 (the Ethereum agent identity standard) and uses Intuition's semantic graph as its ontology layer.

The core innovation is **calibration over volume**: an agent's reputation weight in a given domain is determined by the accuracy of their past attestations in that domain, not by how many attestations they've made.

## What ARP is not

- ARP is **not an agent registry**. ERC-8004's Identity Registry handles that.
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

This positioning means ARP should never feel like a competing vision. It is an implementation of Intuition's stated direction, differentiated by specific design choices (modular registry, permissionless module creation, calibration-weighted scoring — the third is the open conflict flagged under the one-liner above; ADR `0046`).

## Competitive landscape

The reputation layer for ERC-8004 agents is not empty. Known competitors:

- **8004scan** (AltLayer) — launched October 2025. Has a proprietary 7-dimension scoring system. Publishes offchain data format best practices. Primary competitor.
- **Agentscan** (Alias) — agent economy search engine.
- **Agent Arena** — indexes 22,000+ agents across 16 chains, composite scoring, buyer reputation protocol.
- **Theagora** — per-function reputation, 4-tier cryptographic verification.

ARP's defensible differentiation:

1. Permissionless modular evaluation (vs fixed proprietary grids)
2. Calibration-weighted scoring (vs volume-based or undocumented weighting)
3. Intuition semantic graph as backend (vs centralized indexers)
4. Economic skin in the game (TRUST staking on attestations)

## Target hackathon deliverable

ETHGlobal Lisbon, late July 2026. Full scope at Lisbon (separate from this MVP): Module Registry + demo agent staking TRUST + attestation loop + forked indexer. Bounties targeted: The Graph ($15k primary), ENS ($5k bonus).

This MVP is the **seed** of that Lisbon deliverable. The Module Registry built here is the same contract that ships to Lisbon, expanded.

## Ecosystem references

- ERC-8004 spec: https://eips.ethereum.org/EIPS/eip-8004
- 8004scan: https://8004scan.io
- Intuition Medium "Agentic Swarms": https://medium.com/0xintuition/intuition-agentic-swarmserc-8004-x402-and-the-ai-sovereignty-alliance-28f7885406c0
- Awesome ERC-8004 resources: https://github.com/sudeepb02/awesome-erc8004
