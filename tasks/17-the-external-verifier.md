# Task 17 — The external verifier

> **Status: GATE RUN 2026-10-27, PASSED** (specified 2026-10-16, built 2026-10-16/17).
> Phase 1 of `docs/13_THE_THREE_FLOWS.md`. The only flow that needs nobody's consent.
>
> **Shipped**: `packages/protocol/src/verify/{declaration,probe,host-limiter,subject}.ts`, exported from the
> connector, **39 tests** — 15 in `verify-declaration.test.ts`, 24 in `verify-probe.test.ts`. (This
> said 41 and `STATE.md` said 48; neither was ever right. Count them:
> `grep -c '    it(' packages/protocol/test/verify-{declaration,probe}.test.ts`.) `scripts/verify-cohort.ts` walks a range or a list and writes a JSON surface.
> Verified live against six real documents and five MCP endpoints.
>
> **Gate run 2026-10-27 — passed, and the result is not what the gate expected.** Two walks of 100
> agents each on Base 8453, both committed under `measurements/`, both readable with
> `bun run scripts/measure/verifier-gate.ts <file>`:
>
> | walk                          | n   | document read | endpoints | confirmed | not-checkable           | inconclusive        |
> | ----------------------------- | --- | ------------- | --------- | --------- | ----------------------- | ------------------- |
> | uniform over 1,138,325 minted | 100 | 96            | 186       | 178       | 8 `templated`           | 0                   |
> | ids 1–100 (the oldest)        | 100 | 99            | 107       | 99        | 7 `non-http-identifier` | 1 `transport-error` |
>
> Every confirmed row reproduces with one `curl`, printed by the report script. One was re-run by
> hand: agent 497755's A2A card, HTTP 200.
>
> On the uniform walk **93 endpoints named a protocol**, 4 of them templated and so unprobeable;
> of the **89 probed, 89 serve what they named**. The middle term matters: "89 of 89" without it
> reads as "every endpoint that named a protocol", which is not what was measured.
>
> **The finding is the concentration, not the rates.** 89 of the 100 uniformly sampled agents are
> `centralcity.ai` (Wilson 95%: 81.4–93.7%) and **178 of 178 probed endpoints are on that one host**.
> At the other end, 98 of ids 1–100 are `marketplace.olas.network` (93.0–99.4%). So "89 of 89 named
> a protocol and serve it" is a fact about one operator's deployment, and "0 of 0 named a protocol"
> is a fact about another's. Neither is a property of ERC-8004 on Base.
>
> A uniform sample of this registry is a sample of whoever minted most of it. The report script
> prints the host breakdown under every rate and says so in a sentence, because the rate alone is
> the exact shape of `rules/claims.md` §2 — one number read against the wrong population.
>
> **Every percentage further down this file is from the 2026-10-16 sample and none of them
> survived.** 23% with no `tokenURI` is 3% here; 37% unresolvable is 1%; "82% of declared endpoints
> land in group 2" is 4%. They are not corrections of each other — they are two different operators'
> conventions, measured eleven days apart on a registry that grew from 88,243 to 1,138,325. Read
> each against its own date, and read neither as the cohort.
>
> **One courtesy defect, found by the verifier and fixed**: `a2aCandidates` appended the two
> well-known card paths to the declared URL even when the declared URL was already a card, so this
> walk cost three requests per A2A endpoint where one would do — 178 of them against a single host,
> against the task's own hard rule of one request per endpoint per run. Every one of the 89 won on
> the third candidate, so the results above are unaffected. The walk decomposes exactly:
> `551 = 100 eth_call + 95 document GET + 89×3 A2A + 89×1 plain`. The same walk now costs **373**.
>
> **Remaining**: `task-verifier`, post-mortem, `STATE.md`.

## Objective

Walk the ERC-8004 cohort, read what each agent published about itself, and record whether the
published identity holds up: does the registration file resolve, does it declare a reachable service,
and when it names a protocol, does that service speak it.

No adoption. No signing. No cooperation from the agent being checked. Everything here reads documents
agents chose to publish at addresses they chose to publish them at.

## Why first

