# ARP — Agent Reputation Protocol

> **ARP makes money flow to the tools agents actually use.**
>
> Agents record each tool call that works, on an open graph anyone can read, next to stars,
> installs, uptime and paid calls. Stars show who looked. ARP shows who used it.

It stores nothing. What is listed exists somewhere else; what ARP adds is the market. Nobody is
scored: every figure it shows is a deposit somebody else made, and every position can be withdrawn,
so what you read is **current rather than accumulated**.

That line led with **"a registry that points at AI things"** until 2026-10-29. A census dated
2026-10-02 counts **10,411 agent marketplaces** against 9,676 MCP servers — more storefronts than
servers — so "registry" is the one word in this market that distinguishes nothing. What none of
those 10,411 publishes is which listings answer and who stands behind them. `docs/01` carries the
amendment and ADR `0075` the decision.

[docs/12_THE_IDEA.md](docs/12_THE_IDEA.md) is the canonical statement of the mechanism and the only
one. Read it before `08`, `09` or `11` — those are analysis and they drifted.

## Positioning

Agent runtimes have compute layers — orchestration, tool invocation, payments — and take trust
off-chain: a listing, a review, a score, none of which cost anything to produce. ARP is the layer
where an opinion costs something, and any runtime can read it:

| Layer                                           | Provider                                    |
| ----------------------------------------------- | ------------------------------------------- |
| **Compute runtime** (orchestration, tool calls) | Any — runtime-agnostic                      |
| **Trust + identity + reputation**               | ARP (this repo)                             |
| **Coordination chain + graph**                  | Intuition (atoms + triples + bonding curve) |
| **Bounded autonomy + payments**                 | MetaMask Smart Accounts Kit (ERC-7710)      |

ARP's own contracts are deployed on **Intuition Testnet** (chainId 13579). The trust panel and the
tool surfaces **read Intuition mainnet** (chainId 1155), where the mirrored ERC-8004 agents are, and
can **stake real TRUST** there — see _Two networks_ below.

Originally built for the MetaMask Dev Cook-Off (deadline 2026-06-15, now past); that surface is
**set aside** and kept as historical record ([ADR 0033](.claude/choices/0033-the-hackathon-surface-is-set-aside.md)).
`docs/09` is analysis, not commitment — it drifted and [ADR 0049](.claude/choices/0049-arp-does-not-calibrate.md)
corrects it.

## What ARP gives you

1. **Verifiable identity** — an agent is an ERC-8004 NFT. ARP mints one into the canonical registry
   or imports one that already exists, and gives it the Intuition atom everything else reads from.
   The atom's id is the hash of a document derived from the agent's identity, so it is computable
   offline with no credential — which is why ARP can write it rather than wait for a mirror.
2. **A market, not a score** — an agent declares the tools it used, and the declaration costs a
   non-recoverable fee: from 0.1 TRUST on mainnet, from 0.001 on testnet, read off
   `getTripleCost()` rather than copied. The market is a deposit on the agent's or the tool's
   own atom, in both directions: you buy in, or you take your money back out. A position can be
   withdrawn, so what is displayed is current rather than accumulated
   ([ADR 0056](.claude/choices/0056-the-market-on-an-agent-is-on-its-atom-and-the-edge-is-a-receipt.md),
   [ADR 0046](.claude/choices/0046-arp-scores-nobody.md)).
3. **One atom per URL** — a tool's atom derives from its normalised URL and nothing else, so two
   people registering the same tool land on the same market instead of forking it
   ([ADR 0054](.claude/choices/0054-a-tool-atom-is-derived-from-its-url.md)).
4. **Bounded autonomy** — operators sign ERC-7710 delegations with caveat enforcers. The runtime
   executes within those bounds; the framework reverts on out-of-scope attempts before any state
   change.
5. **Nothing in the request path** — ARP ships a node the operator runs and never hosts one they
   have to reach. The test is mechanical: unplug ARP's servers and every declaration, every stake
   and every agent-to-agent call still completes
   ([ADR 0045](.claude/choices/0045-the-invariant-is-the-request-path-not-the-runtime.md)).

