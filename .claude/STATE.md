# Project state

**Updated** 2026-10-28 (task 30 — declaring a use has a page; ADR `0071`).
Hand-maintained — a task does not close without updating this file (`workflow.md`, task-close
protocol).

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

**The catalogue's unit changed from the repository to the skill, 2026-10-29 — 662 skills on testnet
13579, each tagged.** ADR `0077`. The 31 skill repositories hold 662 skills between them (71 in
one, 1 in another), and skills.sh counts installations per skill because
`npx skills add <repo> --skill <name>` is what a person runs. A skill is
`github.com/<owner>/<repo>?skill=<name>` — the install command's two arguments, a pure function,
nothing that can move. `…#<name>` was measured and rejected: `normaliseToolUrl` drops the fragment,
so 55 skills would have hashed to one atom, permanently.

What is on chain, 2026-10-29:

| | |
| --- | --- |
| 662 skill atoms, pinned | `scripts/pin-tool.ts` over every URL, 0 reported failures; the run's log is not kept, so that count is from the console and not from a file |
| 662 `source` edges | `(skill, source, repository)` — ADR `0078`, the term was already on chain |
| `has tag` edges on skills | **601 held, 0 in disagreement** with the table that wrote them (`scripts/audit-skill-tags.ts`, 2026-10-29). 203 were retired, not deleted. **61 match no keyword and carry nothing** |
| 53 `maintained` tags | 50 alive, 3 not — browserbase and prisma/mcp archived, paypal untouched 366 days |
| 21 domains under `tool` | the **16** seeded (not 17 — `domains.proposal.json` dropped `security`), plus `method`, `writing`, `image`, `audio`, `document` |

Three findings worth carrying forward:

- **116 of 531 distinct SKILL.md files exist in more than one repository**, measured by content
  hash (`scripts/measure/skill-content-duplicates.ts`). The six repositories named `superpowers`
  carry 86 files each, **all 86 byte-identical across all six**. Anyone can reproduce it with
  `git hash-object` and no credential — `docs/14`'s test, met exactly.

  **This said "copied from `obra/superpowers`" until it was measured, and that was false**: it
  shares zero files with any of them and is a different project with the same repository name. A
  shared name was read as evidence of shared content. ADR `0078` carries the struck-through
  original. An install count cannot tell any of this apart, which is still why `source` was worth
  paying for.
- **The install count stays off chain**, in `measurements/skills-installs-2026-10-29.json`. It is
  somebody else's number and it changes; it belongs in a ranking input, never in a tag. Only
  `archived` and a 404 are authoritative enough to be verdicts (`scripts/record-maintained.ts`).
- **A wrong tag is withdrawn by redeeming the position, not by deleting anything.** A keyword
  table ordered general before specific — `blockchain` matched `token` in "cuts token usage" and in
  "design tokens" — and wrote 203 wrong tags. They were retired the same day: the triple stays on
  chain, unowned, and the claim leaves ARP's index. `scripts/audit-skill-tags.ts` reads what is
  actually held from the indexer rather than replaying the table, which is how it found 528 skill
  tags where the send log accounted for 296.
- **A bulk write is paced by bytes, not by gas.** ADR `0079`. The RPC refused the seed three times
  with `Bandwidth limit exceeded` (-31002) while `eth_estimateGas` passed at 5.1M gas, and once
  spent it refuses **reads** too. `scripts/send-plan-in-waves.sh` is the shape that works.

**The tool registry is no longer empty — all 53 tool atoms are on testnet 13579, 2026-10-28.**
`catalogue/tools.json` holds 53 curated tools (22 MCP servers published by the vendor that controls
the domain, 31 skill repos above 1M installs on skills.sh); `catalogue/registered-13579.json`
records which of them exist on chain, with the six transaction hashes and the authorisation.
**All 53 are registered** — the first 35 on a balance of 0.0791 tTRUST, the remaining 18 after the
user topped the signer up with 1 tTRUST the same day. Re-running the seed now plans nothing.

Three things that were learned doing it, and each is load-bearing:

- **`arp_find_tools` returned nothing at all, on both chains.** It read only declared tools, and
  `listTools` requires the subject to be an identified agent — measured 2026-10-28, **zero** of the
  186 mainnet `uses` edges has one, and 3 of 167 on testnet. It now reads registered atoms too and
  says which population each row came from. The two figures are never added.
