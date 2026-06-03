# ARP — Agent Reputation Protocol

> **The on-chain trust layer for autonomous agents.** ARP gives agent runtimes (Swarms, LangChain, AutoGen, custom) what they're missing: verifiable identity, composable reputation, bounded autonomy, and an economic-conviction marketplace for tools — all on a public chain.

## Positioning

Existing agent frameworks have great **runtime layers** (orchestration, MCP, x402 payments) but rely on off-chain trust:

- "Which agent should I hire?" → static listings + reviews
- "Is this agent's reputation real?" → no skin in the game
- "Can I delegate a budget safely?" → custom auth per integration

ARP is the missing **trust + reputation layer** any of them can plug into:

| Layer | Provider |
|---|---|
| **Compute runtime** (orchestration, tool calls) | Swarms / LangChain / AutoGen / your own |
| **Trust + identity + reputation** | ARP (this repo) |
| **Coordination chain + graph** | Intuition (atoms + triples + bonding curve) |
| **Bounded autonomy + payments** | MetaMask Smart Accounts Kit (ERC-7710) |

Built for the **MetaMask Dev Cook-Off** (deadline 2026-06-15). Deployed entirely on **Intuition Testnet**.

## What ARP gives you

1. **Verifiable identity** — every agent is an ERC-8004 NFT with an explicit `runtime wallet` binding. Compatible with the wider Trustless Agents ecosystem.
2. **Composable reputation** — agents (and tools, and humans) stake real tTRUST on Intuition atoms. The bonding curve is the price-discovery engine for "is this tool actually valuable?". Stakes are public, sortable, queryable.
3. **Bounded autonomy** — operators sign ERC-7710 delegations with caveat enforcers. The agent runtime executes within those bounds; the framework reverts on out-of-scope attempts before any state change. No custom auth.
4. **Recursive composition** — atoms can be agents OR tools OR both. Triples express `(thing, uses, thing)`. The graph self-describes the entire ecosystem at every level of nesting.

## The core primitives

```
Atom        a thing — agent, tool, label, identity. Has a vault.
Triple      a directed claim: (subject, predicate, object) of atoms.
Stake       tTRUST locked into an atom's vault — economic conviction.
Delegation  ERC-7710 signed authorization, scoped by caveat enforcers.
```

That's it. Everything else is emergent.

## End-to-end demo flow (today)

The demo runs on Intuition Testnet with two consoles side by side:

**Browser (operator)**
1. Mints ERC-8004 agent NFT
2. Generates a runtime keypair and binds it via `setAgentWallet`
3. Deploys a MetaMask Smart Account
4. Signs two delegations once:
   - **Publish** — `DomainScopeEnforcer([allowedDomains])` + `TrustStakeCapEnforcer(cap, period)` gating `ModuleRegistry.registerModule`
   - **Compose** — stock `AllowedTargetsEnforcer([MultiVault])` + `AllowedMethodsEnforcer([deposit, createAtoms, createTriples])` + `TrustStakeCapEnforcer(cap, period)` gating Intuition staking + graph writes

**Terminal (agent runtime)**
5. `scripts/agent-approve-sa.ts` — one-time, runtime authorizes SA to deposit on its behalf
6. `scripts/agent-loop.ts` — reads `.env` (runtime key + signed delegations), walks `scripts/manifest-modules.json`:
   - publishes new modules under the publish delegation,
   - ensures tool atoms exist (idempotent),
   - declares `(agent, uses, tool)` triples on Intuition's graph,
   - stakes tTRUST on each tool atom — vault TVL climbs live.
7. Demonstrates revert paths: `DomainNotAllowed` for out-of-scope domains, `StakeExceedsCap` for over-cap attempts. Both labelled clearly in the log.

**Marketplace UI (`/`)**
8. Modules ranked by TVL desc, with live stakers count next to each row. Slither + Mythril rise as the agent stakes; new modules appear as the agent publishes.
9. `/tool/:id` per-tool page surfaces metadata, vault metrics, and a compose wizard for the operator's own positioning (separate from runtime).

ARP doesn't compute agents — that's the runtime layer's job. ARP is purely declarative + coordination + economic accounting.

## Deployed contracts (Intuition Testnet, chainId 13579)

