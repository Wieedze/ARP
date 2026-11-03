# Project state

**Updated** 2026-11-03 (task 60, the audit cleanup: ADRs `0116`-`0119`).
Hand-maintained — a task does not close without updating this file (`workflow.md`, task-close
protocol). It holds **current facts only**; history lives in the ADRs and in git, the treatment
ADR `0117` gave the rule files.

Read this after `CLAUDE.md` and before anything else. It replaces reading every ADR in
`.claude/choices/` and every post-mortem in `.claude/learning/` to find out where the project is.
Counts of files in a growing directory do not belong here; `.claude/choices/INDEX.md` is generated.

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

**Task 60, the audit cleanup, is built (2026-11-03)** on `chore/59-audit-cleanup`; it awaits
`task-verifier`. The facts it changed:

- **`TrustStakeCapEnforcer` on testnet 13579 is `0x19e07280F1483Aa9aCDb1a7F8C61bfd20c7879Bc`**
  (tx `0x8dd54ea3…3159`, 2026-11-03). Its state is keyed by `(caller, delegationHash)` (ADR
  `0118`). The old copy `0x7BB5…0F8E` is kept as `trustStakeCapEnforcerV1` in
  `data/deployments/13579.json`; a delegation signed against it still runs v1 and can still be
  griefed, so its operator must re-sign.
- **The mainnet copy `0x9992…5f34` still runs v1.** It has never fired. A redeploy there needs the
  user's confirmation.
- **The signature status `verified` is now `self-signed`**, labelled "Signed, author not checked"
  on screen (ADR `0119` addendum).
- **Local state lives under `~/.arp`** (or `ARP_HOME`): the sponsor ledger, the node ledger and the
  receipt key. An existing install refuses to start until the old file in its working directory is
  moved, and prints the `mv` to run (ADR `0116`).
- **CI exists**: `.github/workflows/ci.yml` runs `check`, `lint`, `test` and the CLI packaging
  check, plus `forge build && forge test`, on push and pull request to `main` and `dev` (ADR
  `0117`).
- **`contracts/lib` is git submodules**; fetch them with `bun run --cwd contracts deps`.
  `bun run --cwd contracts lint` (solhint 5.0.5 and `forge fmt --check`) runs and passes since
  `515bc4b`.

**The repo was sorted by kind on 2026-10-30, ADR `0086`.** Data now lives under `data/` (`catalogue/`, `deployments/`, `measurements/`). Tasks, the design handoffs and references are under `docs/`. The flat scripts went into `scripts/{agent,seed,build,verify,demo,deploy}/`. The ADR's table maps every old path to its new one; read an older commit's paths through it.

**The catalogue's unit changed from the repository to the skill, 2026-10-29 — 662 skills on testnet
13579, each tagged.** ADR `0077`. The 31 skill repositories hold 662 skills between them (71 in
one, 1 in another), and skills.sh counts installations per skill because
`npx skills add <repo> --skill <name>` is what a person runs. A skill is
`github.com/<owner>/<repo>?skill=<name>` — the install command's two arguments, a pure function,
nothing that can move. `…#<name>` was measured and rejected: `normaliseToolUrl` drops the fragment,
so 55 skills would have hashed to one atom, permanently.

What is on chain, 2026-10-29:

|  |  |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 662 skill atoms, pinned | `scripts/seed/pin-tool.ts` over every URL, 0 reported failures; the run's log is not kept, so that count is from the console and not from a file |
| 662 `source` edges | `(skill, source, repository)` — ADR `0078`, the term was already on chain |
| `has tag` edges on skills | **601 held, 0 in disagreement** with the table that wrote them (`scripts/verify/audit-skill-tags.ts`, 2026-10-29). 203 were retired, not deleted. **61 match no keyword and carry nothing** |
| 53 `maintained` tags | 50 alive, 3 not — browserbase and prisma/mcp archived, paypal untouched 366 days |
| 21 domains under `tool` | the **16** seeded (not 17 — `domains.proposal.json` dropped `security`), plus `method`, `writing`, `image`, `audio`, `document` |

Three findings worth carrying forward:

- **116 of 531 distinct SKILL.md files exist in more than one repository**, measured by content
  hash (`scripts/measure/skill-content-duplicates.ts`). The six repositories named `superpowers`
  carry 86 files each, **all 86 byte-identical across all six**. Anyone can reproduce it with
  `git hash-object` and no credential — `docs/14`'s test, met exactly.

  `obra/superpowers` shares zero files with any of them: a different project with the same
  repository name (ADR `0078`). An install count cannot tell any of this apart, which is why
  `source` was worth paying for.

- **The install count stays off chain**, in `data/measurements/skills-installs-2026-10-29.json`. It is
  somebody else's number and it changes; it belongs in a ranking input, never in a tag. Only
  `archived` and a 404 are authoritative enough to be verdicts (`scripts/seed/record-maintained.ts`).
- **A wrong tag is withdrawn by redeeming the position, not by deleting anything.** A keyword
  table ordered general before specific — `blockchain` matched `token` in "cuts token usage" and in
  "design tokens" — and wrote 203 wrong tags. They were retired the same day: the triple stays on
  chain, unowned, and the claim leaves ARP's index. `scripts/verify/audit-skill-tags.ts` reads what is
  actually held from the indexer rather than replaying the table, which is how it found 528 skill
  tags where the send log accounted for 296.
- **A bulk write is paced by bytes, not by gas.** ADR `0079`. The RPC refused the seed three times
  with `Bandwidth limit exceeded` (-31002) while `eth_estimateGas` passed at 5.1M gas, and once
  spent it refuses **reads** too. `scripts/deploy/send-plan-in-waves.sh` is the shape that works.

**The tool registry is no longer empty — all 53 tool atoms are on testnet 13579, 2026-10-28.**
`data/catalogue/tools.json` holds 53 curated tools (22 MCP servers published by the vendor that controls
the domain, 31 skill repos above 1M installs on skills.sh); `data/catalogue/registered-13579.json`
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

**Branch.** Read it, do not trust a line here: `git branch --show-current`,
`git rev-list --count dev..HEAD`. Commit counts are never written in this file.

**Layout.** `packages/protocol/` is `@arp-protocol/core`, with ARP's own contracts under `src/arp/`
(ADR `0041`, which maps the paths written before 2026-10-19). What runs is in `apps/` (ADR `0082`);
data, tasks and scripts are sorted by kind (ADR `0086`).