- **`assets` must be `cost + minDeposit`.** Passing the cost alone creates an atom with no position
  — on the chain, not a market (ADR `0053`). All 35 report `position_count` 1.
- **Creating an atom does not make it readable.** The indexer resolves `value.thing` from the CID,
  so the document has to be pinned as well; 34 of 35 resolved within a minute, Alchemy's had not at
  the time of writing.

**The name and the purpose live in the repo, not in the atom** (user, 2026-10-28: _« le nom peut
etre dans le front »_). An atom carries its normalised URL and nothing else. An opaque id
(`arp:tool:00123`) was proposed the same day and rejected: it buys the one property the title
already gives and costs derivability. **OASF was evaluated as the tag vocabulary and rejected** —
between 0.8.0 and 1.1.0, 84 of the 85 shared ids name a different skill, so an unversioned OASF tag
on an immutable atom changes meaning under the reader.

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

**Tests**: protocol **418 passed / 4 skipped** · app **485 passed / 2 skipped** · contracts **17
passed** (measured 2026-10-28). `tsc -b` 0, `eslint .` 0, `check:tokens` 67, `check:contrast` 0,
`check:scripts` 0. **`bun run lint` at the root also fails on `solhint: command not found`** — not
installed; no Solidity gate runs from an agent session.

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

