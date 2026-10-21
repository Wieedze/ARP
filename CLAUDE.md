# CLAUDE.md — Router

This file routes you to the right rules, skills, agents, and prior decisions for the task at hand. **It contains no rules itself.** Rules live in `.claude/rules/`. Decisions live in `.claude/choices/`. Lessons live in `.claude/learning/`.

If you find yourself wanting to add a rule to this file, **don't.** Add it to the matching file in `.claude/rules/` and update `.claude/rules/00-INDEX.md`.

## Source of authority (read in this order on every task)

1. `docs/12_THE_IDEA.md` — **the mechanism, and the only canonical statement of it.** Short enough to read in full, and that is the point. Read it first, every time, including its drift signals. It exists because three separate analyses written in one day each drifted from it.
   - `docs/01_PROJECT_CONTEXT.md` — what ARP is and is not. Still authoritative on positioning.
   - `docs/08`, `docs/09`, `docs/11` are **analysis, not commitment**. The measurements in `08` hold. Their differentiation arguments drifted; `12` corrects them.
   - `docs/00_HACKATHON_PIVOT.md` is **historical record** — why the MetaMask/Intuition stack was chosen. Deadline passed 2026-06-15.
2. `docs/02_ARCHITECTURE.md` — locked architectural decisions.
3. `docs/03_MVP_SCOPE.md` — extended (not replaced) by the pivot.

If three layers conflict, the higher-numbered (= more recent) wins. The original docs remain authoritative for anything the pivot doesn't address.

## Read order at the start of every task

1. This file.
2. **`.claude/STATE.md`** — where the project actually is: branch, task table, known defects, the
   recommended order, and the claim checks. One read instead of the whole of `.claude/choices/`
   and `.claude/learning/`.
   It is hand-maintained, so a task does not close without updating it.
3. The task file in `tasks/`. Note its `Required skills` and `Do not do in this task` sections.
4. The three source-of-authority docs above, in order.
5. `docs/01_PROJECT_CONTEXT.md` for framing.
6. The rules from `.claude/rules/` that match the task type (see routing table below).
7. The global skills listed in the task's `Required skills` section.
8. `.claude/skills/arp/SKILL.md`.
9. Scan `.claude/choices/INDEX.md` for ADRs that touch this area — generated, so rerun
   `scripts/build-claude-index.ts` after adding one.
10. Scan `.claude/learning/INDEX.md` for post-mortems on similar prior tasks.

## Routing table — what to load by task type

| If the task touches…                                         | Rules                                                             | Global skills                                                                                                                                                                                                                                                                                                                                                                | Local skill                  | Agent                                                           |
| ------------------------------------------------------------ | ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- | --------------------------------------------------------------- |
| Solidity (`contracts/`)                                      | `code.md`, `solidity.md`, `security.md`                           | `ethskills`, `secure-workflow-guide`, `guidelines-advisor` (and `token-integration-analyzer` if a token is involved)                                                                                                                                                                                                                                                         | `arp`                        | `contract-reviewer`                                             |
| Caveat enforcers (Task 02b)                                  | `code.md`, `solidity.md`, `security.md`, `metamask-delegation.md` | **Canonical**: `mms-smart-accounts-kit` (read `references/delegations.md` first — authoritative on `ICaveatEnforcer` interface). Plus: `ethskills`, `secure-workflow-guide`, `guidelines-advisor`, `mms-gator-cli` (CLI-driven testing). **Supplementary**: `docs/06_BEAR_TRAP_REFERENCE.md` for patterns, test density, security checklist — MetaMask wins on any conflict. | `arp`                        | `contract-reviewer`                                             |
| MetaMask Smart Accounts / delegation / x402 (Tasks 03b, 04b) | `code.md`, `ui.md`, `metamask-delegation.md`                      | **Canonical**: `mms-smart-accounts-kit` + https://docs.metamask.io/smart-accounts-kit/. Plus: `ethskills`, `mms-gator-cli`.                                                                                                                                                                                                                                                  | `arp`                        | `ui-reviewer` (UI side) + manual SDK-vs-docs check              |
| TypeScript or UI (`app/`)                                    | `code.md`, `ui.md`                                                | —                                                                                                                                                                                                                                                                                                                                                                            | `arp`                        | `ui-reviewer`                                                   |
| Intuition atoms / triples / queries / staking                | `code.md`, `portability.md`                                       | `intuition` (vendored at `.claude/skills/intuition/` — includes `operations/` and `reference/` subdirs)                                                                                                                                                                                                                                                                      | `arp`                        | `intuition-integrator`                                          |
| Deployment scripts                                           | `code.md`, `solidity.md`, `security.md`                           | `ethskills`                                                                                                                                                                                                                                                                                                                                                                  | `arp`                        | `contract-reviewer` (review the script, not just contracts)     |
| Docs only                                                    | —                                                                 | —                                                                                                                                                                                                                                                                                                                                                                            | `arp` (for tone and framing) | —                                                               |
| Any task — at the end                                        | `workflow.md`, `claims.md`                                        | —                                                                                                                                                                                                                                                                                                                                                                            | —                            | `task-verifier` (**mandatory**)                                 |
| Any task — at the end                                        | `workflow.md`, `claims.md`                                        | —                                                                                                                                                                                                                                                                                                                                                                            | —                            | `task-verifier` requires the evidence-ladder answer (see below) |

