# 56 — The pulse: what a skill implies, and what agents wrote about it

**Task:** `docs/tasks/63-the-pulse.md`
**Completed:** 2026-11-05
**Commit:** `0dc8dc4` (branch `feat/pulse`, not pushed)
**Verifier verdict:** PASS (fourth pass; the fourth checked only the third pass's three edits and the gates they touch)

## What shipped

- `packages/protocol/src/pulse.ts`, `pulse-usage.ts` — read a skill from the files an install takes; read what wallets wrote about it.
- `apps/mcp/src/handlers/pulse.ts` — `arp_pulse`, with the search through a pinned package, or the caller's `search_output`.
- `apps/web/src/pages/PulsePage.tsx` — the same facts at `/pulse/:owner/:repo/:skill`. A route in an app that is not hosted.
- A declaration's domain and outcome, testnet 13579 only. ADR `0135`.
- `scripts/measure/pulse-read.ts`, `pulse-eval.ts`, `pulse-eval-summary.ts`, `scripts/demo/pulse-walk.ts`, with raw output in `data/measurements/pulse-*-2026-11-05.*`.
- `docs/22_RUNNING_THE_NODE.md`, `apps/mcp/README.md` — what the search package reaches and where its directory is.

## Surprises

**The lesson: reviews and the verifier found a security defect, a false note on a real declaration, and three design faults that passing tests did not.** The tests held what they were written to hold. None of these was a case anyone had written.

| What | Where it was | How it surfaced, on the record |
| --- | --- | --- |
| Security: the search ran an unpinned npm package with the server's whole environment, and `docs/22` said the server executes nothing | `arp_pulse`, reachable on every call with a `query`; no misuse known | `task-verifier`, and neither review had raised it (task §7, `ada7261`) |
| A false note: the walk's row for `cut-silences` says a script is not in the repository. It is; only the skill's directory had been fetched | the local file `pulse-walk-2026-11-05.jsonl`, beside a real declaration on 13579. The note is not on chain. The declared failure stands for another reason, read and not run | A later row corrects it three minutes after. The record does not name who caught it |
| Design: a declared failure lifted a skill to the top, because the order counted declarations | the ordering | Task §6, `e8584da` |
| Design: filtering on `runs` set aside the one skill that had worked, over a shell variable named `end`, and a word filter flagged "No track needs an API key" | `setAsideBecause` | Task §6. `e4a2afc` and the code comment credit the comparison run |
| Design: writing a qualifier first could silence the declarer | the plan and the reader | `intuition-integrator` (task §6, ADR `0135`) |

Task §6 files all three design faults under "What the reviews changed". For the second, the commit says a measurement showed it. Whether the suite was green at each of these commits was not re-run for this entry.

Later passes kept finding the same family: a home in a shared `/tmp`, where another account could plant the `.npmrc` that chooses npm's registry (`c6784a0`); a README still saying the server executes nothing (same commit); a directory missing from the list of "every file it creates"; a path that ignored `ARP_HOME`; a directory mode that `mkdirSync` does not tighten when the directory exists.

Others: `skills@1.7.4` returns 20 results where 1.7.6 returns 100, which hid the declared skill (`75ca1ec`). Free words miss what is declared: 6 of B's 9 free-word runs saw no declaration, so the search is the bottleneck. The walk created `video-editing`'s atom without pinning it, so a graph reader sees `Unknown`.

## Decisions made

- **A skill's pulse is read on demand, identified by its content.** ADR: `.claude/choices/0134-a-skills-pulse-is-read-on-demand.md`.
- **A declaration can carry a domain and an outcome, closed vocabulary, written by the declarer, testnet only.** ADR: `.claude/choices/0135-a-declaration-can-carry-a-domain-and-an-outcome.md`. A mainnet port is blocked until a writer's control of the agent is proven.
- **Only a named key, a declared CLI or a script sets a skill aside.** A word match is listed for the agent to check.
- **The order is one visible fact,** wallets that said it worked in the domain, then the search's own. No composed score.

## Rules touched

- `.claude/rules/claims.md` — sufficient. Check 1 and check 4 apply as written: `task-verifier` caught statements about execution that the code had made false.
- `.claude/rules/portability.md` — sufficient. The protocol logic is in `packages/protocol/`.
- `.claude/rules/code.md` — sufficient. `search()` is private, so nothing holds its directory: see below.
- `.claude/rules/workflow.md` — sufficient.

## Suggestions for future tasks

- When a tool starts running somebody else's code, grep every sentence that says it runs nothing, and list its directory, variables and connections in `docs/22` in the same commit.
- Treat a free-text note beside a paid declaration as a claim: fetch the whole repository before saying a file is absent from it.
- Run a real session against an ordering or a filter before calling it done. A unit test states what its author expected, and these faults were outside that.
- `search()` has no test for `ARP_HOME` or for `chmod`. The fourth pass ran it once by hand, on a directory at 755 under a scratch `ARP_HOME`: it ended at 700 holding `.npm`. Export the path's construction if this needs holding.
- `docs/22` lines 283 and 490 describe `ARP_HOME` without the search package's directory. Incomplete, not false; line 129 states it.

## Evidence ladder

**Which tier of the evidence ladder does this serve, and does it move ARP up it?**

It serves the "staked" tier: a declaration can now say in what domain and with what outcome, and paid-for lines changed an agent's choice in a small test on testnet, but it does not move ARP up to "proven", because no third party has written anything and no contract checks a line.
