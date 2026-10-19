# Project state

**Updated** 2026-10-17 (ADR 0033 — hackathon surface set aside). Hand-maintained — a task does not close without updating this file
(`workflow.md`, task-close protocol).

Read this after `CLAUDE.md` and before anything else. It replaces reading 31 ADRs and 14
post-mortems to find out where the project is.

---

## What ARP is, in one line

**A connector between the Intuition protocol and agents, to create a network of agent and tool
reputation.** (The user's own words, 2026-10-19, recorded in ADR `0036`.)

## What ARP is, in one paragraph

Anyone registers their agent as ERC-8004 through ARP, or imports an identity that already exists.
An agent is composed of modules that solve tasks. After it runs, it can stake TRUST on the modules it
used — which builds reputation for the **tool** and for the **agent** at once. A caveat enforcer is
the guard rail on what the agent may spend. Agents already registered under ERC-8004 are first-class,
not an afterthought.

That is `docs/12_THE_IDEA.md`, which is the only canonical statement. If anything below contradicts
it, `docs/12` wins and the thing below has drifted.

**The hackathon surface is set aside** (ADR `0033`, 2026-10-17). ARP's three demo agents, the Solidity
auditor, the agent servers and `/hire` are historical record — not a dependency, not maintained.
**An agent arriving through the connector brings or mints its own ERC-8004 identity; ARP mints nothing
on anyone's behalf.** The forward surface is the verifier, `getToolUsage`, the panel and the
directory.

## Where the work is right now

**Branch** `feat/agent-panel-tabs` — 47 commits ahead of `main`,
of which **15 are not pushed** (remote is at `4b205d3`).

Recount rather than trusting these two numbers — `git rev-list --count main..HEAD` and
`git rev-list --count origin/feat/agent-panel-tabs..HEAD`. This line has been wrong twice: once by
17 commits, and once asserting "pushed" and "ahead of origin/main" together, which cannot both hold.

**Tests**: connector 222 passed / 4 skipped · app 205 passed / 2 skipped. `tsc` 0, `lint` 0.

**Blocked on one thing:** no GitHub credential is reachable from the agent session. `git push` fails
with `could not read Username`; `gh` is not logged in; the user's own credentials sit in
`/home/max/.config/gh` but `HOME=/root`, and pointing `gh` at them was refused by the security
classifier. The user pushes and opens the PR themselves. Draft body is at
`.github/pull_request_drafts/08-agent-panel-tabs-and-the-three-flows.md` — **it predates the ADR 0030
and task 20 commits and does not describe them.**

## Tasks

| #      | task                                              | state                                                                                                       |
| ------ | ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| 01–03b | setup, contract, deploy, enforcers, smart account | done                                                                                                        |
| 04     | UI core                                           | **no status line** — code exists, fiche never marked                                                        |
| 04b    | agent identity and compose                        | done                                                                                                        |
| 04c    | agent autonomous positioning                      | **set aside** — hackathon surface, ADR `0033`                                                               |
| 05     | UI polish and deploy                              | **no status line**                                                                                          |
| 06–08  | pin writes, connector, trust panel                | done                                                                                                        |
| 09     | follow-ups from global review                     | open                                                                                                        |
| 10–12  | directory, import, panel tabs                     | done                                                                                                        |
| 13     | a rule the repo cannot satisfy                    | open — `code.md:86` requires React Testing Library; the repo has none                                       |
| 14     | contrast below AA                                 | open — `--color-fg-40` at 3.66:1                                                                            |
| 15     | strip the panel copy                              | done, verified                                                                                              |
| 16     | the connector an agent declares through           | open — **the whole gap** `docs/12` names; re-anchored on ADR `0035`                                         |
| 17     | the external verifier                             | **built**, 48 tests; gate not yet run at 100 agents                                                         |
| 18     | `strict` is off in the app                        | done, verified (`6b351ee`) — cost was indeed zero errors                                                    |
| 19     | the `use` edge and its witness                    | step 1 done; steps 2–5 **unblocked** by ADR `0033` — no minting needed                                      |
| 20     | a tool renders as a protocol                      | done, verified                                                                                              |
| 21     | `scripts/` is outside every gate                  | open — **not** zero-cost, unlike 18; owns the gap 18 did not reach                                          |
| 22     | the chain as witness                              | open — user proposal; strongest evidence class, bounded by how much tool use is on-chain. **Measure first** |
| 23     | the tool surface                                  | step 1 **done** (`getToolUsage`, 9 tests, live-verified); the page remains                                  |

**Recommended order**, re-anchored 2026-10-19 on ADR `0035`: **16 → 23 (the tool page) → 19 steps
2–5**, with 17 finished alongside since it is what tells you which tools exist.

Task 16 moved to the front because it is the loop itself — an operator signs one delegation, the
agent declares and deposits, the tool gains reputation. `docs/12` calls it "the whole gap". Nothing
else on this list produces a single new edge.

**Two mistakes made and corrected, worth not repeating:** staking on whether an endpoint answers is
ARP producing one more score, which `docs/01` rejects — the verifier is for discovery, never for the
stake. And ARP's author is **not a party** to the loop: they build the rail, the agent's operator
signs the delegation (ADR `0035`).

Task 17 does **not** give tools reputation — it gives agents a checkable record. It serves the goal
indirectly and genuinely: because in ERC-8004 plus MCP the tool _is_ an agent, the verifier's output
is the list of tools that actually work, on the order of a thousand of 88,243. Without it you do not
know what to rate. But the mechanism that rates them is the `uses` edge, and that is task 19.

**The half of `docs/12` that does not exist: nothing in the UI shows a tool with its weight.** Now `tasks/23`. The panel
shows agents and their trust providers. There is no "this tool was used by these agents, who staked
this much on it" surface, which is the thing `docs/12` describes and the only reason the edges are
worth writing.

Tasks 13, 14, 21 and 22 are open. The earlier note that 13 and 14 would be "cleared alongside 18"
did not happen.

## The plan, in three phases

`docs/13_THE_THREE_FLOWS.md`, with the mechanism in `docs/14_THE_WITNESS_PROBLEM.md`.

1. **The verifier** (task 17) — read what agents publish, probe it, classify. Needs nobody's consent,
   runs on all 88,243 today, and is the only signal that moves on its own.
2. **Hire** (task 16) — hire an agent that never signed anything; the delegation caps the buyer's own
   spend, so the seller needs no relationship with ARP.
3. **The MCP server** — last, because it is the only flow that depends on someone else adopting.

**The load-bearing conclusion**, and the one to re-read before any design step: _you cannot observe a
runtime, and a connector inside the agent's process is under the agent's control._ An SDK moves the
lie one layer in. What is a fact is only what touched a third party — a payment, an on-chain call, a
delegation redemption — or what the **counterparty** attests. Do not ask the agent what it used; ask
the tool who used it.

## Known defects, not yet fixed

| what                                                                                                                                               | where            | severity                                                                                                                                                                                           |
| -------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `scripts/` is outside **every** gate — `tsc -b` covers only `app/src`, no eslint config at the repo root, `bun build` skips unused locals          | **task 21**      | live: `scripts/seed.ts:34` imports `decodeEventLog` and never uses it, plus five implicit `any`s. Not zero-cost to close — two ad-hoc configs disagreed (6 vs 24), so measure with a committed one |
| `app/vitest.config.ts` is in neither tsconfig project                                                                                              | task 21          | measured at zero errors to add; same shape as task 18, missed by it                                                                                                                                |
| `bun run format:check` fails on 190 files, long-standing                                                                                           | task 21          | a gate that always fails is not a gate; citing it green would be a `claims.md` check-4 error                                                                                                       |
| `ensureAtomForURI` mints an atom for any `ipfs://` string without validating it is a CID; 18 permanent atoms with fabricated CIDs exist on testnet | task 20 appendix | unrecoverable per occurrence                                                                                                                                                                       |
| `--color-fg-40` at 3.66:1, below AA                                                                                                                | task 14          | accessibility                                                                                                                                                                                      |
| `code.md:86` requires a test framework the repo does not have                                                                                      | task 13          | an unsatisfiable rule                                                                                                                                                                              |
| 21 triples stranded on a predicate ARP minted and abandoned                                                                                        | ADR 0030         | testnet only, 2.1e-11 tTRUST; **not migrable**, Intuition has no deletion                                                                                                                          |
| `identity-registry.ts` declares `totalAgents()`, which reverts on the canonical registry                                                           | unrecorded       | needs a task                                                                                                                                                                                       |

## Decisions that govern everything

Full list in `.claude/choices/INDEX.md` (generated). The ones to know before touching anything:

- **0015** — adopt Intuition's canonical ERC-8004 pattern; term ids are **frozen**, never resolved by
  label. **Still `Proposed` while the whole project depends on it.**
- **0017** — ARP may deposit real TRUST into existing `has trust provider` vaults on chain 1155.
  Seven safeguards are acceptance criteria, not advice.
- **0025** — no `ModuleRegistry` on mainnet. `docs/14` later found the better reason: in ERC-8004 plus
  MCP the tool layer and the agent layer are the same layer, so there is no namespace to invent.
- **0027** — ARP mints into the canonical registry, never its own.
- **0030** — the `use` edge is chosen on **meaning**, not publication. `use` means "supports this
  protocol"; `uses` means "uses this tool". ARP writes `uses` `0x5c0bde1c…`.
- **0031** — a claim carries its bounds. See below.

## Hard constraints

- **No agent, script or automated process may sign a mainnet transaction.** Verification is unit
  tests over a mocked wallet client, `previewDeposit` reads, and `eth_call` simulation. A passing
  suite is not a reason to spend real TRUST. (`security.md`)
- Mainnet **deployment** needs explicit per-session confirmation. No ARP contract is on mainnet and
  none is planned.
- Never commit `.env`, keys or API keys. `INTUITION_PIN_API_KEY` must never carry a `VITE_` prefix —
  Vite inlines those into the client bundle.
- Default deployment target is Intuition Testnet.

## Reproduce any number in this repo

Every measured figure names its script. Run them; do not quote them from memory.

```
scripts/measure-cohort-endpoints.ts        what registration files declare, and what is probeable
scripts/measure-cohort-callable.ts         how many agents can act as a tool for another agent
scripts/measure-predicate-edges.ts         edge count per predicate the connector freezes
scripts/measure-predicate-objects.ts       what `use` vs `uses` edges actually assert
scripts/measure-predicate-reachability.ts  whether a defect is live or latent
scripts/build-claude-index.ts              regenerate the ADR and post-mortem indexes
scripts/verify-pin-key.ts                  validate the partner key, prove recipe determinism
```

## The failure mode this project has, and the rule for it

`.claude/rules/claims.md` and ADR 0031. On 2026-10-16 six statements were wrong while **every
underlying measurement was right** — two reviewers re-derived them and got identical values. The
break was always the step from a measurement to a sentence about it.

Before writing a number or a consequence:

1. **Reachability before blast radius.** A wrong branch nothing reaches is _latent_. Say which.
2. **One number, one context.** Name the chain, the date, the population. Never sum across chains.
3. **Cite third parties** to a file and a line, or do not write the claim.
4. **Confirm a gate's scope covers your change** before calling it green.

Quote the interval, not the point, when n is small.