## The core primitives

```
Atom        a thing — agent, tool, label, identity. Has a vault.
Triple      a directed claim: (subject, predicate, object) of atoms.
Stake       TRUST deposited into a vault, withdrawable — economic conviction.
Delegation  ERC-7710 signed authorization, scoped by caveat enforcers.
```

## What is live, and where

### The loop, walked for real

```
bun run scripts/demo-adopt.ts --agent 8453/<tokenId> --tool <url> --stake 0.01 --execute
bun run scripts/demo-hire.ts  --agent 8453/<tokenId> --node http://localhost:3100 --execute
```

`demo-adopt` takes an agent from nothing to a readable position: the identity atom, the `same as`
edge, the `(agent, uses, tool)` declaration, the stake behind it, and the page it is read from.
`demo-hire` is a second agent discovering the first, calling it, verifying the signed receipt, and
pricing a rating of the result. Both ran end-to-end on testnet 13579 on 2026-10-20; both are dry by
default and only `--execute` signs.

### Pages

| route                      | what it is                                                                                                                                                                                                                     | chain                                 |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------- |
| `/agents`                  | the mirrored ERC-8004 cohort, paged, ordered by measures of evidence and never by a score                                                                                                                                      | mainnet 1155 (read)                   |
| `/agent/:chainId/:tokenId` | one agent's trust surface, one tab per trust provider, with a staking control                                                                                                                                                  | mainnet (read + write)                |
| `/agent`                   | **one door for your agent.** One question — does it already have an ERC-8004 id? — then either prove you own it and link your staking account, or mint one                                                                     | Base 8453 to mint, the toggle to link |
| `/rig`                     | the five-step testnet bring-up: mint into ARP's own registry copy, designate a runtime wallet, deploy a Smart Account, sign two delegations, fund it. A rehearsal of `docs/12` point 5, consumed by `scripts/`. Not in the nav | testnet 13579                         |
| `/tools`                   | tools agents declared using                                                                                                                                                                                                    | either, the toggle                    |
| `/atom/:atomId`            | one atom — a tool, a tag, a category, a protocol, an agent — its own market, and every claim pointing at it grouped by predicate                                                                                               | either, read only                     |
| `/`                        | the front page. Every figure on it is read from the chain in view, including the empty state                                                                                                                                   | either, the toggle                    |

`/hire` was a demo that the index works. It was never finished and is removed (2026-10-20); hiring is
`tasks/25`.

### One path, and four jobs on it

The skill, the MCP server and the node are not three alternatives. They do different jobs on one
path:

|                    | what it is                                                                                                  | when you want it                                                       |
| ------------------ | ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| **the skill**      | [`skills/arp/SKILL.md`](skills/arp/SKILL.md) — the whole procedure, as public reads and calls you sign      | always. It is the source of truth and it replaces the other two        |
| **the MCP server** | `apps/mcp/src/server.ts`, stdio — it _prepares_ the same calls                                           | when you would rather not encode calldata. Holds no key, sends nothing |
| **the node**       | `apps/node/src/node.ts` — an inbound endpoint other agents reach you at. Signs receipts, never transactions | only for being **hired**. Irrelevant to reading, declaring or listing  |

And the four jobs, because they need different things and only one of them needs a wallet at all:

| you want to                                   | you need                                                |
| --------------------------------------------- | ------------------------------------------------------- |
| **check** a tool or an agent before using it  | nothing — public reads, no wallet, no identity          |
| **declare** what you used, and pay to mean it | a funded wallet + an ERC-8004 identity                  |
| **list** a tool nobody has listed             | a funded wallet. An atom has no subject, so no identity |
| **be hired**                                  | an endpoint you run                                     |

**Using** ARP needs nothing installed; **being used** needs an endpoint you provide
([ADR 0045](.claude/choices/0045-the-invariant-is-the-request-path-not-the-runtime.md)). Unplug
ARP's servers and every read, declaration and stake above still completes.

### The delegation guard rail

