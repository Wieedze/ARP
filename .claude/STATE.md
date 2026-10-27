# Project state

**Updated** 2026-10-21 (ADR `0056` — where the market on an agent lives). Hand-maintained — a task does not close without updating this file
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

**Branch** `feat/agent-panel-tabs`, pushed up to `fc541ec` (2026-10-20). Read the remote rather than this line: `git rev-parse origin/feat/agent-panel-tabs`.

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

**Tests**: connector **368 passed / 4 skipped** · app **327 passed / 2 skipped** · contracts **17
passed** (measured 2026-10-21, after ADR `0056` and its two review rounds). `tsc` 0, `lint` 0, `check:tokens` 0.

The app count went **down** from 276 at one point in the day, deliberately: `mainnet-routes.test.ts`
replaced nine tests over a hand-written route list with four that read the source. Fewer tests, one
more defect caught — the nine could not fail on the thing they existed to prevent.
Task 16 added **44** of those — 29 planner, 7 delegated, 8 at the MCP wire. Re-read them rather than
trusting this line: `cd packages/protocol && bun run test`.

(It said 282 and 34. 282 was `248 + 34` — arithmetic off a wrong addend, written here while the same
commit's own message stated the measured 292. And the command it told you to re-run with pointed at
`erc8004/`, which that commit deleted. A line whose whole purpose is "do not trust this number" is
the worst place in the file to get wrong twice.)

**What those gates do NOT cover** (`claims.md` check 4): `scripts/arp-mcp-server.ts`,
`scripts/verify-cohort.ts`, `scripts/agent-declare-used.ts` and
`scripts/measure/stake-vault-placement.ts` are inside **no typecheck and no lint** — there is no root
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

| #      | task                                                      | state                                                                                                                                                                                                                                                   |
| ------ | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 01–03b | setup, contract, deploy, enforcers, smart account         | done                                                                                                                                                                                                                                                    |
| 04     | UI core                                                   | **no status line** — code exists, fiche never marked                                                                                                                                                                                                    |
| 04b    | agent identity and compose                                | done                                                                                                                                                                                                                                                    |
| 04c    | agent autonomous positioning                              | done 2026-06-03 (`learning/07`, PASS), then **set aside** — ADR `0033`                                                                                                                                                                                  |
| 05     | UI polish and deploy                                      | **no status line**                                                                                                                                                                                                                                      |
| 06–08  | pin writes, connector, trust panel                        | done                                                                                                                                                                                                                                                    |
| 09     | follow-ups from global review                             | open                                                                                                                                                                                                                                                    |
| 10–12  | directory, import, panel tabs                             | done                                                                                                                                                                                                                                                    |
| 13     | a rule the repo cannot satisfy                            | open — `code.md:86` requires React Testing Library; the repo has none. **Same gap as `tasks/26`**, which carries the evidence: eight defects on one page                                                                                                |
| 14     | contrast below AA                                         | open — `--color-fg-40` at 3.66:1                                                                                                                                                                                                                        |
| 15     | strip the panel copy                                      | done, verified                                                                                                                                                                                                                                          |
| 16     | the connector an agent declares through                   | **half 1 complete** (`a714f25`, verifier PASS round 4) — `packages/protocol/src/declare/`, 2 MCP tools, 44 tests. Prepares calls, never signs (ADR `0038`); stake on the edge (ADR `0039`). Half 2 → `tasks/25`                                         |
| 17     | the external verifier                                     | **built**, 39 tests (15 declaration + 24 probe, measured — 48 was never right); gate not yet run at 100 agents                                                                                                                                          |
| 18     | `strict` is off in the app                                | done, verified (`6b351ee`) — cost was indeed zero errors                                                                                                                                                                                                |
| 19     | the `use` edge and its witness                            | step 1 done. **Step 1b is blocking** — the `same as` join does not exist (`scripts/measure/caip10-join.ts`: zero edges). 1b also **owns task 24's deferred step 3**                                                                                     |
| 20     | a tool renders as a protocol                              | done, verified                                                                                                                                                                                                                                          |
| 21     | `scripts/` is outside every gate                          | open — **not** zero-cost, unlike 18; owns the gap 18 did not reach                                                                                                                                                                                      |
| 22     | the chain as witness                                      | open — user proposal; strongest evidence class, bounded by how much tool use is on-chain. **Measure first**                                                                                                                                             |
| 23     | the tool surface                                          | **complete** (`7b6b2d5`, verifier PASS round 4, post-mortem `learning/18`) — `/tool/atom/:atomId`, the ladder rendered at two weights with the other three rungs named. ADR `0042`: a vault's assets are not evidence of a stake, its position count is |
| 24     | make the testnet rig faithful                             | **complete** (`5787660`, verifier PASS). Agents 3,4,5 exist and the two-step gate passes; step 3 (identity resolution) **deferred** to task 19 step 1b, so Phase 0 is not closed                                                                        |
| 25     | hire an agent, and rate it afterwards                     | **objective superseded — ADR `0060`.** `find` and `rate` shipped (`src/discover.ts`, `src/declare/rate.ts`); **`hire` and `pay` removed**, because a delegation names its delegate by address and an agent's runtime address is not on the graph — so a buyer can only hire an agent they already know, and closing that is a marketplace. ARP records a use, it does not broker one |
| 26     | the app has no DOM test environment                       | open — the evidence for `tasks/13`'s rule, not a second gap. **Eight defects** across three review rounds on one page, three live on mainnet data; two were closed by moving pure functions into the service                                            |
| 27     | a pass over the prose: slop, redundancy, over-explanation | open — recorded 2026-10-20 at the user's request, to run **after** the connector and the tools page. 43 ADRs, 18 post-mortems and 31 task files, almost all mine, and the user cannot tell which sentence is load-bearing                               |
| 28     | coherence audit — code, front, docs                       | **first batch done** 2026-10-20 (banner, import copy, `tool` wording, dead files, rule fixes; ADR `0044`). The rest is the punch list in the task file. Mint vs "mints nothing" is left to the user                                                     |

