# 0086 — The repo is sorted by kind: code, data, docs, scripts

**Status:** Accepted
**Date:** 2026-10-30
**Triggered by:** user request — « tout ranger », scripts, docs, design, tasks, deployments, catalogue

## Context

The root held fourteen entries besides config: code (`apps/`, `packages/`, `contracts/`), three folders
of committed data, a task folder, two design handoffs, a loose handoff file and an ignored paste of a
partner guide. `scripts/` held thirty flat files beside four subfolders. Nothing was wrong in any one
place; the layout said nothing about what kind of thing a folder holds.

## Decision

Four kinds, four homes. Code stays where it is. Data goes under `data/`, documents under `docs/`, and
the flat scripts into a subfolder named for what each one does.

| was                           | is                                         |
| ----------------------------- | ------------------------------------------ |
| `catalogue/`                  | `data/catalogue/`                          |
| `deployments/`                | `data/deployments/`                        |
| `measurements/`               | `data/measurements/`                       |
| `tasks/`                      | `docs/tasks/`                              |
| `arp-design-handoff/`         | `docs/design/arp-design-handoff/`          |
| `arp-motion-reference/`       | `docs/design/arp-motion-reference/`        |
| `arp-claim-field-handoff.md`  | `docs/design/arp-claim-field-handoff.md`   |
| `docs/ARP Agent Page.html`    | `docs/design/ARP Agent Page.html`          |
| `integration8004.txt` (ignored) | `docs/reference/integration8004.txt`     |
| `scripts/agent-declare-used.ts`, `agent-identity-atom.ts`, `agent-send-plan.ts`, `register-agent.ts` | `scripts/agent/` |
| `scripts/seed-*.ts`, `record-*.ts`, `retire-domain-edge.ts`, `pin-tool.ts`, `rig-registration-files.ts` | `scripts/seed/` |
| `scripts/build-*.ts`          | `scripts/build/`                           |
| `scripts/verify-*.ts`, `audit-skill-tags.ts` | `scripts/verify/`           |
| `scripts/demo-*.ts`           | `scripts/demo/`                            |
| `scripts/deploy.sh`, `send-plan-in-waves.sh` | `scripts/deploy/`           |
| `scripts/erc8004-population.ts` | `scripts/helpers/` — a module only `verify-cohort` imports, not a CLI |

File names did not change, so a bare mention such as `demo-hire.ts` still finds its file.

**Append-only records were rewritten, paths only.** ADRs, post-mortems, task files and measurement
JSON had every moved path updated, and no other word changed. That was the user's decision, taken
against the alternative of leaving every old path in `.claude/` dead. A path is a pointer, not a
claim, so the append-only rule protects what a record *says*, and a dead pointer protects nothing.
**This table is the way back.** Read an old commit's paths through it.

Not rewritten, on purpose: sentences that describe an earlier move as it was (ADR `0082`'s "every
`../../../deployments/` import"), and mentions of scripts deleted long before this move
(`agent-loop.ts`, `agent-stake-on-use.ts`). Those name things that no longer exist at any path.

## How it was done

`git mv` for every tracked file, one commit per group. A one-off rewriter handled two kinds of
reference:

- **Root-relative paths in prose and commands.** It rewrote them through the table. A folder name was
  only rewritten when followed by `/`, or when it stood alone in backticks: `catalogue` is also an
  English word, and the first dry run rewrote 219 occurrences of the word.
- **Relative specifiers.** Each one was resolved against the file's *old* location, checked to exist
  in the old tree, then re-derived from the new location.

Three root computations were not specifiers, so they were fixed by hand:

- `build-claude-index.ts` `new URL('..')`;
- `deploy.sh` `dirname "$0"/..`;
- the sandbox's planner calls.

One template literal had to be fixed by hand as well: `catalogue-atom-ids.ts`
`` `../../catalogue/skills-${id}.json` ``.

After each group, every gate came back green:

- protocol 613, web 587, mcp 27, node 21, api 14, hook 8, graphql 8, scripts 17;
- `check:scripts`, `check:tokens`, `check:contrast`;
- `tsc -b` and `eslint` over `apps/web`;
- `forge build`.

## Alternatives considered

- **Only the root and `scripts/`** — half the rewrites, but `catalogue/`, `deployments/` and `tasks/`
  would still sit beside code. Offered and declined.
- **Leave the append-only records untouched and ship only this table** — every old link in `.claude/`
  dead, and an agent orienting itself from `STATE.md` would follow them first. Declined.

## Consequences

**Positive:**

- The root lists `apps packages contracts data docs scripts skills` and config, nothing else.
- A script's folder says what running it does.

**Negative:**

- Any branch cut before this move conflicts on every rewritten file.
- Any shell history, or a sandbox generated before this move, carries the old paths.
  `/home/max/arp-sandbox/bin/arp-sign` was patched by hand. A regenerated sandbox gets the new paths
  from `scripts/sandbox/setup.ts`.

**Neutral (worth knowing):**

- `docs/design/arp-design-handoff/arp-design-handoff 2/` is a second, older copy of the handoff that
  was already tracked before this move. It moved as it was, and it is not reconciled here.
