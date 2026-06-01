---
name: arp-module-registry
description: Procedural knowledge for working on the ARP (Agent Reputation Protocol) Module Registry MVP. Use this skill whenever working on any task in this repository, including Solidity contract work, Intuition atom creation, TypeScript UI work with ERC-8004 concepts, or anything touching agents, reputation, or the Intuition semantic graph. This skill composes with the ethereum-smart-contracts skill, trail-of-bits-audit-security skill, and intuition skill — read this skill first to understand the project, then apply the others for specific technical work.
---

# ARP Module Registry — Project Skill

This is the procedural companion to the docs in this repo. Where the docs tell you *what* ARP is, this skill tells you *how* to work on it without drifting.

## Before you write a single line of code

Read these, in order, every time you start a new task:

1. `CLAUDE.md` — operating principles
2. `docs/01_PROJECT_CONTEXT.md` — what ARP is
3. `docs/02_ARCHITECTURE.md` — locked decisions
4. `docs/03_MVP_SCOPE.md` — what's in, what's out
5. The task file you're executing

Then, depending on the task:

- Solidity work → also load the ethereum-smart-contracts skill
- Any contract touching value or permissions → also load trail-of-bits-audit-security
- Any Intuition atom or triple work → also load intuition
- UI work → also load frontend-design

Never skip this loading step to "save time." Every time it's been skipped on past projects, scope drifted.

## The three cognitive guardrails

ARP fails if any of these three drift:

### Scope discipline

The MVP is one contract, three seed modules, one UI. Nothing else. If a task seems to need more, **it doesn't**. The need is real but belongs to a later milestone. Write it down in a `FUTURE.md` or similar, and stay in scope.

Phrases that signal drift:
- "it would be better if we also…"
- "while we're at it, let's…"
- "this is a good opportunity to…"
- "I noticed we could easily add…"

Every one of these should trigger a stop. Ask the user.

### Framing discipline

ARP is **the reputation layer**, not a registry, not an explorer, not a scoring dashboard. When writing docs, UI copy, commit messages, or comments, do not describe ARP as "an agent registry" or "an agent reputation explorer." Both are wrong. The correct framings:

- "reputation protocol for ERC-8004 agents"
- "Intuition-native reputation layer"
- "domain-modular calibration protocol"

If you catch yourself writing "registry" when referring to ARP as a whole (as opposed to the Module Registry component), reword.

### Quality discipline

Prestige > shipped fast. This MVP is a credibility artifact, not a hackathon submit. If a choice trades quality for speed in a way that would be visible to Billy, choose quality.

But: prestige does not mean over-engineering. A 200-line contract with excellent NatSpec and tests beats a 2000-line contract with six abstractions. Simple + polished > complex + rushed.

## How to compose the existing skills

Maxime has three other skills installed that this project relies on. Here's how they fit:

### ethereum-smart-contracts

Use for:
- Foundry project setup (`forge init`, `foundry.toml` config)
- Writing Solidity (0.8.24+)
- Writing Foundry tests (fuzz, invariant, fork)
- Gas optimization patterns
- Deployment scripts

Do not use it to decide *what* to build — that's in the ARP docs. Use it for *how* to build the Solidity parts well.

### trail-of-bits-audit-security

Use for:
- Pre-merge review of any contract changes
- Threat modeling the Module Registry before deployment
- Checklist of common pitfalls (reentrancy, access control, overflow, signature replay)
- Reviewing external call patterns

Every contract change goes through this skill before the task is considered complete. No exceptions.

### intuition

Use for:
- Creating atoms and triples programmatically
- Understanding the multivault
- Querying the Intuition graph
- Using the Intuition SDK properly

For ARP, the main interaction is: on module registration, create an `ARP_MODULE` atom with triples linking it to its domain, schema URI, and creator. Get the exact API from the Intuition skill, do not improvise.

## Project-specific patterns

### Module ID allocation

Module IDs are allocated by the contract as monotonically increasing `uint256`, starting at 1 (not 0). ID 0 is reserved as the "null module" sentinel. This is an architectural choice, not a convenience.

### Domain identifier format

Domains are lowercase kebab-case strings. Examples: `solidity-audit`, `url-classification`, `claim-verification`. They are not hashed, not namespaced by creator — the identifier space is flat for MVP.

Validation: a regex like `^[a-z][a-z0-9-]{1,62}$` is reasonable. Reject empty, reject starting with a digit, reject uppercase, reject special chars other than hyphen.

### Schema URI format

Schemas live on IPFS. URIs are `ipfs://bafy...` strings. The contract stores the URI as-is; it does not validate its reachability or content. Off-chain tooling (the UI) should validate the URI resolves to valid JSON Schema before allowing registration.

### Event indexing strategy

The `ModuleRegistered` event indexes:
- `id` (uint256, indexed)
- `creator` (address, indexed)
- `domain` (string, indexed as hash)

The string domain is indexed as a keccak256 hash (Solidity behavior when indexing strings). The UI filter-by-domain works by computing the same hash client-side.

### Intuition atom coupling

The atom is created by the **frontend** after the on-chain transaction confirms, not by the contract. The contract has no knowledge of Intuition. This keeps the contract minimal and keeps Intuition-specific failure modes out of the on-chain path.

If atom creation fails, the module still exists on-chain. A reconciliation script can re-create missing atoms later. This is acceptable for MVP.

## Common pitfalls specific to this project

### Do not ERC-721 the Module Registry

It's tempting to mint modules as NFTs. Don't, for the MVP. The Module Registry is deliberately a simple array with access control — not a tokenized asset. Adding ERC-721 is an architectural decision that should go through the user, not emerge from one coding session.

### Do not couple to TRUST token

The TRUST token is part of the Reputation Loop component (component 3), not the Module Registry (component 1). Do not import TRUST token logic into the Module Registry contract. They interact later, in different components.

### Do not implement the calibration algorithm

It's not specified yet. The whole protocol's differentiation depends on getting this right. A stub that looks like a calibration algorithm is worse than no algorithm at all — it sets expectations that are hard to walk back.

### Do not deploy to mainnet in this MVP

Base Sepolia only. Mainnet is a separate user decision.

### Do not generate a landing page

The UI is an application, not a marketing site. No hero section with a tagline, no "How it works" scrollytelling. Just: list of modules, detail view, register form. Functional, typographic, prestigious.

## Communication norms for this project

When reporting back after a task:
- Lead with the concrete thing shipped (contract address, commit SHA, deployed URL)
- Flag any decision you made that wasn't fully specified
- Flag any scope pressure you felt and how you resisted
- Suggest the next logical task but let the user choose

Avoid:
- Apologizing for implementation choices that were reasonable
- Hedging ("I think maybe this might work")
- Filler like "I'll now proceed to..."
- Restating the task back before doing it

## When to escalate to the user

Stop and ask when:
- A task requires a decision that seems to expand scope
- An architectural choice not documented in `docs/02_ARCHITECTURE.md` comes up
- A deployment would touch mainnet or spend significant gas
- A dependency would require adding a third-party service not already in the project
- The Trail of Bits review surfaces something that's not fixable within the current task's scope
