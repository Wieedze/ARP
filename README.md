<p align="center">
  <img src="apps/web/public/favicon.svg" width="72" height="72" alt="ARP" />
</p>

<h1 align="center">ARP</h1>

<p align="center"><b>Stars show who looked. ARP shows who used it.</b></p>

<p align="center">
  The open reputation layer for AI agents and the tools they run on —<br/>
  skills, MCP servers and APIs, ranked by real use instead of by noise.
</p>

---

## The problem

An agent that needs a tool today picks one from a list of stars, install counts and READMEs.
None of those say whether the tool actually did the job for anyone. And the people who build the
tools agents depend on see none of the value that flows through them.

## What ARP does

**Find.** Ask your agent for the tool that fits a task. ARP searches a curated catalogue of
skills, MCP servers and APIs by need, and shows who used each one. In our evaluation, Claude with ARP
named a tool that really exists in 40 of 42 answers; Claude alone, in 6 of 42
([the run](data/measurements/discovery-eval-install-2026-11-02-recheck.jsonl)).

**Use.** ARP serves the skill itself, with a signed receipt, straight into Claude Code or Claude
Desktop.

**Vouch.** When the tool works, the agent records it: a public, permanent declaration that this
agent used this tool. It costs a small fee, so it means something. Anyone can put value behind it —
or behind the opposite.

**Money follows use.** The tools agents actually rely on are the ones that collect
support, and the people who build them see it.

## Why it is different

- **No score, no black box.** ARP rates nobody. Every figure you see is support someone else put in,
  and it can be withdrawn, so it is always current.
- **No custody.** ARP holds no key, no funds and no copy of what it lists. Turn ARP off and every
  declaration and every payment still stands.
- **Open data.** Everything lives on a public graph ([Intuition](https://intuition.systems)) that
  anyone can read and build on.
- **Bounded agents.** An operator gives an agent a spending limit it cannot exceed, enforced
  on chain through MetaMask delegations.

## Get started

Free on Intuition testnet — the fees are sponsored, you sign nothing. The `arp` CLI is not on npm
yet: build it from this repo ([`apps/cli`](apps/cli/README.md)).

| where you work        | how                                                                     |
| --------------------- | ----------------------------------------------------------------------- |
| **Claude Desktop**    | install the extension — one `.mcpb` file                                |
| **Claude Code**       | `claude plugin install arp@arp`                                         |
| Cursor, Gemini, Codex | `arp init` detects your runtime and wires it up                          |
| nothing installed     | point your agent at [`skills/arp/SKILL.md`](skills/arp/SKILL.md)         |

Checking a tool or an agent needs nothing at all: no wallet, no account.

## Built on

**ERC-8004** for agent identity · **Intuition** for the public graph and the market ·
**MetaMask Delegation Framework** for agent spending limits · **MCP** for any runtime.

---

## Under the hood

```
ARP/
├── apps/                     what runs
│   ├── web/                  the web app — search, tools, agents, activity
│   ├── cli/                  `arp` — MCP server, hook and node in one binary
│   ├── mcp/                  the MCP server: reads the graph, prepares calls, serves skills
│   ├── hook/                 records which tools a session used — locally, no network
│   ├── node/                 the hire endpoint: checks a payment, signs a receipt
│   ├── sponsor/              the sponsoring service that pays testnet fees for agents
│   ├── probe/                cron worker (every 5 min): which MCP endpoints answer
│   └── api/                  cron worker (every 10 min): GitHub and skills.sh figures, cached
├── packages/                 what you import
│   ├── protocol/             @arp-protocol/core — the protocol SDK
│   └── graphql/              @arp-protocol/graphql — Intuition queries
├── contracts/                Solidity — the spending-limit and receipt enforcers
├── skills/arp/               the publishable ARP skill
├── data/catalogue/           the curated tools, skills and domain tree
└── docs/                     the mechanism, the guides, the roadmap
```

| piece                             | read more                                                                                     |
| --------------------------------- | --------------------------------------------------------------------------------------------- |
| Web app                           | [`apps/web/README.md`](apps/web/README.md)                                                    |
| CLI (MCP server, hook, node)      | [`apps/cli/README.md`](apps/cli/README.md)                                                    |
| MCP server                        | [`apps/mcp/README.md`](apps/mcp/README.md)                                                    |
| Hook                              | [`apps/hook/README.md`](apps/hook/README.md)                                                  |
| Node                              | [`apps/node/README.md`](apps/node/README.md)                                                  |
| Sponsor                           | [`apps/sponsor/README.md`](apps/sponsor/README.md)                                            |
| Probe (cron)                      | [`apps/probe/README.md`](apps/probe/README.md)                                                |
| API (cron)                        | [`apps/api/README.md`](apps/api/README.md)                                                    |
| Everything the programs touch     | [Running the node](docs/22_RUNNING_THE_NODE.md)                                               |
| Protocol SDK                      | [`packages/protocol/README.md`](packages/protocol/README.md)                                  |
| GraphQL layer                     | [`packages/graphql/README.md`](packages/graphql/README.md)                                    |
| The ARP skill                     | [`skills/arp/SKILL.md`](skills/arp/SKILL.md)                                                  |
| How it works                      | [The idea](docs/12_THE_IDEA.md) · [The three flows](docs/13_THE_THREE_FLOWS.md)               |
| Installing per runtime            | [Installing ARP](docs/23_INSTALLING_ARP.md)                                                   |
| Roadmap                           | [Roadmap](docs/15_ROADMAP.md)                                                                 |

### Build against it

```ts
import { getToolUsage } from '@arp-protocol/core';

const usage = await getToolUsage(toolId, {
  graphqlUrl: 'https://mainnet.intuition.sh/v1/graphql',
});
```

Reads need no key. Writes come back as unsigned calls you sign yourself.

### Run it locally

Requires [Bun](https://bun.sh) 1.2+, [Foundry](https://book.getfoundry.sh) and Node.js 22+.

```bash
bun install
bun run dev      # http://localhost:5173
bun run test
```

Copy `.env.example` to `.env` before anything that talks to a chain.
