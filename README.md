# ARP — Agent Reputation Protocol

> ARP turns agents into **reputation-bounded actors**. An agent registers via MetaMask Smart Accounts, declares its tool composition on Intuition's semantic graph, stakes TRUST on its tools using Intuition's exponential bonding curve, and posts attestations autonomously within a scoped ERC-7710 delegation — bounded by ARP-specific caveat enforcers that restrict staking to declared domains and cap exposure per period.

**One-line positioning**: ARP is the Intuition reputation layer for ERC-8004 agents. Identity is ERC-8004. Trust graph is Intuition. Domain-dimensional calibration is ARP.

This repository is ARP's submission to the **MetaMask Dev Cook-Off** (deadline 2026-06-15). It is built and deployed entirely on **Intuition Testnet**. See [docs/00_HACKATHON_PIVOT.md](docs/00_HACKATHON_PIVOT.md) for the full strategic brief.

## What this MVP proves

Three things, in a single live demo:

1. ARP's architectural thesis (compositional reputation + economic positioning + delegation) is executable, not theoretical.
2. ERC-8004 identity and the Intuition semantic graph integrate cleanly.
3. An agent can act autonomously on-chain while being cryptographically bounded by ARP's caveat enforcers.

## The agent lifecycle (demo flow)

1. **Operator** connects their wallet, mints an ERC-8004 agent NFT (`IdentityRegistry.register`), generates a runtime keypair, designates it via `setAgentWallet`, and deploys their MetaMask Smart Account.
2. **Operator** signs **two** scoped delegations once:
   - **Publish** — `DomainScopeEnforcer([allowedDomains])` + `TrustStakeCapEnforcer(cap, period)`. Authorizes the runtime to call `ModuleRegistry.registerModule` only in the listed domains.
   - **Compose** — stock `AllowedTargetsEnforcer([MultiVault])` + `AllowedMethodsEnforcer([deposit, createAtoms, createTriples])` + `TrustStakeCapEnforcer(cap, period)`. Authorizes the runtime to call the three composing/staking methods on Intuition's MultiVault.
3. **Agent runtime** (`scripts/agent-loop.ts`, headless) reads its private key and both signed delegations from `.env`, then autonomously:
   - publishes new modules under the publish delegation,
   - declares `(agent, uses, tool)` triples on Intuition's graph under the compose delegation,
   - stakes tTRUST on each tool atom under the compose delegation.
4. The same loop demonstrates the **revert paths**: out-of-domain attempts revert with `DomainNotAllowed`; over-cap attempts revert with `StakeExceedsCap`. Both are logged in real time.

The operator's own composition decisions on `/tool/:id` stay signed by the operator EOA — acts of design, not runtime decisions. The rationale is recorded in [.claude/choices/0012-agent-positioning-via-two-delegations.md](.claude/choices/0012-agent-positioning-via-two-delegations.md).

## Deployed contracts (Intuition Testnet, chainId 13579)

| Contract | Address |
|---|---|
| `ModuleRegistry` | [`0x777C28eCb4688D647B535098d11fB87A9746334f`](https://testnet.explorer.intuition.systems/address/0x777C28eCb4688D647B535098d11fB87A9746334f) |
| `IdentityRegistry` (ERC-8004) | [`0xC165A2AD2E540A4069E02834009161E2b4490d5A`](https://testnet.explorer.intuition.systems/address/0xC165A2AD2E540A4069E02834009161E2b4490d5A) |
| `DomainScopeEnforcer` | [`0x516B82E29e3Ca46Ca810FC2EEf348932b198f7f9`](https://testnet.explorer.intuition.systems/address/0x516B82E29e3Ca46Ca810FC2EEf348932b198f7f9) |
| `TrustStakeCapEnforcer` | [`0x7BB56819E9a413B8B4668C5cAF5C494c41dC0F8E`](https://testnet.explorer.intuition.systems/address/0x7BB56819E9a413B8B4668C5cAF5C494c41dC0F8E) |

ARP's custom enforcers compose with the MetaMask Delegation Framework v1.3.0 (`DelegationManager` at `0xdb9B1e94B5b69Df7e401DDbedE43491141047dB3`) and Intuition's MultiVault (`0x2Ece8D4dEdcB9918A398528f3fa4688b1d2CAB91`). Full address set in [deployments/13579.json](deployments/13579.json).

## Stack

- **Runtime & package manager**: Bun 1.2+ (workspaces, installs, scripts)
- **Contracts**: Solidity 0.8.24, Foundry
- **Chain**: Intuition Testnet (chainId 13579)
- **Frontend**: Vite + React 19 + TypeScript + Tailwind v4
- **Wallet & accounts**: Viem 2 + Wagmi 3 + `@metamask/delegation-toolkit` (Smart Accounts Kit)
- **Delegation**: ERC-7710 + MetaMask Delegation Framework v1.3.0, with ARP-custom caveat enforcers
- **Identity**: ERC-8004 (`IdentityRegistry`, deployed on Intuition Testnet)
- **Semantic graph**: Intuition atoms / triples / bonding-curve staking

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
├── schemas/                      ← JSON schemas for seed modules
├── deployments/                  ← Deployed addresses per network (13579.json)
├── docs/                         ← Reference knowledge (the "what")
│   ├── 00_HACKATHON_PIVOT.md     ← Current strategic commitment (supersedes conflicts)
│   ├── 01_PROJECT_CONTEXT.md
│   ├── 02_ARCHITECTURE.md        ← Locked decisions
│   ├── 03_MVP_SCOPE.md
│   ├── 04_SEED_MODULES.md
│   ├── 05_UI_DESIGN.md
│   └── 06_BEAR_TRAP_REFERENCE.md ← Enforcer pattern reference
├── tasks/                        ← Atomic work units (01 → 05b)
└── .claude/                      ← Claude operating layer (rules, skills, agents, ADRs)
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
