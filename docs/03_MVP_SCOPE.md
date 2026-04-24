# 03 — MVP Scope

## One-sentence scope

A deployed `ModuleRegistry` contract on Base Sepolia with three seeded modules, each mirrored as an Intuition atom, viewable in a polished web UI.

## In scope

### Contract
- `ModuleRegistry.sol` — a single contract that registers evaluation modules
- Public function: `registerModule(string name, string domain, string schemaURI, string description)`
- Emits `ModuleRegistered(uint256 indexed id, address indexed creator, string domain)`
- Read functions: `getModule(uint256)`, `totalModules()`, `getModulesByDomain(string)`
- NatSpec documentation on every function
- Full Foundry test suite (100% public surface coverage)
- Trail of Bits security review pass
- Deployment script for Base Sepolia
- Verified on Basescan

### Intuition integration
- For each registered module, create a corresponding Intuition atom of type `ARP_MODULE`
- Link atom to on-chain module ID via a triple
- One script that can idempotently sync on-chain modules → atoms

### Seed modules
Three modules registered at deployment time (see `docs/04_SEED_MODULES.md`):
1. Solidity Audit
2. URL Classification
3. Factual Claim Verification

Each seed module has:
- A schema JSON file committed to this repo under `schemas/`
- The schema uploaded to IPFS, URI recorded
- Registered on-chain via the deployment script
- Corresponding Intuition atom created

### UI
- Single-page application, Vite + React + TypeScript + Tailwind
- Dark-mode default, no light-mode fallback for MVP
- Routes:
  - `/` — module list (all registered modules, filterable by domain)
  - `/module/:id` — module detail (full schema, creator, on-chain tx, Intuition atom link)
  - `/register` — form to register a new module (wallet connection required)
- Wallet connection via Wagmi + Viem, supporting WalletConnect and injected wallets
- Live data only — no mocks in production build
- Loading states, empty states, error states all handled


### Documentation in the repo
- This `docs/` folder, kept in sync with reality
- Every task file updated with completion notes
- Contract addresses recorded in `deployments/base-sepolia.json`

## Out of scope (explicitly)

These are deferred to later milestones and should **not** be implemented in this MVP:

- TRUST token staking
- Agent attestation flow
- Any ERC-8004 contract interaction (reading or writing)
- Calibration algorithm
- Score computation
- Merkle checkpoint publishing
- Indexer (forked from Intuition's) — none in this MVP
- Module deletion or updating (modules are append-only for MVP)
- Module governance / DAO
- Mainnet deployment
- Agent SDK package (`@arp/sdk` publishing)
- MCP onboarding server
- ZK proofs
- Multi-chain support
- Internationalization

**If a task feels like it requires one of the above, stop and ask.**

## Definition of done

The MVP is complete when **all** of the following are true:

- [ ] `ModuleRegistry.sol` deployed and verified on Base Sepolia
- [ ] All Foundry tests passing, coverage report published
- [ ] Security review pass documented (using Trail of Bits skill)
- [ ] Three seed modules registered on-chain, each with a linked Intuition atom
- [ ] UI deployed , accessible via public URL
- [ ] UI can list modules, view details, and register new ones (with wallet)
- [ ] A user (Billy) can open the URL on a phone and understand what ARP is in under 30 seconds
- [ ] A developer (future contributor) can clone the repo, run locally, and understand the codebase without asking questions
- [ ] Every contract address and atom ID recorded in `deployments/base-sepolia.json`
- [ ] README and all docs match reality

## Non-goals for the demo conversation

When presenting to the Intuition team, the MVP should **not**:
- Claim ARP is complete
- Show vaporware features via mocks
- Overpromise on the scoring layer (it's not built yet)
- Compete visually or rhetorically with 8004scan

The MVP's purpose is to prove the team is serious and technically credible. The conversation is about alignment, not a product demo.

## Timeline discipline

Two weeks, from the day the first task starts to the day the URL is shared with Billy.

- Week 1: contract + deploy + Intuition integration + seed modules
- Week 2: UI + polish + deploy + documentation cleanup

If a task takes more than its estimated time, the scope gets cut, not the deadline.