Deployed on testnet 13579, where ARP's contracts are. `DomainScopeEnforcer` bounds where an agent may
stake; `TrustStakeCapEnforcer` caps the native value it may spend per rolling period — **the amount,
not the kind**, so fees count against it too and an agent can exhaust a cap and hold no position.
Out-of-scope attempts revert before any state change. The agent-server surface that drove them is
**set aside** ([ADR 0033](.claude/choices/0033-the-hackathon-surface-is-set-aside.md)) and kept as
historical record.

### Build against ARP (`@arp-protocol/core`)

No API key, no indexer of your own, no signing baked in. Every call below was executed against
Intuition mainnet on 2026-10-21 before being written here, and the outputs are the real ones.

```ts
import { getToolUsage, listTools, normaliseToolUrl, toolAtomUri } from '@arp-protocol/core';

const GRAPHQL = 'https://mainnet.intuition.sh/v1/graphql';

// "Which tools have agents declared using, and how many of those declarations
//  did somebody pay to stand behind?"
const page = await listTools({ graphqlUrl: GRAPHQL, order: 'priced-edges' });
//   → 0 tools. Honest, and the state of the world: `listTools` keeps only edges whose
//     subject carries a `same as` edge — an agent declaration rather than ordinary prose —
//     and 0 of mainnet's 185 `uses` edges do.

// "What is one tool's standing?" — both sides of every claim about it.
const usage = await getToolUsage('0x014f7789…a2ce060b', { graphqlUrl: GRAPHQL });
//   → "Colony", 1 edge. support 1000000 wei across 0 positions: that is `minShare`,
//     the dust every term is seeded with at creation, so nobody has staked (ADR 0042).

// The atom id of a tool, from its URL alone. No credential, no network, no pinning.
normaliseToolUrl('http://www.github.com/crytic/slither/');
//   → 'https://github.com/crytic/slither'
toolAtomUri('github.com/crytic/slither');
//   → 'ipfs://bafkreidf2beugrdbzvidlwibi46fhyanrh7v3noaucjahsllu2xjqtas44'
```

Writing is a **plan**, never a transaction: `prepareDeclareUsed`, `prepareStakeOnUsed` and
`prepareIdentityAtom` return calls with their previewed shares, and the package holds no key and has
no send path ([ADR 0038](.claude/choices/0038-the-write-path-is-a-plan-not-a-transaction.md)). You
sign them with your own wallet. [`packages/protocol/README.md`](packages/protocol/README.md) has the
full surface.

**Or use it with nothing installed.** [`skills/arp/SKILL.md`](skills/arp/SKILL.md) is the whole
procedure — term ids, the atom recipes, the four queries, the write order — readable by any agent
that can sign a transaction and make an HTTP request
([ADR 0052](.claude/choices/0052-the-procedure-is-the-product-for-the-use-half.md)).

## Deployed contracts (Intuition Testnet, chainId 13579)