| #      | task                                                      | state                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ------ | --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 01–03b | setup, contract, deploy, enforcers, smart account         | done                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 04     | UI core                                                   | **no status line** — code exists, fiche never marked                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 04b    | agent identity and compose                                | done                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 04c    | agent autonomous positioning                              | done 2026-06-03 (`learning/07`, PASS), then **set aside** — ADR `0033`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 05     | UI polish and deploy                                      | **no status line**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| 06–08  | pin writes, connector, trust panel                        | done                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 09     | follow-ups from global review                             | **done** 2026-10-27 (`12ee6b7`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 10–12  | directory, import, panel tabs                             | done                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 13     | a rule the repo cannot satisfy                            | **done** 2026-10-27 (`c5af7fc`) — the app tests components now; ADR `0063`. Closed together with `tasks/26`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 14     | contrast below AA                                         | **done** 2026-10-27 (`c5784b7`) — the palette is measured, sorted and gated by `check:contrast`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 15     | strip the panel copy                                      | done, verified                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 16     | the connector an agent declares through                   | **half 1 complete** (`a714f25`, verifier PASS round 4) — `packages/protocol/src/declare/`, 2 MCP tools, 44 tests. Prepares calls, never signs (ADR `0038`); stake on the edge (ADR `0039`). Half 2 → `tasks/25`                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 17     | the external verifier                                     | **gate run 2026-10-27** — two walks of 100 on Base 8453, committed under `measurements/`. The finding is the **concentration**: 89 of 100 uniformly sampled agents are one operator (ADR `0064`), so the per-protocol rates are his and not the cohort's                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 18     | `strict` is off in the app                                | done, verified (`6b351ee`) — cost was indeed zero errors                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 19     | the `use` edge and its witness                            | step 1 done. **Step 1b is blocking** — the `same as` join does not exist (`scripts/measure/caip10-join.ts`: zero edges). 1b also **owns task 24's deferred step 3**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 20     | a tool renders as a protocol                              | done, verified                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 21     | `scripts/` is outside every gate                          | **done** 2026-10-27 (`416f41e`) — 93 errors to 0, two real defects found. `tsconfig.scripts.json` is the gate                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 22     | the chain as witness                                      | **gated 2026-10-27 — steps 2 and 3 are not justified, step 4 already has data.** `uses` objects addressable on a chain: **0 of 84 mainnet, 0 of 69 testnet**, so calldata can witness none of them. But `StakeCapChecked` has **122 logs on 13579** (108 tx, 9 delegations, 93 tx from ARP's own rig) and 0 on 1155                                                                                                                                                                                                                                                                                                                                                              |
| 23     | the tool surface                                          | **complete** (`7b6b2d5`, verifier PASS round 4, post-mortem `learning/18`) — `/tool/atom/:atomId`, the ladder rendered at two weights with the other three rungs named. ADR `0042`: a vault's assets are not evidence of a stake, its position count is                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 24     | make the testnet rig faithful                             | **complete** (`5787660`, verifier PASS). Agents 3,4,5 exist and the two-step gate passes; step 3 (identity resolution) **deferred** to task 19 step 1b, so Phase 0 is not closed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 25     | hire an agent, and rate it afterwards                     | **objective superseded — ADR `0060`.** `find` and `rate` shipped (`src/discover.ts`, `src/declare/rate.ts`); **`hire` and `pay` removed**, because a delegation names its delegate by address and an agent's runtime address is not on the graph — so a buyer can only hire an agent they already know, and closing that is a marketplace. ARP records a use, it does not broker one                                                                                                                                                                                                                                                                                             |
| 26     | the app has no DOM test environment                       | **done** 2026-10-27 (`c5af7fc`) with `tasks/13` — `happy-dom` under a second Vitest project, because `environmentMatchGlobs` was removed in Vitest 4 and fails silently                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 27     | a pass over the prose: slop, redundancy, over-explanation | **steps 1-3 done** 2026-10-27 (`dc3ef0b`) — the front-facing half: both READMEs, the publishable skill, the UI copy (already clean). Six **factual** errors came out of `README.md` with the prose. **Steps 4-6 not done**: `docs/` (16 files, 5,967 lines), the rest of `.claude/rules/`, and 31 task files + 65 ADRs + 19 post-mortems                                                                                                                                                                                                                                                                                                                                         |
| 29     | the landing is a scene sequence                           | **built and gated** 2026-10-28, including all five browser checks (`scripts/measure/landing-fit.ts`, which found two defects no other gate could see). **Not closed**: the task forbids touching the other four pages and two changes did — the sticky nav and the route fade — both disclosed in `tasks/29` and awaiting the user's yes or no — the design session's delivery, built as delivered. Six scenes, one gesture per scene, Saffron hand-overs, the word and route scales. Seven of its decisions were the user's: ADRs `0066`-`0069`, three of which amend `rules/ui.md`. What `docs/18` §4-§5 became, and the one thing in it deliberately not built, is ADR `0070` |
| 30     | declaring a use has no page                               | **built, reviewed twice, fixed** 2026-10-28 — `/atom/:atomId` writes `(your agent, uses, this atom)`, and the atom's own market is reachable there. ADR `0071`. The ERC-8004 `owner` is the authority; mainnet is refused pending the user's ADR. Two review rounds, **twelve** findings, **four of them created by fixing the first eight**                                                                                                                                                                                                                                                                                                                                     |
| 28     | coherence audit — code, front, docs                       | **first batch done** 2026-10-20 (ADR `0044`); **eight items marked moot** 2026-10-27 (`ToolDetail`, `RegisterModule`, `ModuleList` deleted); **item 27 fixed** (the mainnet sentence, ADR `0065`). Six items added 2026-10-27 from the task 17 and 22 gates — the `194` at six sites, the two deployment-file shapes, `format:check`'s standing failure, `INDEX.md`'s generator output, and the `new URL(…, import.meta.url)` sweep. Mint vs "mints nothing" is still the user's                                                                                                                                                                                                 |
| 31     | ARP serves the content and signs the access               | **in progress** 2026-10-29. Deliverable 5 done (`0bc29d8`) — `scripts/measure/skill-layouts.ts`: 19 layouts over 31 repositories, 8 of them use more than one, so the resolver reads the tree. **517 of 662 skills are servable**; 138 have no file at HEAD, and 95 of those sit in a repository with no uncatalogued directory — a per-skill liveness signal one tree request re-derives. Deliverable 1 done (`a179e58`) — `packages/protocol/src/receipt.ts`, EIP-712 rather than the EIP-191 the task sketched, because an atom id is the same on 13579 and on 1155 (ADR `0054`) and the signed domain is the only thing that separates them; 25 tests. **Left: 2, 3, 4, the ADR, and the `docs/14` correction** |