**Recommended order** — `docs/15_ROADMAP.md` is the full version with what testnet can and cannot
prove. Short form: 24, 16's half 1 and 23 are done; next is **17 → 25**, then the two mainnet gaps.
`tasks/25` was blocked on 23 existing, because `hire` returns a candidate list nobody can judge
without a page that shows a tool with its weight. That page exists now.

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
is the list of tools that actually work, on the order of a thousand of 300,000-plus. Without it you do not
know what to rate. But the mechanism that rates them is the `uses` edge, and that is task 19.

**Every atom has a page now** — `/atom/:atomId`, which replaced `/tool/atom/:atomId` on 2026-10-27.
The old page read `uses` edges only, so a tool had somewhere to go and a tag, a category or a
protocol did not; `getAtomStanding` does not presume the predicate, and `CapabilitySection` links
every object rather than only the tools. The graph is walkable in both directions from an agent.
The `uses`-scoped, tier-aware view (`docs/14`'s ladder) survives as `DeclaredUses`, which the agent
page renders as its own "who declared using it" section.

Tasks 13, 14, 21 and 22 are open. The earlier note that 13 and 14 would be "cleared alongside 18"
did not happen.

## The plan, in three phases

`docs/13_THE_THREE_FLOWS.md`, with the mechanism in `docs/14_THE_WITNESS_PROBLEM.md`.

1. **The verifier** (task 17) — read what agents publish, probe it, classify. Needs nobody's consent,
   runs on the whole registry today (next id 444,562 on 2026-10-21), and is the only
   signal that moves on its own.
2. **Hire** (task 25) — hire an agent that never signed anything; the delegation caps the buyer's own
   spend, so the seller needs no relationship with ARP. The old `/hire` demo is **deleted** (user,
   2026-10-20), along with `use-agents` and `use-agent-reputation`, which nothing else referenced.
3. **The MCP server** — last, because it is the only flow that depends on someone else adopting.

**The load-bearing conclusion**, and the one to re-read before any design step: _you cannot observe a
runtime, and a connector inside the agent's process is under the agent's control._ An SDK moves the
lie one layer in. What is a fact is only what touched a third party — a payment, an on-chain call, a
delegation redemption — or what the **counterparty** attests. Do not ask the agent what it used; ask
the tool who used it.

**And that rung now has a path, which it never had before** (ADR `0045`). Everything ARP writes today
sits on rung 4 of `docs/14:159` — an agent declaring alone, with a stake behind it. Rung 2 is _two
parties declaring the same edge_, and it needs something listening on the operator's side, which is
what the node is for. Two pairs, not equally strong: agent↔tool have genuinely opposing interests,
requester↔provider do not — both gain from the provider looking good, so the hire pair must never be
rendered as if it were the tool pair. The cheapest piece needs nobody's adoption: **an unmatched
one-sided claim is visible as one-sided**, which is one graph query. No hire predicate exists in
`terms.ts` yet, and ADR `0030` is what happens when one is chosen on publication instead of meaning.

## Asked for and not built

`FUTURE.md`. Four things, each with the decision that has to come before it: a profile page, ARP's own
skill and MCP registered as tools, a "How it works" tab, and one screen for register-and-declare. The
file exists so an ask does not get lost and does not get smuggled into an unrelated change.

## Known defects, not yet fixed

| what                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | where                                             | severity                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `scripts/` is outside **every** gate — `tsc -b` covers only `app/src`, no eslint config at the repo root, `bun build` skips unused locals                                                                                                                                                                                                                                                                                                                                                                                                                                                              | **task 21**                                       | live, and it has now cost a wrong number on a third-party surface: `arp_find_agents` read a field that does not exist (`market.totalAssets`) and `?? 0n`'d the `undefined`, reporting **0 TRUST for an agent carrying 13.02** until a live check caught it (2026-10-20, ADR `0047`). Also `scripts/seed.ts:34` imports `decodeEventLog` and never uses it, plus five implicit `any`s. Not zero-cost to close — two ad-hoc configs disagreed (6 vs 24), so measure with a committed one |
| `app/vitest.config.ts` is in neither tsconfig project                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | task 21                                           | measured at zero errors to add; same shape as task 18, missed by it                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `bun run format:check` fails repo-wide, long-standing. **No count here on purpose** — run `bunx prettier --check .`. The figure was written as 214, measured 140 a few hours later, and the 214 came from a transient `git stash` state of my own making rather than from the repo. A count of unformatted files is exactly the kind of number that rots between the measurement and the sentence. `.claude/choices/INDEX.md` is among them and is **generated**, so `build-claude-index.ts` re-dirties it on every run; it belongs in `.prettierignore` or the generator should emit formatted output | task 21                                           | a gate that always fails is not a gate; citing it green would be a `claims.md` check-4 error                                                                                                                                                                                                                                                                                                                                                                                           |
| the rig's testnet writes are permanent — 3 mints plus 1 `setAgentURI`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | ADR `0037`                                        | a wrong fixture costs an id; one was wrong when minted and corrected in place. Document hashes in `deployments/13579.json` make repo-vs-chain drift detectable                                                                                                                                                                                                                                                                                                                         |
| `verify-cohort.ts` builds a document-hash map, logs it, and **never reads it**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | task 21                                           | its header claimed caching that does not happen; the claim is corrected, the map is not wired. A Base run was observed loading a testnet file before the out path was keyed by target                                                                                                                                                                                                                                                                                                  |
| `ensureAtomForURI` mints an atom for any `ipfs://` string without validating it is a CID; 18 permanent atoms with fabricated CIDs exist on testnet                                                                                                                                                                                                                                                                                                                                                                                                                                                     | task 20 appendix                                  | unrecoverable per occurrence                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| the protocol package has **one `as any`** — `src/arp/modules.ts:201`, with an eslint-disable                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | `tasks/09`                                        | arrived with the ADR `0041` fold; pre-existing in `sdk/` since `c461677`. `code.md` forbids it and the package had none before, so do not assume the package is clean of it. Not fixed in the fold, because that is a behaviour change in moved code                                                                                                                                                                                                                                   |
| `packages/protocol/src/tool-usage.ts` scopes its per-vault fields to a **hardcoded curve 1** while its asset totals are all-curve                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | `tasks/23` records the deferral; the fix is small | **not live for correctness, but it cost three defects.** 89.33% of mainnet `uses`-edge TRUST is on curve 2 (`measure/stake-vault-placement.ts`), so an edge can hold capital and report zero positions — 1 of 185 does. The `off-curve` state papers over it and has produced one live sort defect, one live counts defect and one latent caption defect. `getToolUsage` already accepts `curveId`; the blocker is a design question, not a contract change                            |
| ~~A declare-only run creates an edge with no position on it~~ **CLOSED 2026-10-21, ADR `0053`.** The product decision was made: `assets = cost + minDeposit`, so every term is born with a position and the declaration is self-attesting in one transaction. Enforced by `previewAtomCreate`/`previewTripleCreate`, which are callable before the term exists and return `shares = 0` for a fee-only deposit. Four write paths carried the old behaviour and all four are fixed: the package planner, `scripts/plan-identity-atom.ts`, three sites in `app/src/services/intuition-graph.ts`, and `submitOperatorLink` in `app/src/services/agent-import.ts` — that last one on **mainnet 1155**, latent (zero `same as` edges onto a `caip10:` atom existed, so it had never run). Residue: **6 positionless atoms on testnet 13579**, unremovable | ADR `0053`                                        | closed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| The Intuition indexer returns **at most 250 rows** per query however large `limit` is — silently, no error, no flag                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | `tool-listing.ts`, fixed 2026-10-21              | **was latent.** `DEFAULT_EDGE_LIMIT` was 500 and `truncated` is `rows.length >= edgeLimit`, so the condition was unsatisfiable and a short read reported itself complete. Never bit: mainnet has 185 `uses` edges. `INTUITION_MAX_PAGE` is exported and the limit clamped — **anything else in this repo that pages has to respect it**                                                                                                                                             |
| `scripts/agent-stake-on-use.ts` deposits on the tool's **atom** while `getToolUsage` prices the **triple**, so its stake is invisible to ARP's own reader                                                                                                                                                                                                                                                                                                                                                                                                                                              | ADR `0039`                                        | **latent, not live** — its only callers are `agent-server.ts` and `agent-server-specialist.ts`, both set-aside hackathon surface (ADR `0033`). Not fixed: it is historical record. Do not copy it — `packages/protocol/src/declare/` is the pattern. Mainnet, 2026-10-19: 74 of 185 `uses` edges are in that state                                                                                                                                                                     |
| ~~the chain toggle reaches graph reads only, so the trust panel's vault reads stay on mainnet~~ **CLOSED same day, ADR `0061`.** The toggle governs writes too, and the chain rides on the quote. What is still pinned to 13579 is **ARP's own contracts** — `IdentityRegistry` and the `/agent` register and delegation flows, 11 `chain: intuitionTestnet` sites in five services — because they exist on one chain only (ADR `0025`) | `rules/portability.md` has the boundary table | closed |
| `--color-fg-40` at 3.66:1, below AA                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | task 14                                           | accessibility                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `code.md:86` requires a test framework the repo does not have                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | task 13                                           | an unsatisfiable rule                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 21 triples stranded on a predicate ARP minted and abandoned                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | ADR 0030                                          | testnet only, 2.1e-11 tTRUST; **not migrable**, Intuition has no deletion                                                                                                                                                                                                                                                                                                                                                                                                              |
| `identity-registry.ts` declares `totalAgents()`, which reverts on the canonical registry                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | unrecorded                                        | needs a task                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |

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
- **0039** — the deposit goes on the **edge**, not the tool's atom. **Narrowed by `0056`**: the
  edge is created, not deposited on. It is still the vault `getToolUsage` prices and still the claim;
  what went is the premise that its counter-vault makes it a market.
- **0056** — **the market on an agent is on the agent's own atom; the `uses` edge is a receipt that
  costs money to write.** Measured on mainnet 1155, 2026-10-21: **1** of the 185 `uses` edges has
  ever been contradicted, and **969 of 285,775** triples chain-wide — so nobody takes the other side
  of a statement of fact, and the 0.1 TRUST non-recoverable fee to *create* the edge is the whole
  of the skin in the game. Amends `0046` §2: a deposit on an identity atom is now allowed, named a
  **market** and never reputation, never summed with the edge count. And it is a market in both
  directions — `redeem` shipped with it, because a deposit nobody can withdraw is a donation. The
  user's framing, verbatim: _« soit on mise sur un agent soit on retire notre mise de l'agent, c'est
  un market donc pas un signal, juste une bourse d'agents et d'outils »_.
- **0040** — `TrustStakeCapEnforcer` is a **native-spend** cap. It bounds the amount, not the kind,
  so a cap can be burned on non-recoverable fees. Corrects a claim five files asserted.
- **0041** — one protocol package, `packages/protocol` (`@arp-protocol/core`), with `sdk/` folded
  into `src/arp/`. Read it before following any path written before 2026-10-19.
- **0043** — **a retraction is greppable, or it is partial.** Before committing a corrected sentence
  or a changed count, grep the old wording: three corrections in two rounds each landed at one site,
  and the copy that survived was the one other files pointed at.
- **0042** — **a vault's assets are not evidence of a stake; its position count is.** Creating a
  term seeds its vaults with `minShare`, so `totalAssets > 0` means "this term exists". Three "has
  stake?" checks were wrong, including the MCP server's `staked` flag, which answered `true` for
  every edge. Read it before writing any check of the form `assets > 0`.
- **0052** — **the procedure is the product for the "use" half; the connector is a convenience.**
  Every step of declaring and staking is a public read or a local computation, then a transaction
  the agent signs itself — so an agent can use ARP with **nothing installed**. `skills/arp/SKILL.md`
  carries what cannot be derived: the frozen term ids, the subject rule, the identity-atom recipe
  byte for byte, the vault rule, the ordering, the chain-id guard, the two curves, and four queries
  each executed as written before publishing. Three surfaces, three jobs — the **skill** is the
  procedure, the **connector** the tools, the **inbound node** reachability; only the last needs
  anything to listen.
- **0051** — **ARP points at things and prices opinions about them; it stores nothing.** A registry
  _without registration_: a tool listed here already exists somewhere, and what ARP adds is the
  market. **An agent and a tool are the same shape** — both get an atom pointing at them, so
  `agent-identity-atom.ts` generalises instead of being duplicated. Answers the one question ADR
  `0046` left open: ARP does **not** index how to use a tool, so an agent cannot obtain one it does
  not have, and that is a decision now. Corollary: the pointer is the **atom**, not
  `ModuleRegistry` — which stores four strings on chain and is therefore legacy on this decision's
  own terms. Still missing: `arp_find_tools`, because a pointer nobody can enumerate is not one.
- **0049** — **ARP does not calibrate**, and not as a later layer either. `docs/01` opened with
  "Domain-dimensional calibration is ARP" and `docs/02` carried a forked indexer outputting
  calibrated scores as component 4; both are out. Calibration is a score, and one needing **ground
  truth** — `docs/12`'s first drift signal. What replaces it in the positioning, all four built:
  the input is **priced** not free; it is written in the **capability** vocabulary so the claim is
  about composition; ARP holds **no key, no path, no data**; and the **position** is the measure, so
  the signal is live. New one-liner: identity is ERC-8004, the trust graph is Intuition, **the priced
  declaration of use is ARP**. `docs/11` is marked historical — its conclusion is reversed, its
  measurements hold.
- **0048** — **ARP does not mirror ERC-8004 feedback.** One triple per opinion would turn 569,148
  free opinions into 569,148 empty vaults — `docs/07:71`'s fragmentation anti-pattern — and there is
  **no feedback predicate in the canon**, so mirroring means minting one (ADR `0030`'s cost). The
  feedback also carries no exposure: free, mean score **95.09/100**. ARP reads both surfaces and
  renders them at **different weights, never summed** (`docs/14:156`). `arp_rate_agent` is therefore
  **not built**. The framing that settled it: ARP writes in the **capability** vocabulary (`uses`,
  `has tag`, `implement`…), not the **trust** vocabulary (`has trust provider`, `has trust
assessment`), which it only reads — so what ARP writes is a claim about **composition**, and
  reputation is what emerges when money sits on one. That is why Deep3 is not a competitor: a
  different part of the graph.
- **0047** — **the mirror is a prerequisite nobody listed, and signing is a separate program.**
  The identity atom a `uses` edge needs is written by **Intuition's mirror**, which covers Base — so
  an unmirrored agent (every ARP rig agent on testnet: 728 `same as` edges there, none ours) cannot
  declare at all until someone writes it. `scripts/agent-identity-atom.ts` writes what the mirror
  would have, from recipes **read off mainnet**. `scripts/agent-send-plan.ts` is the **only script
  here that signs**, and refuses by default. **The first real `uses` edge exists**: chain 13579,
  2026-10-20, `(Agent 13579:3) uses (Trail of Bits — guidelines-advisor)`, edge `0x5999d4d1…`,
  support positionCount **1**, counter 1e6 wei at positionCount **0** — ADR `0042`'s dust, first-party.
  Six calls, 0.00723 tTRUST. Testnet proves the **write**, not the cross-chain join.
  **And the coverage number was wrong everywhere**: `88,243` sat in 16 files with no script, and
  five of them bounded a _uniform sample_ with it, so every cohort measurement drew from the oldest
  third of the registry. Measured first-party, 2026-10-21: Base's next id is **444,562**, the mirror
  reaches **28,720** — unchanged in substance since 2026-09-16 — so coverage is **6.46% and falling**
  (it was 9.2% on 2026-10-20; the denominator grows, the numerator does not). Read it
  with `scripts/measure/cohort-coverage.ts`; the population is read, never hardcoded
  (`scripts/erc8004-population.ts`).
  **The node ships over stdio** (`--stdio`), one dispatch for both transports, diagnostics on stderr
  because stdout is the protocol channel. New tool `arp_identity` — ask it first; it answers whether
  an agent has the atom everything else needs.
  **And "who pins" turned out to be the wrong question.** The atom's id is a pure function of the
  agent's identity: CIDv1-raw-sha256 of the schema.org Thing with sorted keys and no whitespace,
  reproduced locally against **two** live mainnet fixtures with no key and no network
  (`packages/protocol/src/declare/agent-atom.ts`). Pinning only makes the document _readable_, anyone
  can pin the same bytes, and ARP's pin is now checked against the local computation and refused on
  a mismatch. Untested: whether Intuition's indexer fetches a third-party pin.
- **0046** — **ARP scores nobody**; it makes staking possible and reads the result. No score, rating
  or assessment of any agent is ever published, because the argument is that the input costs money and
  a score replaces the money with a judgement. **Both halves of its §2 are amended by `0056`** —
  not just the one this line used to name. "Never the identity atom" is gone: a deposit there is
  allowed, named a market, never summed with the edge count. And "a deposit goes on a claim that
  **can be contradicted**" is retracted as a premise: the counter-vault exists and is almost never
  used, 1 of 185 `uses` edges, so ARP creates the edge and does not solicit a deposit on it.
  `(agent, uses, tool)` is still the claim, and still never one triple per interaction.
  The **position** is the measure and the triple only its support, so **no historical cumulative is
  ever displayed**
  (latent today; what is live is the cross-edge sum at `tool-usage.ts:235`). Settles ADR `0015` after
  89 days: its term-ID half stands, its trust-provider half is rejected. Measured first —
  `has trust provider` is 28,683 edges over **three** objects, Deep3 at 99.86%.
- **0045** — **the invariant is the request path, not the runtime.** `docs/12`'s "Not in anyone's
  runtime" carried two claims: ARP ships no code (**already false** — `scripts/arp-mcp-server.ts`
  hosts the planning an agent depends on) and ARP cannot see execution (**holds**, `docs/14`). ARP
  now **ships a node the operator runs**, holding no key: it prepares, the agent signs. The test is
  mechanical — unplug ARP's servers and every declaration, stake and agent-to-agent call still
  completes. Six sites restated the old wording; all corrected in one pass.

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
scripts/measure/cohort-endpoints.ts        what registration files declare, and what is probeable
scripts/measure/cohort-callable.ts         how many agents can act as a tool for another agent
scripts/measure/predicate-edges.ts         edge count per predicate the connector freezes
scripts/measure/predicate-objects.ts       what `use` vs `uses` edges actually assert
scripts/measure/predicate-reachability.ts  whether a defect is live or latent
scripts/measure/stake-vault-placement.ts   whether a stake sits on the edge or the object atom
scripts/measure/counter-side-usage.ts      whether anybody ever takes the other side, and what an act costs
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