Every earlier plan stalled on an empty graph. One measurement, with the script that produces it:
`scripts/measure/predicate-edges.ts` on mainnet 1155, 2026-10-27 — **158 edges on `use`, 185 on
`uses`, 120 on `has category`** — against a Base registry at **1,138,325** minted the same day.

(The "194 `use` triples" this paragraph used to open with comes from `docs/09:35` and **does not
reproduce**; the other two figures of its trio do. Intuition has no deletion, so it is a different
query and not a graph that shrank. Correcting the six places that quote it is `tasks/28`.)

Filling that graph needed somebody to adopt something. This does not. It is also the only signal that **moves on its
own**, which is what makes a rating dynamic rather than a snapshot, and what gives a market
something to price.

## What the cohort actually looks like

Measured 2026-10-16, **n = 140 uniformly random token ids** on Base registry
`0x8004A169FB4a3325136EB29fA0ceB6D2e539a432`. Reproduce with
`bun run scripts/measure/cohort-endpoints.ts 140`. Sampling error applies — quote n with any number.

| Layer                                                   | Result             |
| ------------------------------------------------------- | ------------------ |
| `tokenURI` reverts or is empty                          | 32 / 140 — **23%** |
| of the 108 with a URI, document does not fetch or parse | 40 — **37%**       |
| documents parsed                                        | 68                 |
| of those, declaring no endpoint at all                  | 22 — **32%**       |
| declared endpoints found                                | 90                 |

**Two spellings coexist** and the common one is not the one the spec examples use:
`services: [...]` (106 of 108 occurrences in a separate 150-id sample) and `endpoints: [...]` (2).
A verifier reading only `endpoints` sees almost nothing — this was a real bug while measuring, and
it is the first thing to get right.

Of the 90 declared endpoints:

| Class                                                       | Count    | Is it a defect?      |
| ----------------------------------------------------------- | -------- | -------------------- |
| unsubstituted `{placeholder}` in the URL, e.g. `{agentId}`  | 68 — 76% | **No.** Unprobeable. |
| non-HTTP identifier — `eip155:8453:0x…`, `…base.eth`, empty | 6 — 7%   | **No.** Unprobeable. |
| probeable, answered < 500                                   | 14       | —                    |
| probeable, dead / 5xx / timeout                             | 2        | Yes                  |

So **only 16 of 90 declared endpoints were probeable at all.** That is the headline, and it bounds
what this task can claim. The document layer is where the volume is: a registration file that does not
resolve is a fact about 37% of agents that have a `tokenURI`, and it costs one GET to establish.

## The verifier recovers capability data, not just liveness

Found 2026-10-16 by completing the handshake on the three confirmed MCP servers:

| agent      | server                | negotiated | tools                                                                                  |
| ---------- | --------------------- | ---------- | -------------------------------------------------------------------------------------- |
| 8453:51722 | GM Chain Orchestrator | 2024-11-05 | `get_race_status`, `start_race`, `get_leaderboard`, `optimize_speed`, `get_track_info` |
| 8453:51097 | Surf AI               | 2025-06-18 | `get_protocol_stats`, `get_protocol_info`, `get_vault_metadata`                        |
| 8453:26183 | NebulaScan            | 2024-11-05 | `bridge_monitor`, `peg_checker`, `exploit_scanner`, `relay_health`, `flow_analytics`   |

**None of those three declares a capability in its registration file**, and neither did any of the
112 documents in the sample. Yet `tools/list` returns the real list. So the runtime is where the
capability data lives, and asking for it is one extra request.

That is a stronger result than this task was specced for. "Does it serve what it declared" barely
applies when almost nothing is declared; **"what does it actually serve"** applies to every callable
agent, and it is what makes the output usable for choosing who to hire.

Two details worth keeping:

- The version recorded is the one the server **negotiated**, not the one requested. gmchain and
  nebula-scan both answer `2024-11-05` to a `2025-06-18` request — correct MCP behaviour, and the
  server's answer is the fact.
- `listTools` is **off by default**. One request per endpoint is the courtesy baseline; the follow-up
  is opt-in, and a failed follow-up never downgrades a confirmed handshake.