| Contract                                     | Address                                                                                                                                       |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `ModuleRegistry` (v2 — schemaURI uniqueness) | [`0xc9a2f66775828017e984E8be077fA2d17e0A41F4`](https://testnet.explorer.intuition.systems/address/0xc9a2f66775828017e984E8be077fA2d17e0A41F4) |
| `IdentityRegistry` (ERC-8004)                | [`0xC165A2AD2E540A4069E02834009161E2b4490d5A`](https://testnet.explorer.intuition.systems/address/0xC165A2AD2E540A4069E02834009161E2b4490d5A) |
| `DomainScopeEnforcer`                        | [`0x516B82E29e3Ca46Ca810FC2EEf348932b198f7f9`](https://testnet.explorer.intuition.systems/address/0x516B82E29e3Ca46Ca810FC2EEf348932b198f7f9) |
| `TrustStakeCapEnforcer`                      | [`0x7BB56819E9a413B8B4668C5cAF5C494c41dC0F8E`](https://testnet.explorer.intuition.systems/address/0x7BB56819E9a413B8B4668C5cAF5C494c41dC0F8E) |

Composes with the MetaMask Delegation Framework v1.3.0 (`DelegationManager` at `0xdb9B1e94B5b69Df7e401DDbedE43491141047dB3`) and Intuition's MultiVault (`0x2Ece8D4dEdcB9918A398528f3fa4688b1d2CAB91`). Full address set in [deployments/13579.json](deployments/13579.json).

## Two networks, and which one spends money

|                                                         | Intuition Testnet 13579       | Intuition mainnet 1155           |
| ------------------------------------------------------- | ----------------------------- | -------------------------------- |
| ARP's registries (`ModuleRegistry`, `IdentityRegistry`) | deployed here                 | **not deployed, not planned**    |
| ARP's two caveat enforcers                              | deployed here                 | deployed 2026-09-16, never fired |
| The mirrored ERC-8004 agents                            | absent                        | here                             |
| What the panels read                                    | —                             | here                             |
| What staking spends                                     | tTRUST (free from the faucet) | **real TRUST**                   |

The panels read mainnet because that is where the cohort is, and reads are free and keyless.

**How big the cohort is, and the gap that matters more.** Measured 2026-10-21 by
`scripts/measure/registry-mintability.ts`: Intuition reaches **28,720** agents through a `same as`
edge, against a canonical Base registry whose **next id is 444,562**. So roughly **one agent in
fifteen** has an Intuition identity atom, and the other fourteen have to have one written — which is
why `/agent/import` writes it rather than waiting
([ADR 0047](.claude/choices/0047-the-mirror-is-a-prerequisite-and-signing-is-a-separate-program.md)).
The mirror has not moved since 2026-09-16; the registry has. Re-run the script rather than quoting
these — and do not quote a daily rate, because two observations the same day imply rates 2.6× apart.

Staking deposits **real TRUST** into Intuition's own MultiVault — not an ARP contract. That is
authorised deliberately and narrowly by [ADR 0017](.claude/choices/0017-arp-stakes-real-trust-on-mainnet.md),
behind seven safeguards including a 1 TRUST ceiling and a confirmation step. Every mainnet
transaction this app sends is signed by a human in their own wallet.

**The rule is narrower than "no agent may ever sign on mainnet"**, and the qualifier matters because
the broad version forbids the product. It is: **no ARP agent, script or automated process may sign a
mainnet transaction with ARP's own funds.** An external agent depositing _its own operator's_ TRUST,
bounded by caveats that operator signed, is `docs/12` points 3 and 5 — the mechanism, not a
violation. The one canonical statement is in
[`.claude/rules/security.md`](.claude/rules/security.md); if this paragraph ever disagrees with it,
that file wins.

## What's not in this MVP

- **No payment-per-call** — tools are not invoked or paid for inside ARP. Tool monetization for a creator happens via bonding-curve appreciation as others stake. Pay-per-use is a separate concern, out of scope.
- **No off-chain execution** — ARP is declarative + coordination. The actual agent runtime (LLM calls, tool invocations, result delivery) lives outside this repo.
- **No verification of declarations** — when an agent declares "I use tool X", the only economic
  check is its own stake. There is no proof-of-usage layer, and there is not going to be one: it
  needs ground truth and this mechanism deliberately does not
  ([ADR 0049](.claude/choices/0049-arp-does-not-calibrate.md)).
- **No slashing** — a false declaration cannot be confiscated. What it costs is the non-recoverable
  fee to write it, per declaration, forever: from 0.1 TRUST on mainnet and from 0.001 on testnet,
  read off `getTripleCost()`.

  **Contestability is available and all but unused, and this bullet used to lead on it.** Intuition
  gives every triple a counter-vault for free, so anyone _can_ deposit against a claim. Measured on
  mainnet 1155, 2026-10-21 (`scripts/measure/counter-side-usage.ts`): **1** of the 185 `uses` edges
  has ever been contradicted, and **969 of 285,775** triples chain-wide — 0.34%. Nobody takes the
  other side of a statement of fact, because there is no resolution mechanism that would pay them
  for being right. So the live guards are the **cost of writing** and the fact that a position can
  be **withdrawn**, which is what keeps a figure current rather than accumulated
  ([ADR 0056](.claude/choices/0056-the-market-on-an-agent-is-on-its-atom-and-the-edge-is-a-receipt.md)).

## Stack

- **Runtime & package manager** — Bun 1.2+ (workspaces, installs, scripts)
- **Contracts** — Solidity 0.8.24, Foundry
- **Chains** — Intuition Testnet 13579 (ARP's own contracts) and Intuition mainnet 1155 (the
  cohort), chosen by a toggle that governs reads and writes alike
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
├── apps/                           ← what runs (ADR 0082)
│   ├── web/                        ← Vite + React + TS + Tailwind v4 UI
│   │   └── src/{services,hooks,components,pages,lib}
│   ├── mcp/                        ← the MCP server, stdio or HTTP. Signs no transaction
│   ├── node/                       ← the inbound endpoint. Signs receipts, never transactions
│   └── hook/                       ← the runtime PostToolUse hook. No network
├── packages/                       ← what is imported
│   ├── graphql/                    ← @arp-protocol/graphql — transport + Intuition query documents
│   └── protocol/                   ← @arp-protocol/core — the protocol layer (ADR 0041)
│       ├── README.md               ← the surface a third party reads
│       ├── src/                    ← identity, graph, verifier, tool usage,
│       │                             declare/stake plans. Never signs, never sends
│       └── src/arp/                ← ARP's own contracts (the folded-in `sdk/`)
├── contracts/                      ← Foundry workspace (Solidity)
│   └── src/
│       ├── ModuleRegistry.sol
│       ├── enforcers/              ← DomainScopeEnforcer, TrustStakeCapEnforcer
│       └── erc8004/                ← IdentityRegistry + interfaces
├── scripts/                        ← personal tooling, never imported by apps/ or packages/
│   ├── helpers/                    ← what several scripts share (shapes, send-plan, pinning)
│   ├── test/                       ← `bun run test:scripts`
│   ├── demo-adopt.ts               ← an agent from nothing to a readable position
│   ├── demo-hire.ts                ← a second agent discovers, calls, verifies, rates
│   ├── helpers/send-plan.ts        ← the ONLY place that signs
│   ├── pin-tool.ts                 ← make a derived tool atom readable
│   ├── measure/*.ts                ← every number in this repo is re-runnable from one of these
│   ├── deploy.sh                   ← three-phase contract deploy
│   └── agent-server*.ts, agent-loop.ts, agent-auditor.ts
│                                     ← the set-aside hackathon surface (ADR 0033). Historical
│                                       record, not a dependency. Do not copy from them
├── skills/arp/SKILL.md             ← PUBLISHABLE: how to USE ARP with nothing installed.
│                                     `.claude/skills/arp-contributing/` is the other one —
│                                     how to work ON this repo
├── schemas/                        ← JSON schemas for seed modules
├── deployments/                    ← Deployed addresses per network (13579.json, 1155.json)
├── FUTURE.md                       ← asked for, deliberately not built yet
├── docs/                           ← Strategic + architectural reference
│   ├── 12_THE_IDEA.md              ← THE canonical mechanism. Read this first
│   ├── 01_PROJECT_CONTEXT.md       ← positioning, still authoritative
│   ├── 02_ARCHITECTURE.md          ← locked decisions
│   ├── 03_MVP_SCOPE.md
│   ├── 05_UI_DESIGN.md
│   ├── 08–11                       ← analysis, NOT commitment. They drifted; 12 corrects them
│   ├── 00_HACKATHON_PIVOT.md       ← historical record (deadline 2026-06-15, past)
│   ├── 13_THE_THREE_FLOWS.md, 14_THE_WITNESS_PROBLEM.md, 15_ROADMAP.md
│   └── 16_THE_AGENT_PAGE.md, 17_THE_ATOM_PAGE.md
│                                   ← design briefs, handed to a design agent. Not decisions
├── tasks/                          ← Atomic work units
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