Load only rules that match. Loading the full rules folder for every task defeats the purpose of splitting them.

## Mandatory: end-of-task verification

Every task ends with a `task-verifier` agent call before you declare it done. The agent reads the task spec, the relevant rules, and the deliverables on disk, then returns pass/fail.

- **Pass** → the agent writes a post-mortem to `.claude/learning/NN-task-slug.md`. Mark the task file with a completion note.
- **Fail** → fix the punch list returned by the agent and re-run. Do not declare the task complete.

See `.claude/agents/task-verifier.md` for the agent's procedure.

### Evidence-ladder check (every task)

Every completion report answers one extra question in one sentence:

> _Which tier of the evidence ladder does this serve, and does it move ARP up it?_

The ladder is `docs/09_POSITIONING_AND_PLAN.md` §3 — asserted, rated, staked, proven. ARP's position is the last two. If a task cannot name a tier, it has drifted and needs review before merging. The `task-verifier` agent enforces this.

This replaces the hackathon narrative-preservation check (ADR `0022`). Task files 02b–05b still reference the old check in their headers; they are complete and left as historical record.

### Claim check (every task, every answer with a number in it)

`.claude/rules/claims.md`, ADR `0031`. Added because six statements in one session were wrong while
every underlying measurement was right — the break was the step from a measurement to a sentence.

1. **Reachability before blast radius.** A wrong branch nothing reaches is _latent_, not live. Say which.
2. **One number, one context.** Name the chain, the date, the population. Never sum across chains.
3. **Cite third parties** to a file and a line, or do not write the claim.
4. **Confirm a gate's scope covers your change** before calling it green. `tsc -b` over `app/src`
   says nothing about `scripts/`.
5. **Grep the old wording before committing a retraction or a changed count.** ADR `0043` — three
   corrections in two review rounds each landed at one site out of two or four, and the surviving
   copy was the one other files pointed at.

Commit the script, not the number. Quote the interval, not the point, when n is small.

## When to write an ADR

If during a task you make a non-obvious decision — a design tradeoff, a deviation from an obvious approach, an architectural choice not pre-specified — write an ADR in `.claude/choices/` using the template. Cross-link it from the task's post-mortem.

See `.claude/choices/README.md` for when an ADR is and isn't warranted.

## When to update a rule

If a feedback loop with the user (or a post-mortem) reveals a missing or wrong rule:

1. Edit the rule file in `.claude/rules/`.
2. Write an ADR in `.claude/choices/` recording the change and the reason.
3. If the change came from a post-mortem, link the post-mortem in the ADR.

Rules do not change silently. The audit trail is the point.

## Hard constraints (the very few that belong in the router)

- **Default deployment target is Intuition Testnet** (changed from Base Sepolia per the hackathon pivot). Mainnet **deployment** remains out of scope; mainnet transactions are the separate question below.
- **Do not deploy to mainnet without explicit user confirmation per session.**
- **Do not commit secrets** (`.env`, private keys, API keys).
- **Do not silently expand scope.** When in doubt, stop and ask. See `.claude/rules/workflow.md` for the scope discipline rule in full. The pivot doc has an explicit out-of-scope list — re-read it before adding anything.
- **Mainnet: deployment vs transactions are different questions.** No ARP contract is on mainnet and none is planned. ADR `0017` authorises one narrow class of mainnet transaction — deposits into existing `has trust provider` vaults, signed by the operator. **Mainnet signing has exactly one canonical statement, in `.claude/rules/security.md` — read it
  there rather than from a restatement.** Summary: ARP's own funds are never signed for automatically;
  an _agent operator's_ funds, under a delegation they signed, are the product (ADR `0036`). This
  bullet said "no agent or script may ever sign a mainnet transaction", which forbids `docs/12`
  points 3 and 5.

