# ARP — Agent Reputation Protocol

> **The on-chain trust layer for autonomous agents.** ARP provides what agent runtimes are missing: verifiable identity, composable reputation, bounded autonomy, and an economic-conviction marketplace for tools — all on a public chain. Runtime-agnostic.

## Positioning

Agent runtimes today have solid **compute layers** (orchestration, tool invocation, payments) but rely on off-chain trust:

- "Which agent should I hire?" → static listings or reviews
- "Is this agent's reputation real?" → no skin in the game
- "Can I delegate a budget safely?" → custom auth per integration

ARP is the missing **trust + reputation layer** that any runtime can plug into:

| Layer | Provider |
|---|---|
| **Compute runtime** (orchestration, tool calls) | Any — runtime-agnostic |
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

ARP runs three personas in parallel on Intuition Testnet. The demo exercises all three.

### Operator (browser, `/agent`)
One-time setup, then walks away:
1. Mints an ERC-8004 agent NFT.
2. Generates a runtime keypair and binds it via `setAgentWallet`.
3. Deploys a MetaMask Smart Account.
4. Signs two delegations once:
   - **Publish** — `DomainScopeEnforcer([allowedDomains])` + `TrustStakeCapEnforcer(cap, period)` gating `ModuleRegistry.registerModule`.
   - **Compose** — stock `AllowedTargetsEnforcer([MultiVault])` + `AllowedMethodsEnforcer([deposit, createAtoms, createTriples])` + `TrustStakeCapEnforcer(cap, period)` gating Intuition staking + graph writes.

### Agent runtime (terminal)
The repo ships two example runtimes that consume the signed delegations:
5. `scripts/agent-approve-sa.ts` — one-time MultiVault approval so the Smart Account can deposit on the runtime's behalf.
6. `scripts/agent-loop.ts` — autonomous walk of `scripts/manifest-modules.json` (14 tools across 4 domains). Publishes new modules, ensures tool atoms exist, declares `(agent, uses, tool)` triples, stakes tTRUST on each tool. Exercises both revert paths (`DomainNotAllowed`, `StakeExceedsCap`) so the bounds visibly hold.
7. `scripts/agent-server.ts` — on-demand HTTP runtime that accepts a paid audit job, runs it via the Trail of Bits methodologies, **fuzzy-matches the methodologies it actually used** against the registry, and stakes on each matched tool under the compose delegation. Optionally sub-contracts a specialist via a signed leaf delegation (A2A) — `scripts/agent-server-specialist.ts` is the receiving counterpart.

### Consumer (browser, `/hire` and `/tool/:id`)
8. `/` — modules ranked by TVL desc with a live distinct-stakers count. Slither + Mythril climb as runtimes stake; new modules appear as they publish.
9. `/tool/:id` — per-tool detail. Live vault metrics, an optional stake form for human EOAs (economic conviction without an agent identity), and a `@arp-protocol/sdk` snippet showing how a runtime declares + stakes automatically.
10. `/hire` — pick a domain, see the top agents ranked by reputation, pay one in tTRUST, get back a signed audit report with the on-chain stakes the agent placed during execution. If A2A is enabled, the result page also renders the sub-delegation chain (`requester → auditor → specialist`) and the specialist's independently-signed receipt.

### Build a runtime against ARP (`@arp-protocol/sdk`)

Any TypeScript runtime can plug into ARP's trust layer in a few lines — no API key, no indexer, no signing baked in:

```ts
import {createArpClient, findTopAgents, getReputation} from "@arp-protocol/sdk";

const arp = createArpClient();

// "Who should I delegate this Solidity audit to?"
const candidates = await findTopAgents(arp, {
    domain: "solidity-audit",
    minStake: 1_000_000_000_000n,
});

// "Is this agent's track record real?"
const rep = await getReputation(arp, candidates[0].runtimeWallet);
console.log(`${rep.totalStaked} wei across ${rep.distinctAtomCount} tools`);
```

See [`sdk/`](sdk/README.md) for the full surface and a working write-path example. `scripts/agent-server.ts` is the canonical reference runtime — it discovers, hires, executes, and stakes end-to-end using only `@arp-protocol/sdk` + `viem`.

ARP doesn't compute agents — that's the runtime layer's job. ARP is purely declarative + coordination + economic accounting.

## Deployed contracts (Intuition Testnet, chainId 13579)