**Recommended order** — `docs/15_ROADMAP.md` is the full version with what testnet can and cannot
prove. The old short form here read **"next is 17 → 25"** and both halves are now wrong: 17's gate
ran on 2026-10-27, and **25's objective was superseded by ADR `0060`** — `hire` and `pay` were
removed, because a delegation names its delegate by address and an agent's runtime address is not on
the graph. What is left: **19 step 1b** (blocked — the `same as` → CAIP-10 join does not exist, 0
edges re-measured 2026-10-27), **27** (the prose pass), **28** (the coherence punch list) and
**29**'s two scope questions (the sticky nav and the route fade, both of which touched pages that
task said not to touch — the user's yes or no closes it).

**What is actually being worked on, 2026-10-29: `tasks/31`.** Its deliverables are ordered in the
task file and two are done. The next is **2, the `/content/:atomId` route**, which now has the
measurement it was told to wait for. It is the first thing in this project that makes ARP a party to
an exchange rather than a reader of one, so the ADR it needs (deliverable 6) is not a formality.

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

**`docs/18_THE_MOTION_SPEC.md` is answered and is no longer a handoff.** The design came back on
2026-10-28 as `arp-motion-reference/index.html` plus `MOTION-V2.md` — **the build contract**, and
where it and `docs/18` disagree it wins. Built as delivered (task 29); the user's instruction was
_« garde tout ce qui vient de ce dossier, c'est la nouvelle base »_ and _« surtout garde bien tous
les textes et tout ce qui a ete fait dans le design »_, so the copy on `/` is the reference's copy
to the word.

**The other two design briefs are open handoffs, not open tasks.** `docs/16_THE_AGENT_PAGE.md` and
`docs/17_THE_ATOM_PAGE.md` are written for a design agent and say so in their own headers: a brief,
not a decision. `17` names the three reads it must be built against — `getAtomStanding`,
`getTermShape`, `getTermActivity`, all three exported from `@arp-protocol/core` and verified present
2026-10-27 — what does **not** exist and must not be drawn, and the question to answer before
drawing anything: does a reader learn something the list does not already tell them? Nothing in this
repo is waiting on them.

**Every atom has a page now** — `/atom/:atomId`, which replaced `/tool/atom/:atomId` on 2026-10-27.
The old page read `uses` edges only, so a tool had somewhere to go and a tag, a category or a
protocol did not; `getAtomStanding` does not presume the predicate, and `CapabilitySection` links
every object rather than only the tools. The graph is walkable in both directions from an agent.
The `uses`-scoped, tier-aware view (`docs/14`'s ladder) survives as `DeclaredUses`, which the agent
page renders as its own "who declared using it" section.

Tasks 13, 14, 21, 22 and 17 all closed on 2026-10-27. **29** is built and gated on 2026-10-28 and
is **not closed**: two changes breach its own "do not touch the other four pages" and need the
user's yes or no (see its header). What remains open is **19 step 1b** (blocked on a join that does
not exist), **27**, **28** and **29**'s two scope questions.

**Only `/` has motion beyond the route fade.** `RouteTransition` wraps every route, so all five
pages arrive with a 200ms opacity fade — but `/agents`, `/tools`, `/atom/:atomId` and `/agent` have
no block-level reveal and no word scale, and the step is visible the moment you leave the landing
page. Deliberately out of scope for task 29; it is the next UI task, not a defect in that one.

**The deck's scroll-driven half is outside every gate in this repo, and its structure is not.**
`happy-dom`'s viewport is 1024x768 with `prefers-reduced-motion` false, so `canPin()` is true and
the deck **does** pin in every DOM test. `getBoundingClientRect()` returns zero there, so `progress`
never leaves 0 — the pinned structure at the first scene is covered, and the gesture stepping, the
dive, the four Saffron covers, the scrubbed manifesto and the `played` set are not. The five browser
checks that cover those are `tasks/29`'s Gate and `MOTION-V2.md` §5, and they are now a committed
script: `scripts/measure/landing-fit.ts`. It drives Chromium over the DevTools Protocol with
`fetch` and a `WebSocket` and adds no dependency, walks all six bands at 1440x680, 1440x900,
1920x1080 and 390x844 with and without reduced motion, and measures fit, sideways scroll, the wheel
step, the `#build` jump and sample data. **Run 2026-10-28: all five pass.**