Everything else is in `.claude/rules/`. Open the rule file you need for the task you're doing — not all of them.

## Directory map

```
ARP/
├── CLAUDE.md                          ← you are here (router only)
├── docs/                              project specification
│   ├── 00_HACKATHON_PIVOT.md         (historical record — why the MetaMask/Intuition stack)
│   ├── 01_PROJECT_CONTEXT.md         (positioning — still authoritative)
│   ├── 02_ARCHITECTURE.md            (locked decisions)
│   ├── 03_MVP_SCOPE.md
│   ├── 04_SEED_MODULES.md
│   ├── 05_UI_DESIGN.md
│   ├── 06_BEAR_TRAP_REFERENCE.md     (supplementary example for Task 02b — MetaMask is canonical)
│   ├── 07_INTUITION_ERC8004_PARTNER_GUIDE.md  (vendored Intuition partner guide — ADR 0015)
│   ├── 08–11                         (analysis, not commitment — see "Source of authority")
│   ├── 12_THE_IDEA.md                (THE canonical mechanism — read first)
│   ├── 13_THE_THREE_FLOWS.md
│   ├── 14_THE_WITNESS_PROBLEM.md
│   └── 15_ROADMAP.md
├── tasks/                             atomic task files
├── contracts/                         Solidity (Foundry)
├── packages/
│   └── protocol/                      `@arp-protocol/core` — THE PROTOCOL LAYER (ADR 0041)
│       ├── src/                       identity, graph, verifier, tool usage, declare/stake plans.
│       │                              Never signs, never sends (ADR 0038); no chain constant
│       └── src/arp/                   ARP's OWN contracts (the folded-in `sdk/`) — the one place
│                                      here that names a chain: `TESTNET_DEPLOYMENT`
├── app/                               TypeScript UI. Bound to testnet at module load, deliberately
├── scripts/                           flat `.ts` — measure-*, agent-*, verify-*. Inside no
│                                      typecheck and no lint (tasks/21)
├── skills/arp/SKILL.md                **publishable** — how to USE ARP with nothing installed
│                                      (ADR 0052). Not `.claude/skills/arp/`, which is how to
│                                      work ON this repo
├── schemas/                           JSON Schemas for modules
├── deployments/                       per-chain deployment records
└── .claude/                           Claude operating layer
    ├── README.md                      (this directory explained)
    ├── STATE.md                       ← **read this second, after CLAUDE.md**
    ├── rules/                         domain-split rules
    │   ├── 00-INDEX.md
    │   ├── code.md
    │   ├── solidity.md
    │   ├── ui.md
    │   ├── security.md
    │   ├── workflow.md
    │   ├── claims.md                  (every task, at the end — ADR 0031)
    │   ├── portability.md             (anything touching a chain — testnet is a rehearsal)
    │   └── metamask-delegation.md     (Tasks 02b, 03b, 04b)
    ├── skills/
    │   ├── arp/SKILL.md
    │   ├── intuition/                 (vendored — Intuition protocol procedural knowledge)
    │   ├── mms-smart-accounts-kit/    (vendored from github.com/MetaMask/skills — do not edit)
    │   ├── mms-gator-cli/             (vendored from github.com/MetaMask/skills — do not edit)
    │   └── mms-oh-my-opencode/        (vendored, scoped to OpenCode — not used here)
    ├── agents/
    │   ├── task-verifier.md          (mandatory end-of-task)
    │   ├── contract-reviewer.md
    │   ├── ui-reviewer.md
    │   └── intuition-integrator.md
    ├── learning/                      append-only post-mortems
    │   ├── INDEX.md                   (generated — scripts/build-claude-index.ts)
    │   ├── README.md
    │   └── TEMPLATE.md
    └── choices/                       append-only ADRs
        ├── INDEX.md                   (generated — scripts/build-claude-index.ts)
        ├── README.md
        ├── TEMPLATE.md
        └── NNNN-*.md                  (one per decision — list them from INDEX.md)
```

For the rationale behind this structure, see `.claude/choices/0001-claude-meta-architecture.md`.
