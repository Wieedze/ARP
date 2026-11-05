# Task 69 — The positioning: what ARP says in public

**Status:** parts 1 and 2 verified 2026-11-05 (`task-verifier` PASS, post-mortem `.claude/learning/58-the-positioning.md`), on `feat/pulse`. The landing's deposit scenes and the pitch in `ARP-business-dev` are left to the user.
**ADR:** `0142`.
**Rules:** `workflow.md`, `claims.md`.
**Reviewers:** `task-verifier`.

## Scope of this part

The user approved doing steps 1 and 2 first, then reading before any commit.

1. `docs/30_THE_POSITIONING.md` and ADR `0142`.
2. New wording in `README.md`, `skills/arp/SKILL.md`, `apps/mcp/README.md`, and `apps/cli/scripts/packages.ts` with what it generates.
3. `scripts/measure/line-writers.ts`, the check for the one claim that will expire. Raw output `data/measurements/line-writers-2026-11-05T1734.json`: on 13579, 5 of 5 result lines are from our two wallets, and 146 of 185 `uses` edges are not.

## Part 2, the user's « fais tout ça », 2026-11-05

The server's instructions, the sponsored tool's text, the landing page's headline and label, `docs/01`, `docs/12`. The landing page's deposit scenes are not changed. Nothing in `ARP-business-dev`, which is public: the argument went to a private doc, and the pitch keeps its text until the user chooses.

**Corrected by the user during part 2:** add and refine, do not replace. `README.md` got back Find, Use, Vouch and the 40 of 42 figure with its 26 of 42, and `docs/01` its one-liner. The landing page changed sentences only, with the user's leave.

## Do not do in part 1

`apps/mcp/src/server.ts`, `Landing.tsx`, `docs/01`, `docs/12`, `ARP-business-dev`, any commit, any merge, any change to what a tool does. This task writes the argument in neither public repository. `docs/29` line 11 and an untracked note in `ARP-business-dev` carry it in other sessions' working copies: neither is committed by this task.

## Gates

- `bun run --cwd apps/cli packages --check`, and `apps/cli` tests. `apps/mcp`'s tests do not cover this wording.
- `packaging/claude/arp/bin/hook.js` also moved in this regeneration, from `arp-7c`'s uncommitted hook work (`docs/tasks/68`). It is not part of this task: commit it with task 68.

## Evidence ladder

Tier 3, staked: the public text stops implying that third parties have staked on results, and it does not move ARP up.