| Contract | Address |
|---|---|
| `ModuleRegistry` (v2 — schemaURI uniqueness) | [`0xc9a2f66775828017e984E8be077fA2d17e0A41F4`](https://testnet.explorer.intuition.systems/address/0xc9a2f66775828017e984E8be077fA2d17e0A41F4) |
| `IdentityRegistry` (ERC-8004) | [`0xC165A2AD2E540A4069E02834009161E2b4490d5A`](https://testnet.explorer.intuition.systems/address/0xC165A2AD2E540A4069E02834009161E2b4490d5A) |
| `DomainScopeEnforcer` | [`0x516B82E29e3Ca46Ca810FC2EEf348932b198f7f9`](https://testnet.explorer.intuition.systems/address/0x516B82E29e3Ca46Ca810FC2EEf348932b198f7f9) |
| `TrustStakeCapEnforcer` | [`0x7BB56819E9a413B8B4668C5cAF5C494c41dC0F8E`](https://testnet.explorer.intuition.systems/address/0x7BB56819E9a413B8B4668C5cAF5C494c41dC0F8E) |

Composes with the MetaMask Delegation Framework v1.3.0 (`DelegationManager` at `0xdb9B1e94B5b69Df7e401DDbedE43491141047dB3`) and Intuition's MultiVault (`0x2Ece8D4dEdcB9918A398528f3fa4688b1d2CAB91`). Full address set in [deployments/13579.json](deployments/13579.json).

## What's not in this MVP

Stated honestly so reviewers don't infer claims the code doesn't back:

- **No payment-per-call** — tools are not invoked or paid for inside ARP. Tool monetization for a creator happens via bonding-curve appreciation as others stake. Pay-per-use is a separate concern, out of scope.
- **No off-chain execution** — ARP is declarative + coordination. The actual agent runtime (LLM calls, tool invocations, result delivery) lives outside this repo.
- **No verification of declarations** — when an agent declares "I use tool X", the only economic check is its own stake. There is no proof-of-usage layer in this MVP.
- **No dispute mechanism** — false declarations cannot be challenged or slashed on-chain by a third party in this MVP.

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
├── CLAUDE.md                       ← Router for Claude Code (rules, skills, agents)
├── README.md                       ← This file
├── app/                            ← Vite + React + TS + Tailwind v4 UI
│   └── src/{services,hooks,components,pages,lib}
├── sdk/                            ← @arp-protocol/sdk — runtime-agnostic reads
│   ├── README.md
│   └── src/{client,modules,agents,types,abi}
├── contracts/                      ← Foundry workspace (Solidity)
│   └── src/
│       ├── ModuleRegistry.sol
│       ├── enforcers/              ← DomainScopeEnforcer, TrustStakeCapEnforcer
│       └── erc8004/                ← IdentityRegistry + interfaces
├── scripts/                        ← Bun scripts (deploy + runtimes)
│   ├── deploy.sh                   ← three-phase contract deploy
│   ├── seed.ts                     ← seed the first module + atom
│   ├── agent-approve-sa.ts         ← one-time runtime → SA DEPOSIT approval
│   ├── agent-loop.ts               ← autonomous runtime (walks the manifest)
│   ├── agent-server.ts             ← on-demand HTTP runtime (hire flow)
│   ├── agent-server-specialist.ts  ← A2A counterpart, accepts sub-delegations
│   ├── agent-auditor.ts            ← LLM-driven audit (Trail of Bits skills)
│   ├── agent-stake-on-use.ts       ← fuzzy-match used methodologies → stake
│   ├── setup-second-agent.ts       ← one-shot specialist provisioning
│   └── manifest-modules.json       ← demo manifest (14 tools / 4 domains)
├── schemas/                        ← JSON schemas for seed modules
├── deployments/                    ← Deployed addresses per network (13579.json)
├── docs/                           ← Strategic + architectural reference
│   ├── 00_HACKATHON_PIVOT.md       ← Current strategic commitment
│   ├── 01_PROJECT_CONTEXT.md
│   ├── 02_ARCHITECTURE.md          ← Locked decisions
│   ├── 03_MVP_SCOPE.md
│   ├── 04_SEED_MODULES.md
│   ├── 05_UI_DESIGN.md
│   └── 06_BEAR_TRAP_REFERENCE.md   ← Enforcer pattern reference
├── tasks/                          ← Atomic work units (01 → 05b)
└── .claude/                        ← Claude operating layer (rules, skills, agents, ADRs, post-mortems)
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
