# 47 — When memory falls short: does ARP find a skill Claude does not know?

**Task:** `docs/tasks/52-when-memory-falls-short.md`
**Completed:** 2026-11-02
**Commit:** `e587d33` (branch `feat/52-memory-falls-short`, stacked on PRs #34 and #35)
**Verifier verdict:** PASS on round 2

## What shipped

- `scripts/measure/discovery-eval.ts`, `--suite install`: 14 needs. Every GitHub, npm and PyPI reference in an answer is looked up and classified as a skill/MCP server or not. The summary prints the pass criterion. `--recheck` re-reads the stored answers into a new file without any agent run.
- `scripts/test/discovery-eval.test.ts`: 5 tests covering the extraction forms and the pure classification (`agentByName`).
- `data/measurements/discovery-eval-install-2026-11-02.jsonl`: the raw run, unchanged since round 1 (same md5).
- `data/measurements/discovery-eval-install-2026-11-02-recheck.jsonl`: the same answers and verdicts with the references re-read. The §3 figures come from this file.
- Task file §3 and STATE row 52.

Results: ARP 40/42 (84–99%), no-ARP 6/42 (7–28%), 0 invented in both arms, PASS. Tokens cost 5.19× (4.23–6.23). The judge prefers no-ARP 26/42.

## Surprises

- Round 1 failed. Every figure re-derived exactly, but the prose did not match the raw answers. The extractor read only full GitHub URLs, the form ARP returns. It missed a bare backticked `owner/repo`, `/plugin marketplace add` and `uvx`, the forms an answer from memory uses, so it undercounted only the baseline: 2/42 against a true 6/42. The verdict held either way. What was wrong was the headline figure, and in the direction that flatters ARP.
- Fixing the extractor surfaced the opposite error: `skills/pptx` read as a repository made three ARP answers count as inventing one. A folder-name exclusion fixed it. It was added after looking at data and is disclosed.

## Decisions made

- **Recheck into a new file rather than rewriting the raw run.** This follows ADR `0064`: one raw file per run, never regenerated. The answers and judge verdicts are byte-identical between the two files, and only `refs` differs.
- **Instrument changes after looking at answers are disclosed in §3.** There were two: pip extraction and the classification, added after the aborted smoke run whose output was deleted, and the folder exclusion, added after the recheck. Both were judged fair because neither was tuned on the outcome. Pip only helps the baseline, and the folder rule stops false "invented" flags. They are disclosed anyway.

## Rules touched

- `.claude/rules/claims.md`: sufficient. Check 1 in spirit applied: read the raw answers before stating what the baseline "did", not only the counts. A count from an extractor is only as symmetric as the forms it reads.

## Suggestions for future tasks

- When an eval scores two arms by pattern-matching their output, read a sample of answers that scored zero in each arm before writing a sentence about what that arm did. An extractor written against one arm's style undercounts the other.
- Keep a `--recheck` path in any eval that classifies stored answers, so a scoring fix never needs new agent runs or a rewrite of raw data.
- Record the smoke run. Deleting its output made one disclosure uncheckable.
