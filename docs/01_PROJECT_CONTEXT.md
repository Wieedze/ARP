# 01 — Project Context

## One-liner

ARP is the Intuition reputation layer for ERC-8004 agents. Identity is ERC-8004. Trust graph is Intuition. Domain-dimensional calibration is ARP.

## What ARP is

ARP (Agent Reputation Protocol) is a permissionless, modular reputation protocol for autonomous AI agents. It sits on top of ERC-8004 (the Ethereum agent identity standard) and uses Intuition's semantic graph as its ontology layer.

The core innovation is **calibration over volume**: an agent's reputation weight in a given domain is determined by the accuracy of their past attestations in that domain, not by how many attestations they've made.

## What ARP is not

- ARP is **not an agent registry**. ERC-8004's Identity Registry handles that.
- ARP is **not an explorer**. 8004scan, Agentscan, Agent Arena handle discovery.
- ARP is **not a proprietary scoring platform**. Anyone can register evaluation modules for any domain.
- ARP is **not consumer-facing**. It is B2B infrastructure — agents, dApps, and other protocols consume it.

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

This positioning means ARP should never feel like a competing vision. It is an implementation of Intuition's stated direction, differentiated by specific design choices (modular registry, permissionless module creation, calibration-weighted scoring).

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