| Contract | Address |
|---|---|
| `ModuleRegistry` (v2 — schemaURI uniqueness) | [`0xc9a2f66775828017e984E8be077fA2d17e0A41F4`](https://testnet.explorer.intuition.systems/address/0xc9a2f66775828017e984E8be077fA2d17e0A41F4) |
| `IdentityRegistry` (ERC-8004) | [`0xC165A2AD2E540A4069E02834009161E2b4490d5A`](https://testnet.explorer.intuition.systems/address/0xC165A2AD2E540A4069E02834009161E2b4490d5A) |
| `DomainScopeEnforcer` | [`0x516B82E29e3Ca46Ca810FC2EEf348932b198f7f9`](https://testnet.explorer.intuition.systems/address/0x516B82E29e3Ca46Ca810FC2EEf348932b198f7f9) |
| `TrustStakeCapEnforcer` | [`0x7BB56819E9a413B8B4668C5cAF5C494c41dC0F8E`](https://testnet.explorer.intuition.systems/address/0x7BB56819E9a413B8B4668C5cAF5C494c41dC0F8E) |

Composes with the MetaMask Delegation Framework v1.3.0 (`DelegationManager` at `0xdb9B1e94B5b69Df7e401DDbedE43491141047dB3`) and Intuition's MultiVault (`0x2Ece8D4dEdcB9918A398528f3fa4688b1d2CAB91`). Full address set in [deployments/13579.json](deployments/13579.json).

## Roadmap

What's in the MVP today is the **trust layer**. What goes on top:

- **`@arp/sdk`** — Node package consumable by any agent framework: `findTopAgents(domain)`, `getReputation(agentId)`, `signTaskDelegation(...)`.
- **Hire-an-agent flow** — humans post a task + budget, the framework matches to the highest-rep agent, the agent runtime delivers off-chain, on-chain receipt via a `ResultDelivered` event.
- **A2A sub-delegation** — agents with reputation get hired by other agents. Sub-delegation chains let value flow recursively through the graph.
- **Optimistic challenges + slashing** — anyone can dispute a false declaration. If proven, the staker's tTRUST is slashed, the challenger gets a share. Trust enforced by economic risk.
- **ZK proof of usage** — agents submit cryptographic proof that they actually called the tool they declared. Verified stakes count for 2× weight in the aggregate.
- **DAO treasury integration** — DAOs subsidize reputation on tools they want to promote (Optimism endorses Foundry, etc.).

## Stack

- **Runtime & package manager** — Bun 1.2+ (workspaces, installs, scripts)
- **Contracts** — Solidity 0.8.24, Foundry
- **Chain** — Intuition Testnet (chainId 13579)
- **Frontend** — Vite + React 19 + TypeScript + Tailwind v4
- **Wallet & accounts** — viem 2 + Wagmi 3 + `@metamask/smart-accounts-kit`
- **Delegation** — ERC-7710 + MetaMask Delegation Framework v1.3.0, with ARP-custom caveat enforcers
- **Identity** — ERC-8004 `IdentityRegistry` (vendored from ChaosChain, ported to OpenZeppelin v5)
- **Semantic graph** — Intuition atoms / triples / bonding-curve staking

## Repository layout

```
ARP/
├── CLAUDE.md                     ← Router for Claude Code (rules, skills, agents)
├── README.md                     ← This file
├── app/                          ← Vite + React + TS + Tailwind v4 UI
│   └── src/{services,hooks,components,pages,lib}
├── contracts/                    ← Foundry workspace (Solidity)
│   └── src/
│       ├── ModuleRegistry.sol
│       ├── enforcers/            ← DomainScopeEnforcer, TrustStakeCapEnforcer
│       └── erc8004/              ← IdentityRegistry + interfaces
├── scripts/                      ← Bun scripts
│   ├── deploy.sh                 ← three-phase contract deploy
│   ├── agent-approve-sa.ts       ← one-time runtime → SA DEPOSIT approval
│   ├── agent-loop.ts             ← headless agent runtime
│   ├── agent-server.ts (planned) ← HTTP endpoint receiving tasks
│   └── manifest-modules.json     ← demo manifest (8 modules / 4 domains)
├── schemas/                      ← JSON schemas for seed modules
├── deployments/                  ← Deployed addresses per network (13579.json)
├── docs/                         ← Strategic + architectural reference
│   ├── 00_HACKATHON_PIVOT.md     ← Current strategic commitment
│   ├── 01_PROJECT_CONTEXT.md
│   ├── 02_ARCHITECTURE.md        ← Locked decisions
│   ├── 03_MVP_SCOPE.md
│   ├── 04_SEED_MODULES.md
│   ├── 05_UI_DESIGN.md
│   └── 06_BEAR_TRAP_REFERENCE.md ← Enforcer pattern reference
├── tasks/                        ← Atomic work units (01 → 05b)
└── .claude/                      ← Claude operating layer (rules, skills, agents, ADRs, post-mortems)
```

## Local development

Prerequisites: [Bun](https://bun.sh) 1.2+, [Foundry](https://book.getfoundry.sh) (for contracts), Node.js 20+.

```bash
# Install all workspace dependencies
bun install

# Run the app dev server (http://localhost:5173)
bun run dev

# Build everything
bun run build

# Test (Foundry for contracts, Vitest for app services)
bun run test

# Format (Prettier for TS/JSON/MD, forge fmt for Solidity)
bun run format

# Lint (ESLint for TS, solhint for Solidity)
bun run lint
```

Copy `.env.example` to `.env` and fill in the values before running anything that talks to a chain. Never commit `.env`.

## Working with this repo via Claude Code

Start at [CLAUDE.md](CLAUDE.md) — it routes to the right rules (`.claude/rules/`), skills (`.claude/skills/`), agents, and prior decisions (`.claude/choices/`) for the task at hand. Every task ends with a mandatory `task-verifier` pass.
