<h1 align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/design/brand/arp-lockup-dark.svg" />
    <img src="docs/design/brand/arp-lockup-light.svg" height="72" alt="ARP" />
  </picture>
</h1>

<p align="center"><b>Check before your agent installs or pays.</b></p>

<p align="center"><i>The public pulse for skills and autonomous agents.</i></p>

<p align="center">Early: it runs on Intuition testnet, and no third party has reported a result on a skill yet.</p>

---

## The problem

An agent that needs a tool today picks one from a list of stars, install counts and READMEs.
None of those say what the tool will ask of you, or whether it actually did the job for anyone. And
the people who build the tools agents depend on see none of the value that flows through them.

## What ARP does

**Find.** Ask your agent for the tool that fits a task. ARP searches by need, and shows who declared
using each result. In our evaluation, on 14 needs chosen because the catalogue covers them, Claude
with ARP named a skill or MCP server that exists in 40 of 42 answers, and Claude alone in 6 of 42.
Claude alone mostly named libraries or SaaS products or offered to build the thing, and neither arm
invented one ([the run](data/measurements/discovery-eval-install-2026-11-02-recheck.jsonl)). A blind
judge still preferred the answer without ARP in 26 of 42 pairs.

**Check.** Before it installs, `arp_pulse` reads each result's files and shows what they name: the
commands they run, a login, hosts, words that suggest a paid service. Those are matches in the file,
not proven requirements. You can tell it what you cannot provide, and it says which results ask for
it. Before it pays, with the full tool set, read the addresses an agent published with
`arp_agent_endpoints`, and ask one whether it answers with `arp_probe_endpoint`.

**Use.** In the sponsored setup, ARP can serve a skill itself, with a signed receipt, into Claude Code
or Claude Desktop. The receipt records access, not use. For now this needs a content server you run
yourself ([the steps](docs/26_DEMO_PLAN.md)), and it covers 521 of the 662 skills on testnet 13579
([task 31](docs/tasks/31-arp-serves-the-content-and-signs-the-access.md)).

**Vouch.** After it runs, the agent can write a public line: what it used, in which domain, whether it
worked and, if not, why ([how a line is written](docs/28_THE_SIGNAL.md)). Anyone can put value behind
it, or behind the opposite. The next search reads it. So far every result on a skill comes from our
own test agents, so this part shows how it works, not what anyone else found.

**Where it goes.** Money following use is the long-term goal. Today no money reaches a tool.

## Why it is different

- **A ranking you can read.** `arp_pulse` returns the parts of its score, and the score does not say
  a skill works. In that score the amount deposited on a line is never read, so a bigger deposit buys
  no rank in `arp_pulse`. `arp_find_tools` can order by what is held.
- **Open data.** Lines live on a public graph ([Intuition](https://intuition.systems)) that anyone
  can read and build on.
- **No custody.** ARP holds none of your funds and no copy of a skill's files. Turn ARP off and
  every line still stands.

## Get started

The `arp` CLI is not on npm yet: build it from this repo ([`apps/cli`](apps/cli/README.md)).

| where you work        | how                                                              | what you get                                                                                  |
| --------------------- | ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| **Claude Desktop**    | install the extension — one `.mcpb` file                         | sponsored on testnet, you sign nothing. `arp_pulse` reads results you pass it and runs no search |
| **Claude Code**       | `claude plugin marketplace add intuition-box/ARP`, then `claude plugin install arp@arp` | the read tools, once `@arp-protocol/cli` is on npm: the plugin starts its server with `npx` |
| Cursor, Gemini, Codex | `arp init` detects your runtime and wires it up                  | the full tool set: a line with a domain and a result comes back as calls you sign             |
| sponsored setup       | `arp init --sponsored`                                           | the same as Claude Desktop                                                                    |
| nothing installed     | point your agent at [`skills/arp/SKILL.md`](skills/arp/SKILL.md) | the procedure, as public reads and calls you sign                                             |

Checking a tool or an agent needs nothing at all: no wallet, no account.

## Built on

**ERC-8004** for agent identity · **Intuition** for the public graph · **MCP** for any runtime.

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
