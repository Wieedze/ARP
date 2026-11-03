# 46 — A quieter search: every word must match

**Task:** `docs/tasks/51-quiet-search.md`
**Completed:** 2026-11-02
**Commit:** `70c1dff`, claims fixes in `55ad471` (branch `feat/51-quiet-search`)
**Verifier verdict:** PASS on the second pass

## What shipped

- `apps/mcp/src/tool-search.ts` — `relevance` is zero unless every non-filler word matches; `FILLER` list.
- `apps/mcp/src/handlers/find-tools.ts` — `domains_available` only on a `domain` search that finds nothing.
- `apps/mcp/src/tools.ts` — description: one or two words, every word must match, empty means answer from memory.
- `apps/mcp/test/tool-search.test.ts`, `server.test.ts` — missing-word, filler, and empty-query cases.
- `scripts/measure/discovery-eval.ts` — records `toolInputs` (first 200 chars of each call's input).
- `data/measurements/discovery-eval-2026-11-02T2015.jsonl` — the re-measure, meta commit `f6fa9b7`.

## Surprises

- The change barely moved the cost. Cost ratio went from 1.84 (95% 1.57 to 2.15) to 1.46 (1.30 to 1.63),
  and the intervals overlap. Turns rose from 2.7 to 2.9. Before this change the eval could not show why.
  `toolInputs` showed it: agents retry with other words or `domain`s (uptime: 4 calls in every rep), and the
  domain path, which did not change, still answers Stripe with `domain: payment`.
- First-pass fail was two claims slips. An enumeration listed 3 of 4 calls next to the count "4". A probe
  figure was labelled in the task file but not in the ADR.

## Decisions made

- **Every word must match, filler ignored; no `domains_available` after an empty free-text query.** ADR: `.claude/choices/0111-a-query-must-match-every-word.md`.

## Rules touched

- `.claude/rules/claims.md` — sufficient. Check 2 (context on a figure) caught the unlabelled ADR copy. Check 6
  (the reader can re-check) caught the incomplete enumeration.
- `.claude/rules/code.md` — sufficient.

## Suggestions for future tasks

- Check every enumeration against the raw file, not only the count next to it.
- When a figure is copied from a task into its ADR, copy its label (chain, date, one-off) too.
- Don't use an `HHMM`-looking suffix on a measurement file unless it is the run time. `T2015` is not.
- The next lever on consultation cost is turns, and the `domain` path. That path is out of scope here.

## Evidence ladder

Tier 3 (staked). It changes how agents reach the registry. It does not move ARP up the ladder.
