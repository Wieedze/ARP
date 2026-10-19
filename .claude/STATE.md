# Project state

**Updated** 2026-10-19 (task 23's page built, ADR 0042). Hand-maintained — a task does not close without updating this file
(`workflow.md`, task-close protocol).

Read this after `CLAUDE.md` and before anything else. It replaces reading every ADR in
`.claude/choices/` and every post-mortem in `.claude/learning/` to find out where the project is.
(It said "31 ADRs and 14 post-mortems" while the truth was 37 and 16 — the same hand-maintained
count that was wrong four times about commits, three lines further down. Counts of files in a
growing directory do not belong in prose; `.claude/choices/INDEX.md` is generated.)

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

**Branch** `feat/agent-panel-tabs`, pushed up to `c23effb`.

**The layout changed on 2026-10-19 (ADR `0041`), at the user's request** — _"ça devient le bordel,
et le but c'est d'avoir un projet clair et maintenable et auditable"_. `erc8004/` →
`packages/protocol/` (`@arp-protocol/core`), and `sdk/` folded into `packages/protocol/src/arp/` and
deleted. Two read-only client packages with no written boundary was the thing nobody could navigate;
`arp/` is the boundary — everything under it reads **ARP's own** deployment. Anything written before
that date cites the old paths, and ADR `0041` carries the mapping. `scripts/` was **not** split:
211 citation sites, 133 of them in append-only record.

**The commit counts used to live here and have been deleted.** They were wrong four times — by 17,
then by asserting "pushed" and "ahead of origin/main" together, then 47/15 against 60/12, then 60/12
against 61/13 because the correcting commit counted itself. A hand-maintained count of commits
ahead, written inside the commit that changes it, is stale the moment it is written; a fifth value
would be wrong for the same structural reason. Read them instead:

```
git rev-list --count main..HEAD
git rev-list --count origin/feat/agent-panel-tabs..HEAD
```

The remote SHA above is stable between pushes, so it stays.

**Tests**: connector **292 passed / 4 skipped** · app **231 passed / 2 skipped**. `tsc` 0, `lint` 0.
Task 16 added **44** of those — 29 planner, 7 delegated, 8 at the MCP wire. Re-read them rather than
trusting this line: `cd packages/protocol && bun run test`.

(It said 282 and 34. 282 was `248 + 34` — arithmetic off a wrong addend, written here while the same
commit's own message stated the measured 292. And the command it told you to re-run with pointed at
`erc8004/`, which that commit deleted. A line whose whole purpose is "do not trust this number" is
the worst place in the file to get wrong twice.)

**What those gates do NOT cover** (`claims.md` check 4): `scripts/arp-mcp-server.ts`,
`scripts/verify-cohort.ts`, `scripts/agent-declare-used.ts` and
`scripts/measure-stake-vault-placement.ts` are inside **no typecheck and no lint** — there is no root
`tsconfig.json` and no root eslint config. Task 16 added two of those four, so the gap `tasks/21`
owns got wider rather than narrower. `scripts/arp-mcp-tools.ts` and
`scripts/rig-registration-files.ts` _are_ inside the connector's typecheck, incidentally, because its
tests import them — a partial closure nobody designed.

The write path itself is inside every gate, because it lives in `packages/protocol/src/declare/` and not in
`scripts/` (`portability.md` rule 1). That is what the rule is for.

**Blocked on one thing:** no GitHub credential is reachable from the agent session. `git push` fails
with `could not read Username`; `gh` is not logged in; the user's own credentials sit in
`/home/max/.config/gh` but `HOME=/root`, and pointing `gh` at them was refused by the security
classifier. The user pushes and opens the PR themselves. Draft body is at
`.github/pull_request_drafts/08-agent-panel-tabs-and-the-three-flows.md` — **it predates the ADR 0030
and task 20 commits and does not describe them.**

## Tasks

| #      | task                                              | state                                                                                                                                                                                                                   |
| ------ | ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 01–03b | setup, contract, deploy, enforcers, smart account | done                                                                                                                                                                                                                    |
| 04     | UI core                                           | **no status line** — code exists, fiche never marked                                                                                                                                                                    |
| 04b    | agent identity and compose                        | done                                                                                                                                                                                                                    |
| 04c    | agent autonomous positioning                      | **set aside** — hackathon surface, ADR `0033`                                                                                                                                                                           |
| 05     | UI polish and deploy                              | **no status line**                                                                                                                                                                                                      |
| 06–08  | pin writes, connector, trust panel                | done                                                                                                                                                                                                                    |
| 09     | follow-ups from global review                     | open                                                                                                                                                                                                                    |
| 10–12  | directory, import, panel tabs                     | done                                                                                                                                                                                                                    |
| 13     | a rule the repo cannot satisfy                    | open — `code.md:86` requires React Testing Library; the repo has none. **Same gap as `tasks/26`**, which carries the evidence: eight defects on one page                                                                |
| 14     | contrast below AA                                 | open — `--color-fg-40` at 3.66:1                                                                                                                                                                                        |
| 15     | strip the panel copy                              | done, verified                                                                                                                                                                                                          |
| 16     | the connector an agent declares through           | **half 1 complete** (`a714f25`, verifier PASS round 4) — `packages/protocol/src/declare/`, 2 MCP tools, 44 tests. Prepares calls, never signs (ADR `0038`); stake on the edge (ADR `0039`). Half 2 → `tasks/25`         |
| 17     | the external verifier                             | **built**, 48 tests; gate not yet run at 100 agents                                                                                                                                                                     |
| 18     | `strict` is off in the app                        | done, verified (`6b351ee`) — cost was indeed zero errors                                                                                                                                                                |
| 19     | the `use` edge and its witness                    | step 1 done. **Step 1b is blocking** — the `same as` join does not exist (`scripts/measure-caip10-join.ts`: zero edges). 1b also **owns task 24's deferred step 3**                                                     |
| 20     | a tool renders as a protocol                      | done, verified                                                                                                                                                                                                          |
| 21     | `scripts/` is outside every gate                  | open — **not** zero-cost, unlike 18; owns the gap 18 did not reach                                                                                                                                                      |
| 22     | the chain as witness                              | open — user proposal; strongest evidence class, bounded by how much tool use is on-chain. **Measure first**                                                                                                             |
| 23     | the tool surface                                  | **page built**, `ui-reviewer` PASS round 2 — `/tool/atom/:atomId`, the ladder rendered at two weights with the other three rungs named. ADR `0042`: a vault's assets are not evidence of a stake, its position count is |
| 24     | make the testnet rig faithful                     | **complete** (`5787660`, verifier PASS). Agents 3,4,5 exist and the two-step gate passes; step 3 (identity resolution) **deferred** to task 19 step 1b, so Phase 0 is not closed                                        |
| 25     | hire an agent, and rate it afterwards             | open — split out of 16 on 2026-10-19. Depends on `tasks/23`: a candidate list is unjudgeable without a tool page                                                                                                        |
| 26     | the app has no DOM test environment               | open — the evidence for `tasks/13`'s rule, not a second gap. **Eight defects** across three review rounds on one page, three live on mainnet data; two were closed by moving pure functions into the service            |

**Recommended order** — `docs/15_ROADMAP.md` is the full version with what testnet can and cannot
prove. Short form: 24 and 16's half 1 are done; next is **23 → 17 → 25**, then the two mainnet gaps.
`tasks/23` moves ahead of 25 because `hire` returns a candidate list nobody can judge without a page
that shows a tool with its weight.

Everything runs on **testnet 13579 for now** — the rig is already deployed there and nothing needs
simulating. What testnet will never prove is **one** thing, not two, and that is a correction:
`DomainScopeEnforcer` has no mainnet mechanism (it gates `ModuleRegistry.registerModule`, which ADR
`0025` keeps off mainnet). The second one — "the triple fee sits outside `TrustStakeCapEnforcer`" —
**was false in five places including a rule file**, and ADR `0040` corrects it: the enforcer caps
native `value`, so a fee counts against it. The true, narrower limitation is that **the cap bounds
the amount and not the kind**, so a cap can be burned on fees instead of invested in positions. And
costs are **100× apart** — 0.001000000002 TRUST per triple on testnet against 0.100000000002 on
mainnet — so no budget tuned on testnet transfers.

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

| what                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | where                   | severity                                                                                                                                                                                                                                                                                                           |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `scripts/` is outside **every** gate — `tsc -b` covers only `app/src`, no eslint config at the repo root, `bun build` skips unused locals                                                                                                                                                                                                                                                                                                                                                                                                                                                              | **task 21**             | live: `scripts/seed.ts:34` imports `decodeEventLog` and never uses it, plus five implicit `any`s. Not zero-cost to close — two ad-hoc configs disagreed (6 vs 24), so measure with a committed one                                                                                                                 |
| `app/vitest.config.ts` is in neither tsconfig project                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | task 21                 | measured at zero errors to add; same shape as task 18, missed by it                                                                                                                                                                                                                                                |
| `bun run format:check` fails repo-wide, long-standing. **No count here on purpose** — run `bunx prettier --check .`. The figure was written as 214, measured 140 a few hours later, and the 214 came from a transient `git stash` state of my own making rather than from the repo. A count of unformatted files is exactly the kind of number that rots between the measurement and the sentence. `.claude/choices/INDEX.md` is among them and is **generated**, so `build-claude-index.ts` re-dirties it on every run; it belongs in `.prettierignore` or the generator should emit formatted output | task 21                 | a gate that always fails is not a gate; citing it green would be a `claims.md` check-4 error                                                                                                                                                                                                                       |
| the rig's testnet writes are permanent — 3 mints plus 1 `setAgentURI`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | ADR `0037`              | a wrong fixture costs an id; one was wrong when minted and corrected in place. Document hashes in `deployments/13579.json` make repo-vs-chain drift detectable                                                                                                                                                     |
| `verify-cohort.ts` builds a document-hash map, logs it, and **never reads it**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | task 21                 | its header claimed caching that does not happen; the claim is corrected, the map is not wired. A Base run was observed loading a testnet file before the out path was keyed by target                                                                                                                              |
| `ensureAtomForURI` mints an atom for any `ipfs://` string without validating it is a CID; 18 permanent atoms with fabricated CIDs exist on testnet                                                                                                                                                                                                                                                                                                                                                                                                                                                     | task 20 appendix        | unrecoverable per occurrence                                                                                                                                                                                                                                                                                       |
| the protocol package has **one `as any`** — `src/arp/modules.ts:201`, with an eslint-disable                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | `tasks/09`              | arrived with the ADR `0041` fold; pre-existing in `sdk/` since `c461677`. `code.md` forbids it and the package had none before, so do not assume the package is clean of it. Not fixed in the fold, because that is a behaviour change in moved code                                                               |
| `packages/protocol/src/tool-usage.ts` scopes its per-vault fields to a **hardcoded curve 1** while the writer reads `defaultCurveId` from the chain                                                                                                                                                                                                                                                                                                                                                                                                                                                    | `tasks/23`              | **not live** — both resolve to 1 on both chains today, so no deposit is invisible. But 89% of mainnet `uses`-edge TRUST sits on curve 2, which those fields exclude while the term-level totals include it, so one `MarketSide` can mix two populations (`claims.md` check 2 inside the data model)                |
| A declare-only run creates an edge **with no position on it** — `getTripleCost()` leaves a zero remainder, so the declarer backs nothing and `getToolUsage({attestedBy})` discards the edge                                                                                                                                                                                                                                                                                                                                                                                                            | `tasks/16` / `tasks/25` | a design consequence, not a bug: declaring and staking are separate by spec. Costs 0.1 TRUST of non-recoverable fee for an edge that reads as unbacked until a stake follows. `assets = tripleCost + minDeposit` would make the declaration self-attesting in one transaction — a product decision nobody has made |
| `scripts/agent-stake-on-use.ts` deposits on the tool's **atom** while `getToolUsage` prices the **triple**, so its stake is invisible to ARP's own reader                                                                                                                                                                                                                                                                                                                                                                                                                                              | ADR `0039`              | **latent, not live** — its only callers are `agent-server.ts` and `agent-server-specialist.ts`, both set-aside hackathon surface (ADR `0033`). Not fixed: it is historical record. Do not copy it — `packages/protocol/src/declare/` is the pattern. Mainnet, 2026-10-19: 74 of 185 `uses` edges are in that state |
| `--color-fg-40` at 3.66:1, below AA                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | task 14                 | accessibility                                                                                                                                                                                                                                                                                                      |
| `code.md:86` requires a test framework the repo does not have                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | task 13                 | an unsatisfiable rule                                                                                                                                                                                                                                                                                              |
| 21 triples stranded on a predicate ARP minted and abandoned                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | ADR 0030                | testnet only, 2.1e-11 tTRUST; **not migrable**, Intuition has no deletion                                                                                                                                                                                                                                          |
| `identity-registry.ts` declares `totalAgents()`, which reverts on the canonical registry                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | unrecorded              | needs a task                                                                                                                                                                                                                                                                                                       |

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
- **0038** — the write path is a **plan**, not a transaction. The connector returns unsigned calls
  and holds no key, so ADR `0035`'s "ARP is not a party" is structural rather than promised.
- **0039** — the deposit goes on the **edge**, not the tool's atom. The edge is the claim, it has a
  counter-vault, and it is the vault `getToolUsage` prices.
- **0040** — `TrustStakeCapEnforcer` is a **native-spend** cap. It bounds the amount, not the kind,
  so a cap can be burned on non-recoverable fees. Corrects a claim five files asserted.
- **0041** — one protocol package, `packages/protocol` (`@arp-protocol/core`), with `sdk/` folded
  into `src/arp/`. Read it before following any path written before 2026-10-19.
- **0042** — **a vault's assets are not evidence of a stake; its position count is.** Creating a
  term seeds its vaults with `minShare`, so `totalAssets > 0` means "this term exists". Three "has
  stake?" checks were wrong, including the MCP server's `staked` flag, which answered `true` for
  every edge. Read it before writing any check of the form `assets > 0`.

## Hard constraints

- **Mainnet signing: one canonical statement, in `.claude/rules/security.md`.** Do not read it from
  here. In short — ARP's own funds are never signed for automatically, while an _agent operator's_
  funds under a delegation they signed are the product (ADR `0036`), and an agent session may sign
  on **testnet 13579** with their key when asked (ADR `0037`). This line used to restate the rule
  without its qualifier, which forbade `docs/12` points 3 and 5.
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
scripts/measure-stake-vault-placement.ts   whether a stake sits on the edge or the object atom
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
