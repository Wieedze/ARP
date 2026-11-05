# 59 — The field memory: a failure the hook sees, read back at the next search

**Task:** `docs/tasks/68-the-field-memory.md`, phases 1 to 4. Phases 5 and 6 are not started and are out of this close.
**Completed:** 2026-11-05
**Commit:** `uncommitted` (branch `feat/pulse`, other sessions have uncommitted work in the same tree)
**Verifier verdict:** PASS on the fourth pass. FAIL with 17 items, FAIL on 3, then this pass, which checked only those 3, the removed names and the affected gates.

## What shipped

- `apps/hook/src/skill-failure.ts` — a failed Bash command a skill of the session asks for writes one closed reason to `~/.arp/failures.jsonl`.
- `apps/hook/src/backfill.ts`, `arp backfill` in `apps/cli/src/cli.ts` — the same rule over old Claude Code transcripts. Sends nothing.
- `packages/protocol/src/local-failures.ts` — reads the file for one skill.
- `apps/mcp/src/handlers/pulse.ts`, `apps/mcp/src/tools.ts` — `failed_on_this_machine` on a skill in `arp_pulse`: sessions per reason, last date, `matched_by_name_only`.
- `apps/cli/test/cli.test.ts` — the packaged hook imports nothing but `node:`. `packaging/claude/arp/bin/hook.js` regenerated.
- `.claude/choices/0140-*.md`, a file entry and an env var line in `docs/22_RUNNING_THE_NODE.md`.

## Surprises

- All tests passed while the packaged hook crashed outside the repo: importing `arpHome` pulled viem in, and the repo has viem. Only running it elsewhere showed it.
- The first regexes read free output as if it were an error message. `3 failed, 403 passed` wrote `missing-key` through the packaged hook, and no test held such a string. The tests had only strings the regexes were written for.
- Attribution had boundary bugs a passing suite did not show: `/s/pdf` matched `/s/pdf-tools`, `a.py` matched `data.py`, and a path with a space was cut at the space.
- In the backfill, a `Skill` call that brought no body gave its name to the next skill loaded.
- The verifier's own count (`0 of 24`) was copied into the task as "script not committed", the objection it had just raised about another figure. Now it is the command and a dated result.
- `mkdirSync(recursive)` on `/proc/nope` spins forever. Unrealistic path, and only the hook's 10 s timeout would stop it.

## Decisions made

- **Only failures are automatic, and never `worked`.** ADR: `.claude/choices/0140-the-hook-records-a-skills-failure-and-only-that.md`.
- **Session-long attribution by program is stated, not bounded**, until real lines show the problem (§5, ADR `0140`). Excluding common programs would lose real failures.
- **Regex misreads are stated rather than chased**: `expected status 403, got 200` still reads as `missing-key` (§5).

## Rules touched

- `.claude/rules/claims.md` — sufficient. Checks 3 and 5 caught the credit wording and the stale count.
- `.claude/rules/code.md` — sufficient.
- `.claude/rules/workflow.md` — sufficient.

## Suggestions for future tasks

- A regex over free output gets tests with strings it must not match, taken from real output, before the ones it must match.
- A hook that ships bundled is run once from a folder with no `node_modules`.
- Before citing another project in a public file, decide whether that document will be published.

## Evidence ladder

**Which tier of the evidence ladder does this serve, and does it move ARP up it?**

It serves asserted and does not move ARP up: the line is the runtime's record of a failure rather than the agent's recollection, but it is kept locally and can be forged.
