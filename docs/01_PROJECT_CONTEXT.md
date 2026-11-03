# 01 — Project Context

## One-liner

**Your agent finds the right skill, tool or agent for you, and shows which ones other agents
actually use.**

> Stars show who looked. ARP shows who used it.

The one-liner read "ARP makes money flow to the tools agents actually use" until 2026-11-03, when
the user replaced it (ADR `0126`): a deposit stays its depositor's position and a tool's author
receives nothing, so money does not flow to the tool; and the one measured result is discovery,
below. The kit still carries the old line.

|                  |                                                                        |
| ---------------- | ---------------------------------------------------------------------- |
| Vision           | Money follows usage.                                                   |
| Mission          | Keep an open record of what agents actually use, and whether it works. |
| What a user does | Search by need. See what answers, and who paid to stand behind it.     |

The category is **a reputation layer** and, said to someone outside crypto, **a public usage
record**. The table above comes from the presentation kit (`Wieedze/ARP-business-dev`,
`pitch/kit-de-presentation.md`); where a text about ARP contradicts it, the text is corrected. The
one-liner is the exception, and the kit is the text to correct there.

Identity is ERC-8004, the graph is Intuition, and the priced claim is ARP. It stores nothing: if a
thing is listed here it is because it already exists somewhere else, and what ARP adds is the market
(ADR `0051`).

### Why **layer** and not **registry**, since 2026-10-29

The lead was **"a registry that points at AI things"** until then. Every clause of it is still
true; it stopped leading for one measured reason.

A census dated 2026-10-02 counts **84,819 agent tools — 62,347 skills, 9,676 MCP servers, and
10,411 marketplaces** carrying 172M installs between them. There are more storefronts than there are
MCP servers. "Registry" is the most commoditised word in this market, and leading with it puts ARP
in a comparison it cannot win against incumbents with more money and an audience.

What none of those 10,411 has — checked against their own pages — is a **record of which listings
work and who stands behind them**. That gap is the lead now, and the two additions to the old line
say it:

- **"search by need"** — the index is keyed by what a tool is _for_, not by its name. npm returns
  25,501 rows for "payment", ranked on the string, `@types/payment` among the first.
- **"what answers"** — the one claim here a third party can reproduce for the price of one HTTP
  request, and therefore the only one ARP records as a fact rather than as a declaration
  (`docs/14`, `docs/19`).

The third clause is unchanged and is the oldest part of this project: **who paid to stand behind
it**. ERC-8004's own Reputation Registry holds **569,148 feedback entries on Base 8453 with a mean
score of 95.09 / 100** (`scripts/measure/erc8004-feedback.ts`, 2026-10-20). Free ratings converge on
excellent and stop distinguishing anything; a claim that cost something does not.

### Search by need, measured: the agent names a skill that exists

Added 2026-11-02, beside the three clauses above and replacing none of them. Asked "what can I
install so that you can do this yourself?", Claude with ARP named a skill or an MCP server that
exists in **40 of 42** answers (95% 84% to 99%); without ARP, in **6 of 42** (7% to 28%). Neither
arm invented one. Without ARP it mostly named libraries or SaaS products, or offered to build the
thing itself. `docs/tasks/52` §3; re-derive with
`bun run scripts/measure/discovery-eval.ts --summarise data/measurements/discovery-eval-install-2026-11-02-recheck.jsonl`.

What the same run does not support, and so what this argument may not say:

- **Not cheaper.** It costs 5.19× the tokens (4.23 to 6.23): the agent reads what it found before
  recommending it. Tasks 45c and 51 found no saving either.
- **Not better.** A blind judge preferred the answer without ARP in 26 of 42 pairs; it cannot install
  a skill or check that it works.
- **Only where the catalogue covers the need.** The 14 needs were chosen because it does.
- **Not better than skills.sh.** The run compares Claude with ARP to Claude alone, not to skills.sh.
  A Claude plugged into skills.sh would likely find as many, and on search alone skills.sh is better
  today; ARP reuses its descriptions and install counts (`data/catalogue/skill-facts.json`). What ARP
  adds is evidence of use, not search.

The unit is the **skill, not the repository** (ADR `0077`): ARP serves one skill with a signed
receipt, for 521 of the 662 skills on testnet 13579 (`docs/tasks/31`). **What is served depends on
where.** In Claude Code project mode (`arp init --sponsored`), it is the skill's whole directory,
scripts included, under one receipt over a manifest of every file (`docs/tasks/57`). In Claude
Desktop's Chat, which runs no script, it is the SKILL.md alone, so there a skill that needs its
scripts works only in part. Desktop walks the loop since `docs/tasks/50`: search, fetch, and a
sponsored declaration.

### Three words this positioning may never use

`best`, `score`, and `verified` about a usage. ARP composes no ranking of quality (ADR `0046`), and
the only thing it verifies is reachability. The discipline that follows is cheap: **there is no need
to say "this is not proof" if the word "proof" is never used.**

ADR `0075` carries the decision and what it trades away.

Calibration is out, not deferred (ADR `0049`): it is a score that needs ground truth.