**There IS a browser in this environment, and the belief that there is not is written at 14 line
sites across 12 files** — the list is in `tasks/28` item 35, where the count was wrong three times
before it was measured, once by a correction that dropped a site the stale sentence already had. Chromium is at
`/root/.cache/ms-playwright/chromium-1140/chrome-linux/chrome` and launches headless; what was
missing all along was a driver, not a browser. Visual verification has been deferred across this
project on a premise nobody tested — `rules/claims.md` §1 applied to a blocker rather than to a
figure. The constraint that is real: the cache is under `/root`, so it works while the session runs
as root.

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

**Your agent has one door now** — `/agent`, in the nav, with one question at the top: _does your
agent already have an ERC-8004 id?_ It was two pages (`/agent` and `/agent/import`) that linked
only to each other and appeared in no nav, so 1,828 lines of UI had no way in. ADR `0062`.

The "no" branch **mints in the canonical registry on Base 8453**, not in ARP's own copy on 13579.
`register()` is permissionless there — measured by `scripts/measure/canonical-registry.ts`, which
simulated it from a zero-balance address on both Base and BSC. The five-step testnet bring-up moved
to `/rig`, named for what it is and out of the nav.

**Declaring a use has a page now** — `/atom/:atomId`, task 30, ADR `0071`. `docs/12` point 3 lived
only in `scripts/agent-declare-used.ts` and the MCP server until 2026-10-28, so the centre of the
mechanism was reachable by an agent and not by the human holding its key. The ERC-8004 `owner` is
the authority to declare for an agent; **mainnet is refused** until the user widens ADR `0017`,
because that ADR covers a deposit into a `has trust provider` vault and not the creation of a `uses`
edge.

**What an agent still cannot do is reach the market.** The market is on the atom (ADR `0056`) and
the node only deposits on the edge — `arp_stake_on_used` calls `prepareStakeOnUsed`. Measured
2026-10-28: **2,354 TRUST sits on 39 skill atoms** on mainnet 1155 across 23 positions, and none of
it is reachable through ARP. The human side is wired (`components/market/AtomMarket.tsx`, which was
`AgentBacking` until the name was the only agent-specific thing left in it); the two MCP tools are
not. Nor is `arp_find_tools` useful for the question: its population is the objects of `uses` edges,
which on mainnet are Intuition, Base, Ethereum, IPFS, Claude, Obsidian and Bitcoin.

## Known defects, not yet fixed