Where a name declares a protocol, the check is sharp. Of 4 endpoints named `mcp`: 2 speak MCP
(`gmchain.vercel.app/api/mcp`, `api.helixa.xyz/api/mcp` both answer `initialize` with a `result`),
2 do not — one returns `{"status":"error","code":404,"message":"Application not found"}`, one is dead.
Separately, agent 8453:2340 (Clawnch) declares six MCP tools and a standard client gets
`{"error":"Missing sessionId query parameter"}` and zero tools.

## The three groups, and why the distinction is the whole task

1. **Confirmed fact** — the document 404s; the endpoint times out; the endpoint answers and speaks
   the protocol it declared.
2. **Unprobeable** — templated URL, CAIP or ENS identifier, no endpoint declared. The agent did
   nothing wrong. Report _not checkable_, never _failing_. 82% of declared endpoints landed here in
   the 2026-10-16 sample, 4% on 2026-10-27 — the share follows whoever minted most recently, and
   getting this wrong would mean mass-slandering the cohort at either share.
3. **We might be wrong** — the endpoint answered something we did not understand; our MCP handshake
   may be the thing at fault. Report _inconclusive_, and say what we sent.

> **Reporting a false defect is this task's version of a false `mismatch`.** The connector's rule
> applies unchanged (ADR 0019, and the `confirmedProviderIds` trade in `packages/protocol/`): when unsure, say
> unverified, never accuse. Group 2 must never be rendered in the same visual register as group 1.

## Deliverables

- `packages/protocol/src/verify/` — pure classification. Given a registration document, return the endpoint
  list across both spellings and each endpoint's class. No network in this module; it is a function
  of the document, and therefore unit-testable without fixtures of the whole internet.
- A prober that performs the network part, with the courtesy rules below, and returns group 1/2/3
  per endpoint plus what it sent.
- `scripts/verify-cohort.ts` — walks a range or a list, writes results to a local JSON surface.
- Tests: the two spellings, every class in the table, and at least one fixture per group-3 shape.
  Fixtures are recorded live responses, with the date and id they came from.

## Courtesy, which is a hard requirement

Probing third-party endpoints is load somebody else pays for.

- Identify the client in `User-Agent`, with a URL a recipient can read.
- One request per endpoint per run. No retries in the first version.
- 8 s timeout. Cache by document hash so an unchanged document is not re-probed.
- Rate-limit per host, not globally — Termix alone accounts for 38 of 108 endpoints in the sample, so
  a global limit still hammers one host.
- Honour `robots.txt`-equivalent signals where they exist, and stop on `429` for that host.

## Where results live

**Off-graph**, in a published JSON surface like the trust-assessment resolver. Not as triples.
Liveness changes hourly, `docs/07` names mutable data as triples as an anti-pattern, and ADR 0020
already priced blanket on-chain coverage at ~14,300 TRUST. Writing a probe result on-chain is
unaffordable and wrong.

What may eventually reach the graph is a **durable** conclusion drawn from many probes over time —
not a probe.

## Out of scope

- Writing anything on-chain. This task spends no TRUST.
- Scoring. It produces facts; composing them into a number is a later decision.
- Fixing anyone's registration file, or contacting operators.
- The MCP server and the hire path — tasks 16 and beyond.

## Gate

Liveness and endpoint classification for 100 agents, reproducible from a committed script, with
group 2 and group 3 visibly separated from group 1 in the output. A reviewer must be able to pick any
`confirmed` row and reproduce it with one `curl`.

## Which tier of the evidence ladder does this serve?

**It hardens tier 1; it does not reach tier 2, and should not claim to.** `docs/09` §3 defines
tier 2 as _Rated_ — "someone scored this agent 67.25", costing nothing — and the verifier produces
no score. What it does is make a tier-1 assertion **falsifiable**: the claim still costs one gas fee
to make, but it now costs an upkeep to sustain, because anyone can check it at any time without the
agent's cooperation.

The ladder has no rung for a checked assertion, and that absence is the point: ARP's position is
tiers 3 and 4, and this is their **precondition**. Nobody stakes capital on an agent nobody can
check, so a cohort of unfalsifiable assertions has no market in it to open.