## What ARP is

ARP (Agent Reputation Protocol) is a permissionless, modular reputation protocol for autonomous AI agents. It sits on top of ERC-8004 (the Ethereum agent identity standard) and uses Intuition's semantic graph as its ontology layer.

The core innovation is that **the input costs money**. An agent declares the tools it used and deposits TRUST on that declaration, under a cap its operator signed. Nothing here measures whether the agent was _right_ — reputation is what emerges when real value sits on a claim about composition, and writing that claim costs money that does not come back (ADR `0056`). A third party can contradict the claim at the same price, and almost nobody does: 1 of 185 `uses` edges on mainnet 1155, 2026-10-21 (`scripts/measure/counter-side-usage.ts`).

The case against free ratings is measured, not asserted: ERC-8004's Reputation Registry holds **569,148** feedback entries on Base 8453 with a **mean score of 95.09 / 100** (`scripts/measure/erc8004-feedback.ts`, 2026-10-20). Free ratings converge on excellent and stop distinguishing anything.

**An agent and a tool are the same shape** (ADR `0051`): both exist elsewhere, both get an atom pointing at them, and both carry a market on claims about them. One write path, not two.

## What ARP is not

- ARP is **not an identity namespace**. ERC-8004's Identity Registry handles that, and ARP mints into it rather than beside it (ADR `0027`). It _is_ a registry in the sense of pointing at things that exist elsewhere — and it registers nothing, stores nothing and delivers nothing (ADR `0051`).
- ARP is **not a directory competing on search**. skills.sh, Glama, Smithery and the official MCP
  registry list tools; ARP reuses their descriptions and install counts and adds what none of them
  has, a record of use. On search alone skills.sh is better today (above).
- ARP is **not a scoring platform at all** — not merely a non-proprietary one. ARP publishes no
  score, rating or assessment of any agent; it makes staking possible and reads the result. Every
  figure it surfaces is a deposit somebody else made, so ARP cannot be wrong about an agent — the
  market can. ADR `0046`.
- ARP is **not B2B first**. Its first users are people who use an agent — Claude users, agent builders, tool authors — and the agent itself, which reads ARP mid-task. Aggregators and publishers may become business customers later, through the data licence (ADRs `0112`, `0120`).
- ARP is **not where a reputation lives**. The reputation is **portable**: atoms, triples and
  positions on a public graph, plus an ERC-8004 identity. Nothing is in an ARP database, so an
  operator adopting ARP is not betting on ARP surviving — unplug it and the reputation is still there
  and still readable by anyone. ADR `0045` is the same property applied to requests rather than data.

## Where it stands

Everything runs on Intuition testnet 13579, and stays there until Intuition validates ARP. The
only declarations so far come from ARP's own agents. The plan to EthCC (April 2027) is gated on
agents ARP does not control: 10, then 100 (`ARP-business-dev`, `plan/next-steps.md`).
`.claude/STATE.md` holds the state of each piece.

## Strategic positioning

ARP executes a thesis that Intuition has already published (November 2025 Medium post): that the agent economy needs agent registries + agent reputation + agent coordination. Intuition wants to be the trust and coordination layer. ARP implements the reputation slot of that thesis concretely.

This positioning means ARP should never feel like a competing vision. It is an implementation of Intuition's stated direction, differentiated by one design choice: what sits on a claim is a priced deposit, not an opinion.

## Competitive landscape

The reputation layer for ERC-8004 agents is not empty. Known competitors:

- **8004scan** (AltLayer) — launched October 2025. Composes a 7-dimension score from free inputs. ARP scores nothing, so it can supply 8004scan the usage data rather than compete with its score.
- **Agentscan** (Alias) — agent economy search engine.
- **Agent Arena** — indexes 22,000+ agents across 16 chains, composite scoring, buyer reputation protocol.
- **Theagora** — per-function reputation, 4-tier cryptographic verification.

ARP's defensible differentiation:

1. **The input is priced, not free** — a deposit on a claim about use, bounded by a cap its operator signed. Every competitor above takes free input.
2. **Written in the capability vocabulary, not the trust vocabulary** — `uses`, `has tag`, `implement`. So ARP makes claims about **composition**, and reputation emerges when money sits on one. Trust providers write elsewhere in the graph, which is why they are not competitors on this surface (ADR `0048`).
3. **ARP holds nothing** — no key (ADR `0038`), no request path (ADR `0045`), no data. The reputation is positions on a public graph, so adopting ARP is not a bet on ARP surviving.
4. **The position is the measure, so what you read is live** — withdrawable, so it is what people hold now rather than what was ever put in (ADR `0046` §3, and ADR `0056`, which built the exit).

## Ecosystem references

- ERC-8004 spec: https://eips.ethereum.org/EIPS/eip-8004
- 8004scan: https://8004scan.io
- Intuition Medium "Agentic Swarms": https://medium.com/0xintuition/intuition-agentic-swarmserc-8004-x402-and-the-ai-sovereignty-alliance-28f7885406c0
- Awesome ERC-8004 resources: https://github.com/sudeepb02/awesome-erc8004