**Tests**, measured 2026-10-30 at `f13e2b5` with `bun run test` at the root — **eight workspaces**,
which is the shape `0082` left:

```
graphql    8        protocol  613 (+4 skipped)     mcp   26     node  21
hook       8        api        14                  web  587 (+2 skipped)   contracts 17
```

`tsc -b` 0, `eslint .` 0 over `apps/{web,mcp,node,hook,api}` and `packages/{graphql,protocol}`,
`check:tokens` **70**, `check:contrast` 0, `check:scripts` 0, same date. These are dated counts in a
growing repo: run the commands. Task 16's 44 tests (29 planner, 7 delegated, 8 at the MCP wire) are
under `cd packages/protocol && bun run test`.

**Gate scope** (`claims.md` check 4): `scripts/` is typechecked by `check:scripts`
(`tsconfig.scripts.json`), tested by `test:scripts`, and linted by nothing. The write path lives in
`packages/protocol/src/declare/`, inside every gate (`portability.md` rule 1).

**Pushing.** The user pushes and opens the PRs; an agent session has no GitHub credential. Old PR
drafts are kept, stale, in `docs/reference/pr-drafts/` (ADR `0117`).

## Tasks

| # | task | state |
| --- | --- | --- |
| 01–03b | setup, contract, deploy, enforcers, smart account | done |
| 04 | UI core | **no status line** — code exists, fiche never marked |
| 04b | agent identity and compose | done |
| 04c | agent autonomous positioning | done 2026-06-03 (`learning/07`, PASS), then **set aside** — ADR `0033` |
| 05 | UI polish and deploy | **no status line** |
| 06–08 | pin writes, connector, trust panel | done |
| 09 | follow-ups from global review | **done** 2026-10-27 (`12ee6b7`) |
| 10–12 | directory, import, panel tabs | done |
| 13 | a rule the repo cannot satisfy | **done** 2026-10-27 (`c5af7fc`) — the app tests components now; ADR `0063`. Closed together with `docs/tasks/26` |
| 14 | contrast below AA | **done** 2026-10-27 (`c5784b7`) — the palette is measured, sorted and gated by `check:contrast` |
| 15 | strip the panel copy | done, verified |
| 16 | the connector an agent declares through | **half 1 complete** (`a714f25`, verifier PASS round 4) — `packages/protocol/src/declare/`, 2 MCP tools, 44 tests. Prepares calls, never signs (ADR `0038`); stake on the edge (ADR `0039`). Half 2 → `docs/tasks/25` |
| 17 | the external verifier | **gate run 2026-10-27** — two walks of 100 on Base 8453, committed under `data/measurements/`. The finding is the **concentration**: 89 of 100 uniformly sampled agents are one operator (ADR `0064`), so the per-protocol rates are his and not the cohort's |
| 18 | `strict` is off in the app | done, verified (`6b351ee`) — cost was indeed zero errors |
| 19 | the `use` edge and its witness | step 1 done. **Step 1b is blocking** — the `same as` join does not exist (`scripts/measure/caip10-join.ts`: zero edges). 1b also **owns task 24's deferred step 3** |
| 20 | a tool renders as a protocol | done, verified |
| 21 | `scripts/` is outside every gate | **done** 2026-10-27 (`416f41e`) — 93 errors to 0, two real defects found. `tsconfig.scripts.json` is the gate |
| 22 | the chain as witness | **gated 2026-10-27 — steps 2 and 3 are not justified, step 4 already has data.** `uses` objects addressable on a chain: **0 of 84 mainnet, 0 of 69 testnet**, so calldata can witness none of them. But `StakeCapChecked` has **122 logs on 13579** (108 tx, 9 delegations, 93 tx from ARP's own rig) and 0 on 1155 |
| 23 | the tool surface | **complete** (`7b6b2d5`, verifier PASS round 4, post-mortem `learning/18`) — `/tool/atom/:atomId`, the ladder rendered at two weights with the other three rungs named. ADR `0042`: a vault's assets are not evidence of a stake, its position count is |
| 24 | make the testnet rig faithful | **complete** (`5787660`, verifier PASS). Agents 3,4,5 exist and the two-step gate passes; step 3 (identity resolution) **deferred** to task 19 step 1b, so Phase 0 is not closed |
| 25 | hire an agent, and rate it afterwards | **objective superseded — ADR `0060`.** `find` shipped (`packages/protocol/src/discover.ts`); `rate` shipped and was deleted in task 60 as unimported (`cfffd35`); **`hire` and `pay` removed**, because a delegation names its delegate by address and an agent's runtime address is not on the graph — so a buyer can only hire an agent they already know, and closing that is a marketplace. ARP records a use, it does not broker one |
| 26 | the app has no DOM test environment | **done** 2026-10-27 (`c5af7fc`) with `docs/tasks/13` — `happy-dom` under a second Vitest project, because `environmentMatchGlobs` was removed in Vitest 4 and fails silently |
| 27 | a pass over the prose: slop, redundancy, over-explanation | **done** 2026-11-03 — steps 1-5 against the positioning (`ARP-business-dev` kit, `docs/01`, `docs/12`): README 363 → 217, positioning docs realigned, dated docs headed with what drifted, rules cut with no rule changed (ADR `0121`). ARP is not B2B first (ADR `0120`). Step 6 dropped by the user. `learning/51` |
| 29 | the landing is a scene sequence | **COMPLETE** 2026-10-30, `task-verifier` PASS on the second pass (`f13e2b5`; post-mortem `learning/22`). The design session's delivery, built as delivered: six scenes, one gesture per scene, Saffron hand-overs, the word and route scales. Seven of its decisions were the user's — ADRs `0066`-`0070`, three of which amend `rules/ui.md`; what `docs/18_THE_MOTION_SPEC.md` §4-§5 became is `0070`. **The scope breach is authorised, not absorbed**: the task forbade touching the other pages and the sticky nav + route fade reached every route; the user said yes 2026-10-30 (_« 5 oui il reste »_), to the **mechanism** — now 65px/202px/24%/13 routes. **Still open**: the other routes have no block or word scale, and the gate has no assertion for `Home`/`End` or for native scroll past scene 5 — so four of its five Gate items are asserted, not five |
| 30 | declaring a use has no page | **built, reviewed twice, fixed** 2026-10-28 — `/atom/:atomId` writes `(your agent, uses, this atom)`, and the atom's own market is reachable there. ADR `0071`. The ERC-8004 `owner` is the authority; mainnet is refused pending the user's ADR. Two review rounds, **twelve** findings, **four of them created by fixing the first eight** |
| 28 | coherence audit — code, front, docs | **first batch done** 2026-10-20 (ADR `0044`); **eight items marked moot** 2026-10-27 (`ToolDetail`, `RegisterModule`, `ModuleList` deleted); **item 27 fixed** (the mainnet sentence, ADR `0065`). Six items added 2026-10-27 from the task 17 and 22 gates — the `194` at six sites, the two deployment-file shapes, `format:check`'s standing failure, `INDEX.md`'s generator output, and the `new URL(…, import.meta.url)` sweep. Mint vs "mints nothing" is still the user's |
| 31 | ARP serves the content and signs the access | **built and verified** 2026-10-29, all seven deliverables. ARP is now a path and not only an index: the node holds one key, it signs content receipts and nothing else, and it cannot move value — ADR `0038` unamended, the plan path still has no key. `receipt.ts` (40 tests, EIP-712 **not** the EIP-191 the task sketched, because an atom id is the same on 13579 and 1155 and the signed domain is the only thing that separates them), `content-path.ts` + `content-serve.ts` (21 each, every piece of IO injected), `apps/mcp/src/content.ts` + one route, the hook filling `ref` from the fetch, `arp_declare_session`, ADR `0080`, `docs/14`'s amendment, and `docs/22`, the operator-facing account. **521 of 662 skills are servable** (`data/measurements/skill-layouts-2026-10-29T2200.json`); 139 have no file at HEAD and 95 of those sit in a repository with nothing a rename could have been, which is a per-skill liveness signal one listing request re-derives. Verified end to end: the digest a receipt carries is what `sha256sum` prints on the downloaded file. |
| 32 | three apps over two packages: mcp, node, hook | **built and walked** 2026-10-30 on `refactor/monorepo-apps`. `apps/{web,mcp,node,hook}` and `packages/{graphql,protocol}`; the MCP server, the node and the hook left `scripts/` for workspaces with their own gates, and the 25 Intuition query documents left `protocol` for `@arp-protocol/graphql` (ADR `0082`, amending `0041`). Each app builds to one readable JS file with `viem` external; nothing published. The move left the test counts unchanged; read today's from the block above. The loop walked on testnet 13579 through the moved code: dry, then a new `(agent 6, uses, flux-2-klein)` edge `0xc994c7a0…` + deposit `0xd2125e19…` (0.003 tTRUST), the content route, the hook → session-log → `arp_declare_session` chain, and a hire 3 → 2 (`0xf3649dbe…` payment, `0xd90c43fe…` deposit). Signed by ARP's own testnet keys on the user's instruction (ADR `0037`). The walk found two defects, both closed (below) |
| 33 | one installer: npx and a native package per runtime | **plan** 2026-10-30 (`docs/tasks/33`, research in `docs/23`, ADRs `0089` one installer and `0090` what the hook records), eight sub-tasks. **33a done** 2026-10-30, `task-verifier` PASS on the second pass (`learning/23`): the hook is documented on `PostToolUse` + `PostToolUseFailure` (failures were never seen), reads Claude and Grok payloads by shape, classifies the outcome (`ok`, `tool_error`, `auth`, `timeout`, `unreachable`, `payment`), records call id and duration, names an MCP server by its configured URL or npm/PyPI page with credentials stripped, and writes `.arp/.gitignore`; `parseSessionLog` keeps one line per call. Not live yet: `resolveInvocations` still reports MCP calls as `unknown`. ADR `0087` wants that resolution in `packages/protocol/`, where `mcp-config.ts` should move. Path tokens under 24 characters still reach the local log: revisit before an MCP ref becomes an atom. **33b done** 2026-10-30: `apps/cli` = `@arp-protocol/cli`, one `arp` binary (`mcp`, `hook`, `node`) built for Node 22. `Bun.serve` and `Bun.stdin` are replaced by `@arp-protocol/core/node` (`serveFetch`, `linesOf`), and the two `import.meta.main` entries by exported `main()`. The hook ships as its own `dist/hook.js`: as a chunk it loaded viem, 0.37 s per call under Node; alone, about 0.02 s. That needed `"sideEffects": false` on `@arp-protocol/core` (no module has a top-level call; the web build is unchanged). Gate `apps/cli/scripts/check-node.sh`: packed tarball, Node 22, no Bun on `PATH`, every command, the node over a real socket. **Not published.** **33c done** 2026-10-30: `arp init` / `uninstall` / `doctor` / `init --print` (`apps/cli/src/install/`). It finds Claude Code, Grok, Cursor, Gemini and Codex, shows the part of each file it touches, asks, backs up, keeps each file's mode, writes, and changes nothing on a second run (with or without the `claude` CLI on PATH). VS Code gets `--print`. The hook goes to Claude Code only (and Grok through it): the others get the MCP entry, since the hook cannot read their payloads yet. **33i started** 2026-10-30: `arp hook --capture` (redacted payloads in `~/.arp/captures/`) and `arp init --capture`, which hooks Codex, Gemini, Cursor and Copilot in their documented formats. Copilot is now a runtime (`~/.copilot/mcp-config.json`). Waiting on one real capture per runtime from the user to write each adapter. **33d started** 2026-10-30: `bun run packages` generates the Claude Code plugin (validated, and installed with the real `claude`; its hook and MCP server both ran) and the Gemini extension (untried), plus the repo's `.claude-plugin/marketplace.json`. Codex waits on its schema and a `.gitignore` exception for `.agents/plugins/`. No `userConfig` until 33e. Open before 33f: no LICENSE file, `serverInfo.version` 0.2.0 against 0.0.1. Nothing published |
| 35 | the account page: delegations and settings | **built and verified** 2026-11-02 (`learning/33`, PASS; ADR `0100`) merged into `dev` (PR #22, 2026-11-02): `/account` lists, signs and revokes delegations; `/profile` and `/rig` are removed and the positions move to `/activity` |
| 36 | the activity bar: what the agent triggered and declared | **built** 2026-10-30 (`docs/tasks/36`, ADR `0091`). `arp-session-log --serve` streams `.arp/{session,receipts,sent}.jsonl` from 127.0.0.1:3003. It allows CORS for named origins only, and any request whose `Host` is not this machine gets 403, which stops DNS rebinding. `agent-send-plan --log` writes `sent.jsonl`. The web app's `ActivityLog` is on every page, with an `agent` stream; the browser confirms every reported hash by reading its receipt. `/activity` joins each invocation to its declaration and stake on ids. Amended the same day: every transaction the app sends goes through `services/tx-record.ts` (17 sites plus deposit and redeem), the chain stream carries the indexer's `transaction_hash`, each hash in the bar links to its own chain's explorer, and `Activity` is in the nav. Then: the page is one timeline (who · off chain · on chain · tx), agents named by their identity atom through `getTermLabels`, and everything follows the mainnet/testnet toggle. Then (user, 2026-10-30): `/activity` leads with **every identified agent's** declarations and stakes, read from the indexer every 15 s (`getRecentStakes`, `services/chain-facts-view.ts`), so it no longer empties on reload; the local feed stays below it as the demo. No per-agent log on the agent page. Amended 2026-11-02 (`b8b650f`, `ui-reviewer` and `task-verifier` PASS, `learning/35`): a deposit in the declaring transaction shows on the declaration's row, zero deposits are left out, the signer shows on each stake. `/profile` moved into `/activity` with task 35 (PR #22, merged) |
| 37 | the delegation register | **plan** 2026-10-30 (`docs/tasks/37`, ADR `0092`). Delegations published on Intuition testnet as Hourglass does (IPFS document + `delegate to` / `in context of`), found by the agent's address, revocation read from `disabledDelegations`. ARP's sponsor relay pays from the treasury key, **testnet only**, with limits the user set: 2 publications per delegator per day, about 1 tTRUST per day overall, and only for a delegate that is a registered ERC-8004 agent. Amends ADR `0045` (a hosted service may pay, never be needed) and `security.md`. Open: where the relay runs, Pinata vs Intuition's pin API |
| 38 | the installer meets real runtimes | **part A done for Claude Code** 2026-11-02 (`learning/44`, `task-verifier` PASS on the second pass) on `feat/38-claude-code-demo`, built on top of task 49 (PR #32): 2.1.316 captures are fixtures, `arp init` pins testnet, `.arp/` ignores itself, `arp doctor` requires claude ≥ 2.1.316, `packages --tarball` for testers. Planned 2026-10-30 (`docs/tasks/38`), **narrowed 2026-11-02 to Claude Code for the demo, the other runtimes wait for the port**. Open: archive hosting; parts B (the plugin under Grok, the extension under Gemini), C (the Codex plugin), D (licence, one version, Gemini gallery, npm scope) and E (Windows for Cursor and VS Code), all done with the user on their machine |
| 39 | the install handshake | **built and verified** 2026-10-30 (`learning/32-the-install-handshake`, PASS; ADR `0095`), merged into `dev` (PR #16). The node key and the owner both sign; the read names the agent. Not published |
| 40 | the sponsoring service | **built and verified** 2026-10-30 (`learning/32-the-sponsoring-service`, PASS; ADRs `0096`, `0099`), merged into `dev` (PR #17). **Running locally since 2026-11-02** (`127.0.0.1:3200`, treasury `0xE596…1AA1`, task 50 D3), its first sponsored walks landed the same day (agents 9 and 10, task 50 §6). Sponsors hire proofs, and on testnet 13579 content receipts too (ADR `0109`); mainnet still refuses a content receipt (see 41) |
| 41 | x402 in USDC | **deferred to the mainnet port** 2026-11-02 (ADR `0102`, user decision). Consulting ARP is free on testnet 13579. Consequence: no content receipt is sponsored on testnet |
| 42 | proven and declared | **built and verified** 2026-10-30 (`learning/29-proven-and-declared`, PASS), merged into `dev` (PR #15) |
| 43 | the receipt enforcer | **built and verified** 2026-10-30 (`learning/31`, PASS; ADR `0098`), merged into `dev` (PR #14). Not deployed. The v2 receipt is task 44 |
| 44 | hire receipt v2 | **built and verified** 2026-11-02 (`learning/34`, PASS; ADR `0101`) merged into `dev` (PR #24, 2026-11-02) |
| 45 | discovery without a command | **plan** 2026-11-02. 45a, 45b' and 45d merged into `dev` (PRs #23, #25). 45e met by default on testnet (ADR `0102`). **45c run 2026-11-02**: consulted on 13 of 14 tool prompts and 0 of 6 others (PASS); 3.14× the tokens and judged worse 37 of 42, so no saving is claimable (`data/measurements/discovery-eval-2026-11-02.jsonl`). The rest open |
| 46 | the redesign from references | **46a–46e built** 2026-11-02 on `feat/46-redesign-from-references` (PR to `dev`): `/tools` pages by 25 (was 662 rows, 54,915px on 13579), `/register` offers two tiles, the agent page takes the skill page's layout (ADR `0104`: detail pages put facts on the right; Identity before the tabs on a phone), `/agents` opens an agent from the search and leaves Support empty when nobody supports, `/activity` splits Yours from Everyone (reads `receiver_id`). The mainnet declare sentence is a "Switch to testnet" button on the skill, atom and agent pages. **46f dropped**: the user keeps the footer wordmark. Verified: 46a, 46b, 46c, 46d, 46e (`learning/36`, `37`, `41`, `39`, `40`); no review is owed. 46c's `intuition-integrator` review corrected ADR `0096` item 3: a `BOTH` approval would let the sponsor close the agent's position, not send its TRUST elsewhere. Our custom modules stay, user decision |
| 47 | plain words for the operator | **built and verified** 2026-11-02 (ADR `0103`, `learning/38`; `ui-reviewer` PASS on round 2, `task-verifier` PASS) on `feat/47-plain-words`. Web, MCP descriptions and output, and the protocol's `why:` strings follow the user's glossary: support, withdraw, declaration, public, permission, limit, agent wallet; ids and shares behind a "Verify" detail. CLI and node needed no change. 46 is arp-30's redesign |
| 48 | the journeys | **built and verified** 2026-11-02 on `feat/48-journeys`, uncommitted (`learning/42`, PASS on round 2; ADRs `0105`, `0106`; `ui-reviewer` PASS on round 3, `intuition-integrator` PASS). The app opens on testnet. `/activity` rows link. Back links on the detail pages. `/search` with `/`, plus a cohort name filter (`$where`, label OR Thing name). One-row mobile nav. `shortTrust` in lists. Labels at least 11px. Item 9 did not reproduce, no code |
| 49 | lean search: more tools found, fewer tokens | **built and verified** 2026-11-02 on `feat/49-lean-search` (ADR `0108`, `learning/43`, `task-verifier` PASS on the second pass). `arp_find_tools` takes `query` and `offset`, answers a short row (name, purpose, url, declarations, installs, copies), and collapses copies of one skill; `detail: "full"` keeps the old rows. Domain `video`: 16.6 KB → 9.6 KB for 25 results, now distinct. Same branch: three defects that stopped the server under Claude Desktop's built-in Node, found live 2026-11-02 |
| 50 | Claude Desktop walks the loop | **built** 2026-11-02. Sponsor side merged (PR #37, ADRs `0109`, `0110`); extension on `feat/50-extension` (arp-7f); the web mint follows the chain toggle (13579 on testnet). Walked end to end on 13579 twice: agent 9 by arp-7f's script, agent 10 by the user in Claude Desktop (`docs/tasks/50` §6). **Verified** 2026-11-02 (`task-verifier` PASS, `learning/48`). To merge: `feat/50-extension`, `fix/50-verifier-punch` |
| 51 | quieter search | **built and verified** 2026-11-02, branch `feat/51-quiet-search`, post-mortem `learning/46`. A query must match every word; an empty query answer suggests nothing (ADR `0111`). Re-measured: cost ratio 1.46 (95% 1.30 to 1.63) against 1.84 before, intervals overlap, so no saving established |
| 52 | when memory falls short | **built and verified** 2026-11-02, branch `feat/52-memory-falls-short`, post-mortem `learning/47`. With ARP, 40 of 42 answers name a skill or MCP server that exists, against 6 of 42 without (95% 84–99% vs 7–28%, after the extractor was corrected), and neither arm invents one: PASS. But it costs 5.19× the tokens, and the judge prefers the answer without ARP 26 of 42 (`data/measurements/discovery-eval-install-2026-11-02-recheck.jsonl`) |
| 55 | the Claude Code demo | **built and verified** 2026-11-02, branch `feat/55-claude-code-demo`, post-mortem `learning/49`. `arp init --project --sponsored`; `arp_get_skill` installs the skill into `.claude/skills/` and its receipt where the hook reads it. Walked live: agent #11, the hook logged the `Skill` invocation with the receipt's atom. The hook's record stays local (user, option A) |
| 57 | the whole skill | **built and verified** 2026-11-02, branch `feat/57-skill-bundle`, post-mortem `learning/50`. In Claude Code project mode `arp_get_skill` installs the skill's whole directory under one receipt over a manifest (`serveSkillBundle`, `GET /content/:id?bundle=1`); Desktop keeps SKILL.md alone. Live: Anthropic's pptx, 56 files, receipt verified. Restart the content server from dev to serve bundles |
| 53 | one path per profile, from the landing | **plan** 2026-11-02 (`docs/tasks/53`). User decisions: three profiles at launch (Claude user, agent builder, tool author), scene 4 of `/` replaced, listing a tool sponsored on testnet with a limit (needs a new ADR and a sponsor route). Badge left out. Blocked in part: `@arp-protocol/cli` is 404 on npm; path A's last step is task 50. ADR `0112` (two ways to pay, data licence, free badge) and the discovery argument in `docs/01` landed on the same branch |
| 54 | the result, not the answer | **plan** 2026-11-02 (`docs/tasks/54`), owner arp-7f. Three arms on task 52's 14 needs: Claude alone, Claude + ARP, a manual skills.sh search first. Measures the produced result judged blind, the user's effort, and cost per successful result. The user's point: the value is discovery without a prior search |
| 60 | the audit cleanup | **verified 2026-11-03** (task-verifier PASS, `.claude/learning/52-audit-cleanup.md`), branch `chore/59-audit-cleanup` (the branch keeps 59; the task is 60 because 59 belonged to another session), ADRs `0116`-`0119`. Seven streams merged (`docs/tasks/60` lists them). `contract-reviewer` and `intuition-integrator` PASS on re-review; `ui-reviewer` FAIL, fixed in the `chore/60g-ui-fixes` merge and checked by the verifier. The facts it changed are under "Where the work is right now" |

**Recommended order** — `docs/15_ROADMAP.md` is the full version with what testnet can and cannot
prove. Open: **19 step 1b** (blocked — the `same as` → CAIP-10 join does not exist, 0 edges
re-measured 2026-10-27) and **28** (the coherence punch list).
17's gate ran 2026-10-27; 25's objective was superseded (ADR `0060`).

**After task 29** (closed 2026-10-30, `learning/22`): every route other than `/` has no
block-level reveal and no word scale, so the step is visible the moment you leave the landing. It is
the next UI task; the user's yes covered the sticky nav and the route fade, not that.
`RouteTransition` gives every route in `App.tsx` a 200ms opacity fade — read the route count there.

**Task 31** (complete 2026-10-29, `learning/20`) is why `claims.md` has check 6 (ADR `0081`): nine
blockers across four review rounds and none was a crash. Every figure re-derived from a committed
measurement was exact; every hand-maintained figure was wrong.

**The node.** It holds one key, signs content receipts and nothing else, and cannot move value; ADR
`0038` is unamended — the plan path still has no key. Writing `docs/22` found two live defects (the
node bound every interface while a tool fetched a caller's URL; `file:///etc/passwd` passed the
guard). `arp_probe_endpoint` follows redirects by hand and checks every hop (`0a38a93`), and
resolves every hop's name first (`8507bda`). DNS rebinding stays open for the probe in a browser
(known defects). The operator-facing account of the node's files and trust surface is `docs/22`.

**The two things to know before touching it:**

1. **A receipt attests ACCESS, never use**, and `docs/14`'s opening sentence still stands. What the
   amendment carves out is one population: agents that fetched through a node. The argument it
   corrects was about a _place_ — a connector inside the agent's process is under the agent's
   control, which says nothing about a party on the other end of a fetch.
2. **Both kinds of node sign** (ADR `0080`, the user's decision). A node the operator installs
   holds its own key, so its receipt is the operator's word in a second place; a node somebody else
   runs is a second party. **Addresses cannot tell them apart** — an operator-run node generates
   its own key, so its address differs from that operator's agent key while one hand holds both.
   The reader decides: `ARP_ACCEPTED_SIGNERS`, and
   **empty is the honest default** — an unrecognised signer reads `unknown-signer`, not corroborated
   and not dismissed. A `self-signed` receipt is **labelled, not refused** — forging one costs the
   agent the price of the claim and earns a reputation on a tool it never used. ADR `0080`'s
   amendment.

**One trap for anyone running the node by hand:** `apps/mcp/test/server.test.ts`
spawns its own server on **port 3099**. A node left running there makes six of its tests fail
against the real testnet instead of the stub, and it reads as a code defect.

**Two decisions taken on `intuition-integrator`'s argument rather than alone:**

1. **`ARP_TARGET` stays on mainnet.** It is no longer a spend defect — with an empty mainnet
   catalogue nothing resolves and `plan` is null, so a default node cannot plan a mainnet write at
   all — and every other tool on the server is mainnet-first by the measurements (`implement →
ERC-8004`: 28,648 triples on 1155 against 254 on 13579). What the fix had to add instead was a
   **loud** emptiness: `arp_declare_session` refuses once and names `ARP_TARGET=testnet`, because
   662 silent `unknown`s read as "I have never heard of your tools" rather than "this node is on
   the wrong chain" — the same trap `configuredAttestor` documents in that file.
2. **Recording the 61 missing atom ids is a new task**, in `FUTURE.md`. Their atoms exist on chain,
   so it is a catalogue re-record at zero cost; what blocks it is `docs/20`'s classification
   question, since the tagger **declined** those 61 rather than missing them.

**Two measurement scripts back the catalogue figures:** `scripts/measure/skill-layouts.ts` and
`scripts/measure/catalogue-atom-ids.ts`.

Everything runs on **testnet 13579 for now** — the rig is deployed there and nothing needs
simulating. What testnet will never prove is **one** thing: `DomainScopeEnforcer` has no mainnet
mechanism (it gates `ModuleRegistry.registerModule`, which ADR `0025` keeps off mainnet).
`TrustStakeCapEnforcer` caps native `value`, so a fee counts against it, and **the cap bounds the
amount and not the kind**, so a cap can be burned on fees instead of invested in positions (ADR
`0040`). Costs are **100× apart** — 0.001000000002 TRUST per triple on testnet against
0.100000000002 on mainnet — so no budget tuned on testnet transfers.

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

**`docs/18_THE_MOTION_SPEC.md` is answered.** The design came back as
`docs/design/motion/index.html` plus `MOTION-V2.md` — **the build contract**, which wins where they
disagree (ADR `0070`). The copy on `/` is the reference's copy to the word, on the user's
instruction (task 29).

**The other two design briefs are open handoffs, not open tasks.** `docs/16_THE_AGENT_PAGE.md` and
`docs/17_THE_ATOM_PAGE.md` are written for a design agent and say so in their own headers: a brief,
not a decision. `17` names the three reads it must be built against — `getAtomStanding`,
`getTermShape`, `getTermActivity`, all three exported from `@arp-protocol/core` and verified present
2026-10-27 — what does **not** exist and must not be drawn, and the question to answer before
drawing anything: does a reader learn something the list does not already tell them? Nothing in this
repo is waiting on them.

**Every atom has a page** — `/atom/:atomId`. `getAtomStanding` does not presume the predicate, and
`CapabilitySection` links every object rather than only the tools, so the graph is walkable in both
directions from an agent. The `uses`-scoped, tier-aware view (`docs/14`'s ladder) is `DeclaredUses`,
which the agent page renders as its own "who declared using it" section.

**The deck's scroll-driven half is outside every gate in this repo, and its structure is not.**
`happy-dom`'s viewport is 1024x768 with `prefers-reduced-motion` false, so `canPin()` is true and
the deck **does** pin in every DOM test. `getBoundingClientRect()` returns zero there, so `progress`
never leaves 0 — the pinned structure at the first scene is covered, and the gesture stepping, the
dive, the four Saffron covers, the scrubbed manifesto and the `played` set are not. The five browser
checks that cover those are `docs/tasks/29`'s Gate and `MOTION-V2.md` §5, and they are now a committed
script: `scripts/measure/landing-fit.ts`. It drives Chromium over the DevTools Protocol with
`fetch` and a `WebSocket` and adds no dependency, walks all six bands at 1440x680, 1440x900,
1920x1080 and 390x844 with and without reduced motion, and measures fit, sideways scroll, the wheel
step, the `#build` jump and sample data. **Run 2026-10-28: all five pass.**

**There is a browser in this environment.** Chromium is at
`/root/.cache/ms-playwright/chromium-1140/chrome-linux/chrome` and launches headless; what was
missing was a driver. The cache is under `/root`, so it works while the session runs as root. The
contrary belief is still written at 14 line sites across 12 files (`docs/tasks/28` item 35).

## The plan, in three phases

`docs/13_THE_THREE_FLOWS.md`, with the mechanism in `docs/14_THE_WITNESS_PROBLEM.md`.

1. **The verifier** (task 17) — read what agents publish, probe it, classify. Needs nobody's consent,
   runs on the whole registry today (next id 444,562 on 2026-10-21), and is the only
   signal that moves on its own.
2. **Hire** (task 25, objective superseded by ADR `0060`) — hire an agent that never signed
   anything; the delegation caps the buyer's own spend, so the seller needs no relationship with
   ARP. The old `/hire` demo is **deleted** (user,
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

**Your agent has one door** — `/agent`, in the nav, with one question at the top: _does your
agent already have an ERC-8004 id?_ (ADR `0062`).

The "no" branch **mints in the canonical registry on Base 8453**, not in ARP's own copy on 13579.
`register()` is permissionless there — measured by `scripts/measure/canonical-registry.ts`, which
simulated it from a zero-balance address on both Base and BSC.

**Declaring a use has a page** — `/atom/:atomId`, task 30, ADR `0071`. The ERC-8004 `owner` is
the authority to declare for an agent; **mainnet is refused** until the user widens ADR `0017`,
because that ADR covers a deposit into a `has trust provider` vault and not the creation of a `uses`
edge.

**An agent can reach the market.** `arp_take_position` and `arp_exit_position` (defined in
`apps/mcp/src/tools.ts`, dispatched in `apps/mcp/src/server.ts`) plan a deposit and a redemption on
an **atom's** vault — the market on the thing itself (ADR `0056`) — and are never summed with
`arp_stake_on_used`, which backs the `uses` **edge**. The human side is
`apps/web/src/components/market/AtomMarket.tsx`. The discovery gap: **2,354 TRUST sits on 39 skill
atoms** on mainnet 1155 across 23 positions (measured 2026-10-28), and `arp_find_tools` is not how
you find them — its population is the objects of `uses` edges, which on mainnet are Intuition, Base,
Ethereum, IPFS, Claude, Obsidian and Bitcoin.

## Known defects, not yet fixed

| what | where | severity |
| --- | --- | --- |
| **Delegations signed against the v1 `TrustStakeCapEnforcer` on 13579 (`0x7BB5…0F8E`) still run v1 and can still be griefed** — its state was keyed by `delegationHash` alone | ADR `0118`, `data/deployments/13579.json` `trustStakeCapEnforcerV1` | live for each such delegation until its operator re-signs against `0x19e0…79Bc` |
| **The mainnet `TrustStakeCapEnforcer` `0x9992…5f34` runs v1** | `data/deployments/1155.json`, ADR `0118` | latent — it has never fired. A redeploy needs the user's confirmation |
| **`docs/09:35`'s "194 `use` edges" does not reproduce and never did.** `scripts/measure/predicate-edges.ts` on mainnet 1155 gives **158 `use`, 185 `uses`, 120 `has category`** — identical on 2026-10-16 and 2026-10-27. Two of that trio's three figures reproduce; the 194 is the outlier | quoted at `docs/08:125`, `docs/09:35`, `docs/12:100`, `docs/13:85`, `docs/tasks/08:78`, `docs/tasks/23:49` — six sites, `docs/tasks/28` | **it is not a stale figure, it is a different query.** Intuition has no deletion, so 194 → 158 cannot be a graph that shrank, and reading the pair as a time series is a claim the data forbids. `docs/tasks/17` briefly made exactly that mistake while correcting a different one |
| `apps/web/vitest.config.ts` is in neither tsconfig project | task 21 | measured at zero errors to add; same shape as task 18, missed by it |
| `bun run format:check` fails on about 286 tracked files. **Deliberately not formatted**: a repo-wide format would conflict with other sessions' open branches. both generated `INDEX.md` files are among them, re-dirtied by every `build-claude-index.ts` run | task 60 | a gate that always fails is not a gate; citing it green would be a `claims.md` check-4 error. Run `bun run format:check` for today's count |
| `.claude/worktrees/` — a registered worktree of `feat/41-x402` plus agent worktrees — is gitignored but not removed (598 MB at the audit; `du -sh .claude/worktrees` read 2.0 GB on 2026-11-03) | task 60 | disk only; **the user decides** |
| `Landing.tsx` (1,019 lines) is not split | task 60, task 53 | deferred while task 53 is open on it |
| The node-serve body-cap test timed out on one machine and not another | hardened in `bd2a23a` | **never reproduced**; the hardening is untested against the failure it targets |
| DNS rebinding stays open for the probe in a browser | `arp_probe_endpoint`, task 60 | open |
| The sponsor's `/list-tool` (ADR `0120`, task 53c) | arp-c4's | not this branch's |
| the rig's testnet writes are permanent — 3 mints plus 1 `setAgentURI` | ADR `0037` | a wrong fixture costs an id; one was wrong when minted and corrected in place. Document hashes in `data/deployments/13579.json` make repo-vs-chain drift detectable |
| `verify-cohort.ts` builds a document-hash map, logs it, and **never reads it** | task 21 | its header claimed caching that does not happen; the claim is corrected, the map is not wired. A Base run was observed loading a testnet file before the out path was keyed by target |
| `ensureAtomForURI` mints an atom for any `ipfs://` string without validating it is a CID; 18 permanent atoms with fabricated CIDs exist on testnet | task 20 appendix | unrecoverable per occurrence |
| the protocol package has **one `as any`** — `packages/protocol/src/sources/erc8004-registry/index.ts:93`, eslint-disabled with its reason (the Node-only `Buffer`) | `docs/tasks/09` | `code.md` forbids it; do not assume the package is clean of it |
| `packages/protocol/src/tool-usage.ts` scopes its per-vault fields to curve 1 (`DEFAULT_CURVE_ID`) unless the caller passes `curveId`, while its asset totals are all-curve. `curveId` stays optional (ADR `0119`) | `docs/tasks/23` records the deferral; the fix is small | **not live for correctness, but it cost three defects.** 89.33% of mainnet `uses`-edge TRUST is on curve 2 (`scripts/measure/stake-vault-placement.ts`), so an edge can hold capital and report zero positions — 1 of 185 does. The `off-curve` state papers over it and has produced one live sort defect, one live counts defect and one latent caption defect. `getToolUsage` already accepts `curveId`; the blocker is a design question, not a contract change |
| 21 triples stranded on a predicate ARP minted and abandoned | ADR 0030 | testnet only, 2.1e-11 tTRUST; **not migrable**, Intuition has no deletion |
| `apps/web/src/lib/abi/identity-registry.ts` declares `totalAgents()`, which reverts on the canonical registry | unrecorded | needs a task |
| **One identity atom can stand for two agents on 13579**, latent for the sponsor. The canonical recipe names an agent by `chainId:tokenId` without its registry, and 13579 has two ERC-8004 registries (ARP's `0xC165…0d5A`, canonical `0x8004A169…a432`). Agents 6 and 7 already have one atom with two `same as` edges, written by other keys. `resolveIdentityAtomStrict` answers `found` there, and `/identity` would add a second `same as` to an atom another agent holds. Then the two agents' `uses` edges and positions share one subject. Fix: `ambiguous` when an atom has `same as` to more than one CAIP-19, and `/identity` refuses to write onto one. Found by `intuition-integrator`, 2026-11-02, task 50. **Deferred to the mainnet port, ADR `0113`**: refusing outright would let one stranger's edge block an honest agent, so the fix is trusted writers, then the market, then ambiguity | `agent-atom.ts:43-50`, `resolve-subject.ts:62`, `apps/sponsor/src/service.ts` `/identity` | Medium, latent |

## Closed recently

One line each; the ADR or the commit holds the story.

- Two ARP enforcers on mainnet 1155 while three files said none — closed, ADR `0065` (re-checked 2026-10-30).
- `scripts/` outside every gate — closed 2026-10-27, task 21, `416f41e` (`check:scripts`; still linted by nothing).
- A declare-only run left an edge with no position — closed 2026-10-21, ADR `0053`. Residue: 6 positionless atoms on testnet 13579.
- The indexer's silent 250-row cap — fixed 2026-10-21 in `tool-listing.ts`; anything that pages respects `INTUITION_MAX_PAGE`.
- The hackathon `agent-stake-on-use.ts` staked on the atom, not the triple — deleted 2026-10-21 with the hackathon runtimes, `bf20de0`; ADR `0039`.
- The chain toggle reached graph reads only — closed, ADR `0061`. ARP's own contracts stay on 13579 (`rules/portability.md`).
- `--color-fg-40` below AA — closed 2026-10-27, `c5784b7`; `check:contrast` gates it.
- `code.md` required a DOM test framework the repo lacked — closed 2026-10-27, `c5af7fc`, ADR `0063`.
- Term-id links to the block explorer were dead — closed 2026-10-30; they link to Intuition's portal (`intuitionPortalUrl`), the user's decision.
- `vercel.json` built directories that no longer exist — closed 2026-10-30, both files deleted.
- The node accepted one payment for many jobs — closed 2026-10-30, `PaymentLedger` in `apps/node/src/task.ts`.
- The hire receipt had no domain separation — closed 2026-10-30, ADR `0083`.
- Two product tests imported `scripts/` — closed 2026-10-30; they live in `scripts/test/`.
- The GitHub and skills.sh figures were never refreshed — closed locally 2026-10-30, ADR `0084`; `apps/api` is not deployed.
- No testnet agent could declare through the MCP server — closed 2026-10-30, the `registry` argument.
- An MCP plan could not be signed as returned — closed 2026-10-30, `agent-send-plan.ts` reads both spellings.
- `verify-domain-tree.ts` died on a rate limit — closed 2026-10-30, retry with backoff.
- `bun run lint` failed on `solhint: command not found` — closed 2026-11-02, `515bc4b`.
- `arp_probe_endpoint` followed redirects unchecked — closed 2026-11-02, `0a38a93`; names resolved per hop since `8507bda`.

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
  so a cap can be burned on non-recoverable fees.
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
  declare at all until someone writes it. `scripts/agent/agent-identity-atom.ts` writes what the mirror
  would have, from recipes **read off mainnet**. `scripts/agent/agent-send-plan.ts` is the **only script
  here that signs**, and refuses by default. **The first real `uses` edge exists**: chain 13579,
  2026-10-20, `(Agent 13579:3) uses (Trail of Bits — guidelines-advisor)`, edge `0x5999d4d1…`,
  support positionCount **1**, counter 1e6 wei at positionCount **0** — ADR `0042`'s dust, first-party.
  Six calls, 0.00723 tTRUST. Testnet proves the **write**, not the cross-chain join.
  **Coverage**, measured first-party 2026-10-21: Base's next id is **444,562**, the mirror
  reaches **28,720** — unchanged in substance since 2026-09-16 — so coverage is **6.46% and falling**
  (it was 9.2% on 2026-10-20; the denominator grows, the numerator does not). Read it
  with `scripts/measure/cohort-coverage.ts`; the population is read, never hardcoded
  (`scripts/helpers/erc8004-population.ts`).
  **The node ships over stdio** (`--stdio`), one dispatch for both transports, diagnostics on stderr
  because stdout is the protocol channel. New tool `arp_identity` — ask it first; it answers whether
  an agent has the atom everything else needs.
  **Who pins does not matter.** The atom's id is a pure function of the
  agent's identity: CIDv1-raw-sha256 of the schema.org Thing with sorted keys and no whitespace,
  reproduced locally against **two** live mainnet fixtures with no key and no network
  (`packages/protocol/src/declare/agent-atom.ts`). Pinning only makes the document _readable_, anyone
  can pin the same bytes, and ARP's pin is now checked against the local computation and refused on
  a mismatch. Untested: whether Intuition's indexer fetches a third-party pin.
- **0046** — **ARP scores nobody**; it makes staking possible and reads the result. No score, rating
  or assessment of any agent is ever published, because the argument is that the input costs money and
  a score replaces the money with a judgement. **Both halves of its §2 are amended by `0056`**.
  "Never the identity atom" is gone: a deposit there is allowed, named a market, never summed with the edge count. And "a deposit goes on a claim that
  **can be contradicted**" is retracted as a premise: the counter-vault exists and is almost never
  used, 1 of 185 `uses` edges, so ARP creates the edge and does not solicit a deposit on it.
  `(agent, uses, tool)` is still the claim, and still never one triple per interaction.
  The **position** is the measure and the triple only its support, so **no historical cumulative is
  ever displayed**
  (latent today; what is live is the cross-edge sum at `packages/protocol/src/tool-usage.ts:182`). Settles ADR `0015` after
  89 days: its term-ID half stands, its trust-provider half is rejected. Measured first —
  `has trust provider` is 28,683 edges over **three** objects, Deep3 at 99.86%.
- **0045** — **the invariant is the request path, not the runtime.** `docs/12`'s "Not in anyone's
  runtime" carried two claims: ARP ships no code (**already false** — `apps/mcp/src/server.ts`
  hosts the planning an agent depends on) and ARP cannot see execution (**holds**, `docs/14`). ARP
  now **ships a node the operator runs**, holding no key: it prepares, the agent signs. The test is
  mechanical — unplug ARP's servers and every declaration, stake and agent-to-agent call still
  completes.

## Hard constraints

- **Mainnet signing: one canonical statement, in `.claude/rules/security.md`.** Do not read it from
  here. In short — ARP's own funds are never signed for automatically on mainnet (on testnet, only by the
  sponsor relay within its limits, ADR `0092`), while an _agent operator's_
  funds under a delegation they signed are the product (ADR `0036`), and an agent session may sign
  on **testnet 13579** with their key when asked (ADR `0037`).
- Mainnet **deployment** needs explicit per-session confirmation. No ARP **registry** is on mainnet
  and none is planned (`moduleRegistry` and `identityRegistry` are `null` in `data/deployments/1155.json`
  — ADR `0025`). **Two caveat enforcers are**, deployed 2026-09-16 under that same ADR; neither has
  ever fired (ADR `0065`). The mainnet `TrustStakeCapEnforcer` still keys its state the v1 way
  (ADR `0118`); redeploying it is a mainnet deployment.
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
scripts/build/build-claude-index.ts              regenerate the ADR and post-mortem indexes
scripts/verify/verify-pin-key.ts                  validate the partner key, prove recipe determinism
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