| what                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | where                                                                                                                    | severity                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Two ARP contracts ARE deployed on Intuition mainnet 1155, and three files say none is.** `deployments/1155.json` records `trustStakeCapEnforcer` `0x99921C234d4Ca518DC58ba63ff9bfD2Cc9435f34` (`active`) and `domainScopeEnforcer` `0x4E20279EeE9f77673A4f1605E58607cD9A597d70` (`inert`), deployed 2026-09-16 with tx hashes and a gas cost, under ADR `0025`. `eth_getCode` confirms bytecode at both, 2026-10-27. Contradicted by `CLAUDE.md`'s **hard constraints** section, `.claude/rules/security.md`'s deployment posture, and this file's own constraints list — each saying "No ARP contract is on mainnet and none is planned"                                                                                                                                                                                                         | `tasks/28`; correcting a rule needs an ADR                                                                               | **documentation, not deployment** — the deployment was a recorded decision and neither enforcer has ever fired (0 `StakeCapChecked` over 10,014,303 blocks, `scripts/measure/enforcer-events.ts`). The severity is that the false sentence sits in the section an agent reads **before deciding what it may deploy**. No ARP _registry_ is on mainnet, which is the part that is true                                                                                                  |
| **`docs/09:35`'s "194 `use` edges" does not reproduce and never did.** `scripts/measure/predicate-edges.ts` on mainnet 1155 gives **158 `use`, 185 `uses`, 120 `has category`** — identical on 2026-10-16 and 2026-10-27. Two of that trio's three figures reproduce; the 194 is the outlier                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | quoted at `docs/08:125`, `docs/09:35`, `docs/12:100`, `docs/13:85`, `tasks/08:78`, `tasks/23:49` — six sites, `tasks/28` | **it is not a stale figure, it is a different query.** Intuition has no deletion, so 194 → 158 cannot be a graph that shrank, and reading the pair as a time series is a claim the data forbids. `tasks/17` briefly made exactly that mistake while correcting a different one                                                                                                                                                                                                         |
| `scripts/` is outside **every** gate — `tsc -b` covers only `app/src`, no eslint config at the repo root, `bun build` skips unused locals                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | **task 21**                                                                                                              | live, and it has now cost a wrong number on a third-party surface: `arp_find_agents` read a field that does not exist (`market.totalAssets`) and `?? 0n`'d the `undefined`, reporting **0 TRUST for an agent carrying 13.02** until a live check caught it (2026-10-20, ADR `0047`). Also `scripts/seed.ts:34` imports `decodeEventLog` and never uses it, plus five implicit `any`s. Not zero-cost to close — two ad-hoc configs disagreed (6 vs 24), so measure with a committed one |
| `app/vitest.config.ts` is in neither tsconfig project                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | task 21                                                                                                                  | measured at zero errors to add; same shape as task 18, missed by it                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `bun run format:check` fails repo-wide, long-standing. **No count here on purpose** — run `bunx prettier --check .`. The figure was written as 214, measured 140 a few hours later, and the 214 came from a transient `git stash` state of my own making rather than from the repo. A count of unformatted files is exactly the kind of number that rots between the measurement and the sentence. `.claude/choices/INDEX.md` is among them and is **generated**, so `build-claude-index.ts` re-dirties it on every run; it belongs in `.prettierignore` or the generator should emit formatted output                                                                                                                                                                                                                                              | task 21                                                                                                                  | a gate that always fails is not a gate; citing it green would be a `claims.md` check-4 error                                                                                                                                                                                                                                                                                                                                                                                           |
| the rig's testnet writes are permanent — 3 mints plus 1 `setAgentURI`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | ADR `0037`                                                                                                               | a wrong fixture costs an id; one was wrong when minted and corrected in place. Document hashes in `deployments/13579.json` make repo-vs-chain drift detectable                                                                                                                                                                                                                                                                                                                         |
| `verify-cohort.ts` builds a document-hash map, logs it, and **never reads it**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | task 21                                                                                                                  | its header claimed caching that does not happen; the claim is corrected, the map is not wired. A Base run was observed loading a testnet file before the out path was keyed by target                                                                                                                                                                                                                                                                                                  |
| `ensureAtomForURI` mints an atom for any `ipfs://` string without validating it is a CID; 18 permanent atoms with fabricated CIDs exist on testnet                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | task 20 appendix                                                                                                         | unrecoverable per occurrence                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| the protocol package has **one `as any`** — `src/arp/modules.ts:201`, with an eslint-disable                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | `tasks/09`                                                                                                               | arrived with the ADR `0041` fold; pre-existing in `sdk/` since `c461677`. `code.md` forbids it and the package had none before, so do not assume the package is clean of it. Not fixed in the fold, because that is a behaviour change in moved code                                                                                                                                                                                                                                   |
| `packages/protocol/src/tool-usage.ts` scopes its per-vault fields to a **hardcoded curve 1** while its asset totals are all-curve                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | `tasks/23` records the deferral; the fix is small                                                                        | **not live for correctness, but it cost three defects.** 89.33% of mainnet `uses`-edge TRUST is on curve 2 (`measure/stake-vault-placement.ts`), so an edge can hold capital and report zero positions — 1 of 185 does. The `off-curve` state papers over it and has produced one live sort defect, one live counts defect and one latent caption defect. `getToolUsage` already accepts `curveId`; the blocker is a design question, not a contract change                            |
| ~~A declare-only run creates an edge with no position on it~~ **CLOSED 2026-10-21, ADR `0053`.** The product decision was made: `assets = cost + minDeposit`, so every term is born with a position and the declaration is self-attesting in one transaction. Enforced by `previewAtomCreate`/`previewTripleCreate`, which are callable before the term exists and return `shares = 0` for a fee-only deposit. Four write paths carried the old behaviour and all four are fixed: the package planner, `scripts/plan-identity-atom.ts`, three sites in `app/src/services/intuition-graph.ts`, and `submitOperatorLink` in `app/src/services/agent-import.ts` — that last one on **mainnet 1155**, latent (zero `same as` edges onto a `caip10:` atom existed, so it had never run). Residue: **6 positionless atoms on testnet 13579**, unremovable | ADR `0053`                                                                                                               | closed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| The Intuition indexer returns **at most 250 rows** per query however large `limit` is — silently, no error, no flag                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | `tool-listing.ts`, fixed 2026-10-21                                                                                      | **was latent.** `DEFAULT_EDGE_LIMIT` was 500 and `truncated` is `rows.length >= edgeLimit`, so the condition was unsatisfiable and a short read reported itself complete. Never bit: mainnet has 185 `uses` edges. `INTUITION_MAX_PAGE` is exported and the limit clamped — **anything else in this repo that pages has to respect it**                                                                                                                                                |
| `scripts/agent-stake-on-use.ts` deposits on the tool's **atom** while `getToolUsage` prices the **triple**, so its stake is invisible to ARP's own reader                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | ADR `0039`                                                                                                               | **latent, not live** — its only callers are `agent-server.ts` and `agent-server-specialist.ts`, both set-aside hackathon surface (ADR `0033`). Not fixed: it is historical record. Do not copy it — `packages/protocol/src/declare/` is the pattern. Mainnet, 2026-10-19: 74 of 185 `uses` edges are in that state                                                                                                                                                                     |
| ~~the chain toggle reaches graph reads only, so the trust panel's vault reads stay on mainnet~~ **CLOSED same day, ADR `0061`.** The toggle governs writes too, and the chain rides on the quote. What is still pinned to 13579 is **ARP's own contracts** — `IdentityRegistry` and the `/agent` register and delegation flows, 11 `chain: intuitionTestnet` sites in five services — because they exist on one chain only (ADR `0025`)                                                                                                                                                                                                                                                                                                                                                                                                             | `rules/portability.md` has the boundary table                                                                            | closed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ~~`--color-fg-40` at 3.66:1, below AA~~ **CLOSED 2026-10-27** (`c5784b7`) — the token is gone, the palette is measured and sorted, and `app/check-contrast.ts` is the gate that keeps it that way                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | task 14 — closed                                                                                                         | closed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ~~`code.md:86` requires a test framework the repo does not have~~ **CLOSED 2026-10-27** (`c5af7fc`, ADR `0063`) — the app tests components under a second Vitest project with `happy-dom`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | task 13 — closed, with `tasks/26`                                                                                        | closed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 21 triples stranded on a predicate ARP minted and abandoned                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | ADR 0030                                                                                                                 | testnet only, 2.1e-11 tTRUST; **not migrable**, Intuition has no deletion                                                                                                                                                                                                                                                                                                                                                                                                              |
| **Every term-id link to the block explorer is dead.** `AtomPanel`'s aside points at `${explorerUrl}/address/${termId}`; a term id is 32 bytes and the explorer wants 20 — `GET /api/v2/addresses/0x99b0…3710a` answers `Invalid format. Expected ~r/^0x([A-Fa-f0-9]{40})$/`, while the HTML route returns 200 because it is an SPA shell                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | `tasks/28` item 38                                                                                                       | **live, cosmetic** — a link that looks reachable and is not. `tasks/30` propagated the pattern to two new links before a reviewer measured it; those two are fixed. The remaining fix is a decision: remove it, or point at `computeAtomWalletAddr(atomId)`, a real address but a different object                                                                                                                                                                                     |
| **`vercel.json` builds two directories that no longer exist.** Its `buildCommand` is `cd sdk && … cd ../erc8004 && …`, both deleted by ADR `0041`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | unrecorded before 2026-10-28                                                                                             | **live** — the deploy config cannot succeed. The app is a static Vite SPA, so any static host plus the `/(.*)` → `index.html` rewrite replaces it                                                                                                                                                                                                                                                                                                                                      |
| `identity-registry.ts` declares `totalAgents()`, which reverts on the canonical registry                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | unrecorded                                                                                                               | needs a task                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |

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
  of a statement of fact, and the 0.1 TRUST non-recoverable fee to _create_ the edge is the whole
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
- Mainnet **deployment** needs explicit per-session confirmation. No ARP **registry** is on mainnet
  and none is planned (`moduleRegistry` and `identityRegistry` are `null` in `deployments/1155.json`
  — ADR `0025`). **Two caveat enforcers are**, deployed 2026-09-16 under that same ADR; neither has
  ever fired. The flat "no ARP contract is on mainnet" that stood here is false — see known defects.
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
