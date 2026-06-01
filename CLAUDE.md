# CLAUDE.md — Router

This file routes you to the right rules, skills, agents, and prior decisions for the task at hand. **It contains no rules itself.** Rules live in `.claude/rules/`. Decisions live in `.claude/choices/`. Lessons live in `.claude/learning/`.

If you find yourself wanting to add a rule to this file, **don't.** Add it to the matching file in `.claude/rules/` and update `.claude/rules/00-INDEX.md`.

## Source of authority (read in this order on every task)

1. `docs/00_HACKATHON_PIVOT.md` — current strategic commitment (MetaMask Dev Cook-Off, deadline 2026-06-15). Supersedes any conflicting item in older docs for the duration of the hackathon.
2. `docs/02_ARCHITECTURE.md` — locked architectural decisions.
3. `docs/03_MVP_SCOPE.md` — extended (not replaced) by the pivot.

If three layers conflict, the higher-numbered (= more recent) wins. The original docs remain authoritative for anything the pivot doesn't address.

## Read order at the start of every task

1. This file.
2. The task file in `tasks/`. Note its `Required skills` and `Do not do in this task` sections.
3. The three source-of-authority docs above, in order.
4. `docs/01_PROJECT_CONTEXT.md` for framing.
5. The rules from `.claude/rules/` that match the task type (see routing table below).
6. The global skills listed in the task's `Required skills` section.
7. `.claude/skills/arp/SKILL.md`.
8. Scan `.claude/choices/` for ADRs that touch this area.
9. Scan `.claude/learning/` for post-mortems on similar prior tasks.

## Routing table — what to load by task type

| If the task touches… | Rules | Global skills | Local skill | Agent |
|---|---|---|---|---|
| Solidity (`contracts/`) | `code.md`, `solidity.md`, `security.md` | `ethskills`, `secure-workflow-guide`, `guidelines-advisor` (and `token-integration-analyzer` if a token is involved) | `arp` | `contract-reviewer` |
| Caveat enforcers (Task 02b) | `code.md`, `solidity.md`, `security.md`, `metamask-delegation.md` | **Canonical**: `mms-smart-accounts-kit` (read `references/delegations.md` first — authoritative on `ICaveatEnforcer` interface). Plus: `ethskills`, `secure-workflow-guide`, `guidelines-advisor`, `mms-gator-cli` (CLI-driven testing). **Supplementary**: `docs/06_BEAR_TRAP_REFERENCE.md` for patterns, test density, security checklist — MetaMask wins on any conflict. | `arp` | `contract-reviewer` |
| MetaMask Smart Accounts / delegation / x402 (Tasks 03b, 04b) | `code.md`, `ui.md`, `metamask-delegation.md` | **Canonical**: `mms-smart-accounts-kit` + https://docs.metamask.io/smart-accounts-kit/. Plus: `ethskills`, `mms-gator-cli`. | `arp` | `ui-reviewer` (UI side) + manual SDK-vs-docs check |
| TypeScript or UI (`app/`) | `code.md`, `ui.md` | — | `arp` | `ui-reviewer` |
| Intuition atoms / triples / queries / staking | `code.md` | `intuition` (vendored at `.claude/skills/intuition/` — includes `operations/` and `reference/` subdirs) | `arp` | `intuition-integrator` |
| Deployment scripts | `code.md`, `solidity.md`, `security.md` | `ethskills` | `arp` | `contract-reviewer` (review the script, not just contracts) |
| Docs only | — | — | `arp` (for tone and framing) | — |
| Any task — at the end | `workflow.md` | — | — | `task-verifier` (**mandatory**) |
| Hackathon tasks (02b, 03b, 04b, 05b) | + narrative check (see below) | — | — | `task-verifier` requires the narrative answer |

Load only rules that match. Loading the full rules folder for every task defeats the purpose of splitting them.

## Mandatory: end-of-task verification

Every task ends with a `task-verifier` agent call before you declare it done. The agent reads the task spec, the relevant rules, and the deliverables on disk, then returns pass/fail.

- **Pass** → the agent writes a post-mortem to `.claude/learning/NN-task-slug.md`. Mark the task file with a completion note.
- **Fail** → fix the punch list returned by the agent and re-run. Do not declare the task complete.

See `.claude/agents/task-verifier.md` for the agent's procedure.

### Narrative-preservation check (hackathon tasks only)

For tasks **02b, 03b, 04b, 05b**, the completion report must answer one extra question in one sentence:

> *Does this preserve the hackathon submission narrative?*

The narrative is in `docs/00_HACKATHON_PIVOT.md`. If the answer is "no", the implementation has drifted and needs review before merging. The `task-verifier` agent enforces this on hackathon-tagged tasks.

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

- **Default deployment target is Intuition Testnet** (changed from Base Sepolia per the hackathon pivot). Mainnet remains explicitly out of scope.
- **Do not deploy to mainnet without explicit user confirmation per session.**
- **Do not commit secrets** (`.env`, private keys, API keys).
- **Do not silently expand scope.** When in doubt, stop and ask. See `.claude/rules/workflow.md` for the scope discipline rule in full. The pivot doc has an explicit out-of-scope list — re-read it before adding anything.
- **Hackathon deadline: 2026-06-15 at 10:59 UTC.** Hard. Reward announcement 2026-06-22.

Everything else is in `.claude/rules/`. Open the rule file you need for the task you're doing — not all of them.

## Directory map

```
ARP/
├── CLAUDE.md                          ← you are here (router only)
├── docs/                              project specification
│   ├── 00_HACKATHON_PIVOT.md         (current strategic commitment — supersedes conflicts)
│   ├── 01_PROJECT_CONTEXT.md
│   ├── 02_ARCHITECTURE.md            (locked decisions)
│   ├── 03_MVP_SCOPE.md               (extended by 00)
│   ├── 04_SEED_MODULES.md
│   ├── 05_UI_DESIGN.md
│   └── 06_BEAR_TRAP_REFERENCE.md     (supplementary example for Task 02b — MetaMask is canonical)
├── tasks/                             atomic task files
├── contracts/                         Solidity (Foundry)
├── app/                               TypeScript UI
├── schemas/                           JSON Schemas for modules
├── deployments/                       per-chain deployment records
└── .claude/                           Claude operating layer
    ├── README.md                      (this directory explained)
    ├── rules/                         domain-split rules
    │   ├── 00-INDEX.md
    │   ├── code.md
    │   ├── solidity.md
    │   ├── ui.md
    │   ├── security.md
    │   ├── workflow.md
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
    │   ├── README.md
    │   └── TEMPLATE.md
    └── choices/                       append-only ADRs
        ├── README.md
        ├── TEMPLATE.md
        ├── 0001-claude-meta-architecture.md
        ├── 0002-hackathon-pivot-metamask-cookoff.md
        ├── 0003-metamask-skills-vendored-locally.md
        └── 0004-bear-trap-as-enforcer-reference.md
```

For the rationale behind this structure, see `.claude/choices/0001-claude-meta-architecture.md`.
