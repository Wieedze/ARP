# ARP Module Registry — MVP

First on-chain deliverable of **ARP (Agent Reputation Protocol)** — the Intuition-native reputation layer for ERC-8004 agents.

## Purpose of this MVP

Two weeks, one deliverable, one audience: the Intuition core team.

This repo ships the **Module Registry** component of ARP as a deployed, demonstrable artifact. The goal is not a complete product — it is to prove three things in a single live demo:

1. ARP's architectural thesis is executable, not theoretical
2. ERC-8004 and Intuition semantic graph integrate cleanly
3. The team is already building, not pitching

## Repository layout

```
arp-module-registry-mvp/
├── CLAUDE.md                     ← Entry point for Claude Code
├── README.md                     ← This file
├── app/                          ← Vite + React + TS + Tailwind v4 UI
├── contracts/                    ← Foundry workspace (Solidity)
├── schemas/                      ← JSON schemas for seed modules
├── deployments/                  ← Deployed contract addresses per network
├── docs/                         ← Reference knowledge (the "what")
│   ├── 01_PROJECT_CONTEXT.md
│   ├── 02_ARCHITECTURE.md
│   ├── 03_MVP_SCOPE.md
│   ├── 04_SEED_MODULES.md
│   └── 05_UI_DESIGN.md
├── tasks/                        ← Actionable work units (the "do")
│   ├── 01-project-setup.md
│   ├── 02-contract-mvp.md
│   ├── 03-deploy-and-seed.md
│   ├── 04-ui-core.md
│   └── 05-ui-polish-deploy.md
└── .claude/skills/arp/           ← ARP-specific procedural knowledge (the "how")
    └── SKILL.md
```

## Three types of knowledge

This repo deliberately separates three kinds of information:

- **Docs** answer *what*. They are reference material. No imperatives. Read them to understand the project.
- **Skills** answer *how*. They are procedural knowledge. Read them when doing a specific type of work.
- **Tasks** answer *what to build now*. They are executable units with acceptance criteria.

Claude Code reads `CLAUDE.md` first. It points to the right docs, skills, and tasks depending on the work at hand.

## Prerequisites for Claude Code

This project assumes the following skills are available:
- `ethereum-smart-contracts` (Solidity, Foundry, Hardhat)
- `trail-of-bits-audit-security` (security review patterns)
- `intuition-protocol` (atoms, triples, multivault SDK)
- Standard frontend skills for React/TypeScript work

If any of these are missing, flag it before starting work.

## Stack

- **Runtime & package manager**: Bun 1.2+ (workspaces, installs, scripts)
- **Contracts**: Solidity 0.8.24+, Foundry
- **Chain**: Base Sepolia (testnet) → Base mainnet (later)
- **Frontend**: Vite 8 + React 19 + TypeScript 6 + Tailwind v4
- **Wallet**: Viem 2 + Wagmi 3 + @tanstack/react-query 5
- **Semantic graph**: Intuition atoms/triples
- **Identity**: ERC-8004 (live on Base)
- **Hosting**: Vercel for UI

## Local development

Prerequisites: [Bun](https://bun.sh) 1.2+, [Foundry](https://book.getfoundry.sh) (for contracts), Node.js 20+.

```bash
# Install all workspace dependencies
bun install

# Run the app dev server (http://localhost:5173)
bun run dev

# Build everything
bun run build

# Format (Prettier for TS/JSON/MD, forge fmt for Solidity)
bun run format

# Lint (ESLint for TS, solhint for Solidity)
bun run lint
```

Copy `.env.example` to `.env` and fill in the values before running anything that talks to a chain. Never commit `.env`.

## Status

Work starts when the first task begins. Track progress inside each task file.
