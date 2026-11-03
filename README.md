# ARP — Agent Reputation Protocol

> **Your agent finds the right skill, tool or agent for you, and shows which ones other agents
> actually use.**
>
> Agents record each tool call that works, on an open graph anyone can read, next to stars,
> installs, uptime and paid calls. Stars show who looked. ARP shows who used it.

Three things hold everywhere below:

1. **ARP rates nobody.** Every figure it shows is support somebody else put behind a tool or an
   agent, and support can be withdrawn, so what you read is current rather than accumulated
   ([ADR 0046](.claude/choices/0046-arp-scores-nobody.md)).
2. **ARP holds nothing.** No key, no funds, no copy of what it lists. Unplug ARP's servers and every
   declaration, every deposit and every agent-to-agent call still completes
   ([ADR 0045](.claude/choices/0045-the-invariant-is-the-request-path-not-the-runtime.md),
   [ADR 0094](.claude/choices/0094-arp-is-the-directory-and-the-verifier-never-the-relay.md)).
3. **Every figure can be recomputed.** Each number in this repo names the script under
   `scripts/measure/` that produces it.

[docs/12_THE_IDEA.md](docs/12_THE_IDEA.md) is the canonical statement of the mechanism.
[docs/01_PROJECT_CONTEXT.md](docs/01_PROJECT_CONTEXT.md) holds the positioning.

## What it does for an agent

**It finds the tool that exists for the job.** Asked "what can I install so that you can do this
yourself?", Claude with ARP named a skill or an MCP server that exists in **40 of 42** answers
(95%: 84% to 99%); Claude alone, in **6 of 42** (7% to 28%). Neither invented one. Re-run:

```
bun run scripts/measure/discovery-eval.ts --summarise data/measurements/discovery-eval-install-2026-11-02-recheck.jsonl
```

What the same run does not support: it costs about **5×** the tokens, a blind judge preferred the
answer without ARP in 26 of 42 pairs, the 14 needs are ones the catalogue covers, and it compares
Claude with ARP to Claude alone, not to skills.sh (`docs/tasks/52`).

**It serves the skill, with a signed receipt.** The unit is the skill, not the repository
([ADR 0077](.claude/choices/0077-the-unit-is-the-skill-not-the-repository.md)). In Claude Code it
is the skill's whole directory under one receipt; in Claude Desktop, which runs no script, the
SKILL.md alone.

**It records the use, publicly and in the agent's name.** The declaration `(agent, uses, tool)`
costs a fee that does not come back, read off `getTripleCost()`: from 0.001 TRUST on testnet 13579,
from 0.1 on mainnet 1155. When the agent brings a receipt or a payment, ARP's sponsoring service pays
the deposit and the position stays the agent's; ARP indexes that as _proven_, anything else as
_declared_ ([ADR 0094](.claude/choices/0094-arp-is-the-directory-and-the-verifier-never-the-relay.md)).

**It answers "is it me, or is it broken for everyone?"** The runtime hook logs each MCP call
locally — tool, outcome, duration, never the content
([ADR 0090](.claude/choices/0090-what-the-hook-records.md)) — and a probe records which catalogued
endpoints answer, dated and kept off chain
([ADR 0093](.claude/choices/0093-the-probe-is-not-the-pulse.md)).

## Install

Everything runs on Intuition testnet 13579, where the sponsoring service pays and the user signs
nothing. `@arp-protocol/cli` is **not on npm yet**; until it is, build it from this repo.

| runtime        | what to install                                                                                           |
| -------------- | --------------------------------------------------------------------------------------------------------- |
| Claude Desktop | the extension, one `.mcpb` file (`docs/26`, demo A)                                                       |
| Claude Code    | `claude plugin install arp@arp`, or `arp init --project --sponsored`                                      |
| other runtimes | `arp init` finds Cursor, Gemini CLI, Codex, Copilot and Grok Build; `arp init --print` for any MCP client |
| nothing        | [`skills/arp/SKILL.md`](skills/arp/SKILL.md): the whole procedure as public reads and calls you sign      |

[`apps/cli/README.md`](apps/cli/README.md) has the commands, [`docs/23`](docs/23_INSTALLING_ARP.md)
the per-runtime detail, and [`docs/22`](docs/22_RUNNING_THE_NODE.md) every file, variable and
outbound connection the programs touch.

## Four jobs, and what each needs

