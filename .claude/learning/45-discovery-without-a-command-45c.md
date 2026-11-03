# 45 — Discovery without a command (45c, measure before promising)

**Task:** `docs/tasks/45-discovery-without-a-command.md` §45c
**Completed:** 2026-11-02 (45c only; task 45 stays open)
**Commit:** `uncommitted` post-mortem; branch `feat/45c-discovery-eval` at `cd929e9` (eval in `59e4480`)
**Verifier verdict:** PASS (second pass; first pass FAIL on three written claims and two uncommented casts)

## What shipped

- `scripts/measure/discovery-eval.ts` — `claude -p` with and without ARP's MCP (testnet, `ARP_TOOLS=read`), 20 prompts × 3 reps on Sonnet, blind Opus judge, Wilson + seeded bootstrap; `--summarise` re-derives every figure offline
- `data/measurements/discovery-eval-2026-11-02.jsonl` — 120 runs + 60 judgements, 0 failed
- `docs/tasks/45-discovery-without-a-command.md` §45c — result table and reading; STATE.md row; task 49 §3 points at it

## Surprises

- The no-ARP baseline ran 0 web searches in 60 runs and answered from memory in one turn. The web path that task 49 §3 compared against is not the default.
- Consultation passed (13/14 tool prompts, 0/6 others), but ARP runs cost 3.14× the tokens (95% 2.62 to 3.80) and were judged worse in 37 of 42 pairs. No saving is claimable.
- ARP's wins were thinner than the first write-up said: three prompts, not two, and 3 of the 5 were product-photos runs that never consulted ARP.

## Decisions made

- **The user set the pass criteria before the run** (≥10/14, ≤1/6; a saving needs a ratio interval excluding 1 and a judged-loss Wilson upper bound below 0.5). No ADR, recorded in the task file.
- **The "fell back to memory" share was left unmeasured** instead of being quoted from a rough text match. Two ad-hoc regexes gave "about half" and 14/39.

## Rules touched

- `.claude/rules/claims.md` — sufficient. It caught all three first-pass defects: a summary sentence that contradicted the raw judge records, a provenance commit that did not contain the script, and an uncommitted figure.
- `.claude/rules/code.md` — sufficient (the `as` comment rule).

## Suggestions for future tasks

- When a summary sentence names which items produced a result, check it with a `jq` over the raw file, even when every table figure re-derives cleanly.
- A measurement's meta `commit` records HEAD, not the script. Have the script record a dirty-tree flag or the script's hash, so "ran at X" can be checked.
- Do not quote a share from a regex. Either put the classifier in `--summarise` or describe the effect without a number.
