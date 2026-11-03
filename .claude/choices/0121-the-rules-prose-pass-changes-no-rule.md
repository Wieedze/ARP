# 0121 — The rules' prose pass changes no rule

**Status:** Accepted
**Date:** 2026-11-03
**Triggered by:** `docs/tasks/27` step 5; the user chose "style cuts only, one ADR" over aligning the
rules' substance with the positioning.

## Context

`CLAUDE.md` and `workflow.md` say a rule never changes without an ADR. Step 5 of task 27 cuts
sentences from `.claude/rules/` that change no decision. That edits rule files without changing a
rule, and this ADR is the record that the edits are of that kind.

## Decision

Five cuts, none of which removes an instruction, a check, a citation or a script name:

- `claims.md` — the four-sentence "evidence that this is the right lever" paragraph cut to two
  sentences with the same finding; "Each of those takes seconds…" cut to its last sentence; the
  closing "It does not slow ordinary work…" and "The cost of skipping…" paragraphs removed.
- `code.md` — the history of the DOM test gap cut to one sentence citing ADR `0063` and
  `docs/tasks/26`; "all eight" now says what it counts.
- `workflow.md` — "Ten minutes of clarification saves a day of rework…" removed; the list of when to
  stop and ask is unchanged.

`security.md`, `ui.md`, `portability.md`, `solidity.md` and `metamask-delegation.md` were read and
left: their long passages carry decisions or amendment records.

## Alternatives considered

- **Align the rules' substance with the positioning too** — e.g. `CLAUDE.md`'s authority list still
  ranks `docs/02` second. Each such change needs its own ADR and the user's decision; left open.

## Consequences

**Positive:**

- 18 fewer lines read at the start of every task.

**Negative:**

- none worth recording.

**Neutral:**

- The removed sentences are in git history (`git log -p .claude/rules/`).

## References

- Related rule: `.claude/rules/claims.md`, `.claude/rules/code.md`, `.claude/rules/workflow.md`
- Triggered by: `docs/tasks/27-strip-the-ai-slop.md`
- Post-mortem: `.claude/learning/51-the-prose-pass-against-the-positioning.md`