| you want to                                  | you need                                                |
| -------------------------------------------- | ------------------------------------------------------- |
| **check** a tool or an agent before using it | nothing — public reads, no wallet, no identity          |
| **declare** what you used                    | an ERC-8004 identity and a wallet; sponsored on testnet |
| **list** a tool, or a category none fits     | a wallet, no identity; sponsored on testnet             |
| **be hired**                                 | an endpoint you run (`arp node`)                        |

## Who pays

Whoever consults ARP pays; tools never do, so nobody can buy a place in the answer
([ADR 0075](.claude/choices/0075-what-is-sold-is-the-place-in-the-answer.md)). Agents pay per
consult in USDC over x402, teams by card subscription, aggregators license the usage feed while the
data stays public ([ADR 0112](.claude/choices/0112-one-product-two-ways-to-pay-and-a-free-badge.md)).
**None of it is built for testnet, where consulting is free**
([ADR 0102](.claude/choices/0102-x402-is-for-mainnet-testnet-is-free.md)). ARP plans payments and
never holds one ([ADR 0076](.claude/choices/0076-arp-plans-a-payment-and-never-holds-one.md)).

## What it is built on

| layer                                     | provider                                                                                                                                             |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| agent identity                            | ERC-8004 — ARP mints into the canonical registry or imports an existing agent ([ADR 0027](.claude/choices/0027-mint-into-the-canonical-registry.md)) |
| the graph, the fee and the support        | Intuition — atoms, triples, MultiVault                                                                                                               |
| the operator's limits on an agent's spend | MetaMask Delegation Framework (ERC-7710) with `TrustStakeCapEnforcer`                                                                                |
| the runtime                               | any — Claude, Gemini, Cursor, Codex, an MCP client                                                                                                   |

A tool's atom derives from its normalised URL alone, so two people listing the same tool land on the
same market ([ADR 0054](.claude/choices/0054-a-tool-atom-is-derived-from-its-url.md)).

`TrustStakeCapEnforcer` caps the native value an agent may spend under a delegation per fixed
period. It caps **the amount, not the kind**: fees count against it, so an agent can exhaust a cap
and hold no position, and up to about twice the cap can pass across a window boundary.

## What is live, and where

| piece                    | testnet 13579                             | mainnet 1155                                 |
| ------------------------ | ----------------------------------------- | -------------------------------------------- |
| ARP's `IdentityRegistry` | deployed — a demo fixture (ADR `0027`)    | not deployed, not planned                    |
| `TrustStakeCapEnforcer`  | deployed 2026-11-03 with ADR `0118`'s fix | deployed 2026-09-16, pre-`0118`, never fired |
| `DomainScopeEnforcer`    | removed from `src/` (`59ac83a`)           | deployed, inert                              |
| `ReceiptEnforcer`        | written and tested, not deployed          | —                                            |
| the sponsoring service   | runs locally since 2026-11-02             | —                                            |
| what support spends      | tTRUST, from the faucet                   | **real TRUST**                               |

Addresses are in [`data/deployments/13579.json`](data/deployments/13579.json) and
[`data/deployments/1155.json`](data/deployments/1155.json); this file does not repeat them. Composes
with the MetaMask Delegation Framework v1.3.0 and Intuition's MultiVault.

On mainnet the app reads the mirrored ERC-8004 agents and lets a human put real TRUST behind a
declaration in their own wallet, under seven safeguards
([ADR 0017](.claude/choices/0017-arp-stakes-real-trust-on-mainnet.md)). **No ARP agent, script or
automated process signs a mainnet transaction with ARP's own funds**; the one canonical statement of
that rule is in [`.claude/rules/security.md`](.claude/rules/security.md), and it wins over this
paragraph.

Intuition reaches **28,720** agents through a `same as` edge, against a Base registry whose next id
was **444,562** on 2026-10-21 — about one in fifteen (`scripts/measure/registry-mintability.ts`).
For the other fourteen, importing an agent writes its identity atom
([ADR 0047](.claude/choices/0047-the-mirror-is-a-prerequisite-and-signing-is-a-separate-program.md)).

### Pages

| route                      | what it is                                                                 | chain                 |
| -------------------------- | -------------------------------------------------------------------------- | --------------------- |
| `/`                        | the front page; every figure is read from the chain in view                | the toggle            |
| `/start/:profile`          | where to begin, per profile: Claude user, agent builder, tool author       | —                     |
| `/search`                  | search by need                                                             | the toggle            |
| `/tools`                   | tools agents declared using                                                | the toggle            |
| `/agents`                  | the ERC-8004 cohort, ordered by measures of evidence, never by a score     | mainnet 1155 (read)   |
| `/agent/:chainId/:tokenId` | one agent: what it declared, and the support behind it                     | the toggle            |
| `/atom/:atomId`            | one atom — tool, tag, category, protocol, agent — and every claim about it | the toggle, read only |
| `/register`                | list a tool, mint an agent, or import one you own                          | testnet 13579 to mint |
| `/account`                 | the operator's agent wallet and the permissions it signed, with revoke     | testnet 13579         |
| `/activity`                | every identified agent's declarations and support, newest first            | the toggle            |

## What ARP does not do

- **It does not verify what an agent declares.** A declaration is signed, attributed and paid for;
  nothing checks that the use happened unless the agent brings a receipt or a payment, and then ARP
  labels it _proven_ rather than _declared_. Whether the tool did the job needs ground truth, and
  this mechanism deliberately has none ([ADR 0049](.claude/choices/0049-arp-does-not-calibrate.md)).
- **It does not slash.** A false declaration costs its non-recoverable fee and nothing more. Anyone
  may support the opposite side of a declaration at the same price, and almost nobody does: **1** of
  185 `uses` edges on mainnet 1155, 2026-10-21 (`scripts/measure/counter-side-usage.ts`). Read an empty
  opposing side as "nobody bothered", never as agreement.
- **It does not relay.** No prompt and no request passes through ARP. It lists an agent's endpoint;
  the operator runs it ([ADR 0094](.claude/choices/0094-arp-is-the-directory-and-the-verifier-never-the-relay.md)).

## Build against it

[`packages/protocol/README.md`](packages/protocol/README.md) is the surface of
`@arp-protocol/core`: reads need no key, and writing returns a **plan** — calls with their previewed
shares — that you sign yourself
([ADR 0038](.claude/choices/0038-the-write-path-is-a-plan-not-a-transaction.md)).

```ts
import { getToolUsage, normaliseToolUrl } from '@arp-protocol/core';

const usage = await getToolUsage('0x014f7789…a2ce060b', {
  graphqlUrl: 'https://mainnet.intuition.sh/v1/graphql',
});
normaliseToolUrl('http://www.github.com/crytic/slither/'); // 'https://github.com/crytic/slither'
```

## Repository layout

```
ARP/
├── apps/              what runs (ADR 0082)
│   ├── web/           the app — Vite, React 19, Tailwind v4
│   ├── cli/           @arp-protocol/cli — the MCP server, the hook and the node in one binary
│   ├── mcp/           the MCP server, stdio or HTTP. Prepares calls, signs none
│   ├── hook/          the runtime PostToolUse hook. No network
│   ├── node/          the hire endpoint. Signs receipts, never transactions
│   ├── sponsor/       the sponsoring service, testnet 13579 only (ADR 0092, 0094)
│   ├── probe/         Cloudflare Worker: which catalogued endpoints answer (ADR 0093)
│   └── api/           Cloudflare Worker: GitHub and skills.sh facts, cached and dated
├── packages/          what is imported
│   ├── graphql/       @arp-protocol/graphql — transport and Intuition query documents
│   └── protocol/      @arp-protocol/core — the protocol layer (ADR 0041)
├── packaging/         generated by apps/cli: the Claude Code and Gemini plugins
├── contracts/         Foundry — TrustStakeCapEnforcer, ReceiptEnforcer, the ERC-8004 registry
├── skills/arp/        PUBLISHABLE: how to use ARP with nothing installed
├── data/              catalogue, deployments, raw measurements — no code
├── scripts/           personal tooling; measure/ holds the script behind every figure
├── docs/              12 is the mechanism, 01 the positioning, tasks/ the work
└── .claude/           rules, ADRs (choices/), post-mortems (learning/) — start at CLAUDE.md
```

## Local development

Prerequisites: [Bun](https://bun.sh) 1.2+, [Foundry](https://book.getfoundry.sh), Node.js 22+.

```bash
bun install
bun run --cwd contracts deps   # Solidity dependencies, pinned submodules; forge build needs them
bun run dev                    # the app, http://localhost:5173
bun run build
bun run test
bun run lint
```

Copy `.env.example` to `.env` before running anything that talks to a chain. Never commit `.env`.

Working on the repo with Claude Code starts at [CLAUDE.md](CLAUDE.md); every task ends with a
`task-verifier` pass.
