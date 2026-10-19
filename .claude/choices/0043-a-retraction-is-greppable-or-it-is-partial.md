# 0043 — A retraction is greppable, or it is partial

**Status:** Accepted
**Date:** 2026-10-19
**Triggered by:** a `task-verifier` round on `tasks/23`, which named the pattern after its third
instance in two rounds and left the rule change as the author's call

## Context

Three failures in two review rounds, all the same shape. In each one the right answer was found and
written down — and landed at one site out of two or four:

| what was corrected                                                                               | fixed in              | left stale in                                                    |
| ------------------------------------------------------------------------------------------------ | --------------------- | ---------------------------------------------------------------- |
| `TrustStakeCapEnforcer` bounds the deposit only → it caps native `value`                         | the code              | ADR `0042`, which the code points at                             |
| the deferral "changes the connector's read contract, which the trust panel shares" → it does not | `tasks/23`            | ADR `0042` **and** the code comment, which both point at the ADR |
| six defects → eight                                                                              | the table, `STATE.md` | the same file's **title**, its prose and its **Gate**            |

The third is the sharpest. `tasks/26`'s Gate demanded "the six defects in the table are each
reproduced as a failing test" over a table of **eight**, two of which the same file said were
already closed without the environment the task exists to add. As written the gate could not be
satisfied — and the gate is the thing that decides whether the task was done.

The first two share a worse property: the surviving copy was the one other files pointed at. ADR
`0042` is where both a code comment and a task file send the reader, so the stale sentence was the
one most likely to be read, and the fresh one the least.

`claims.md` already had four checks and none of them covers this. Its existing four are about the
step from a measurement to a sentence. This is the step from **a corrected sentence to its copies**,
which is a different failure with a cheaper fix.

## Decision

`claims.md` gains a fifth check: **before committing a retraction or a changed count, grep for the
old wording.**

```
grep -rn "trust panel shares" --include=*.md --include=*.ts .
grep -rn "six defects" --include=*.md .
```

Each of those takes seconds. Each would have caught one of the three above — verified, not assumed:
run during the round that closed them, both returned exactly the stale sites the reviewer had found
by reading.

Two properties of this repo make the check load-bearing rather than tidy:

- **`.claude/choices/` and `.claude/learning/` are append-only.** A retraction there is struck
  through in place, so the old wording **stays in the file by design** and a reader meets it first.
  The grep is the only way to find every place that needs the strike-through.
- **A count has more copies than it looks like.** A title, a status line, a prose sentence, a table
  row and a gate are five sites for one number, and four of them are not where you were editing.

## Alternatives considered

- **A checklist item in `workflow.md`'s task-close protocol.** Rejected: the failure happens at the
  commit, not at the close, and two of the three instances were mid-task fixes rather than closes.
- **A script that diffs assertions between files.** Rejected as over-engineering for a `grep`. The
  three instances were each one command away, and a tool that needs maintaining is a worse guard
  than a habit that costs seconds.
- **Nothing, on the grounds that each instance was caught by review.** Rejected because that is the
  argument against every check in `claims.md`: all six of the 2026-10-16 statements were caught by
  review too, and the rule exists because catching them cost two reviewers a day.

## Consequences

**Positive:**

- The cheapest check in `claims.md`. It is one command and it has a 3-for-3 hit rate on the instances
  that produced it.
- It names the specific hazard of an append-only record, which nothing else in the rules does: the
  old wording persists on purpose, so "I fixed it" and "a reader will see the fix" are different
  claims.

**Negative:**

- It depends on remembering the old wording. A retraction that rephrases rather than replaces — "it
  is deferred because X" becoming "deferred; see elsewhere" — has no single token to grep for. The
  check works on distinctive phrases and numbers, which is what the three instances were.
- One more item on a rule that is already loaded at the end of every task.

**Neutral (worth knowing):**

- The three instances cost three review rounds between them, and no code was wrong in any of them.
  Every defect this week has been in the step from a true thing to a sentence about it, or from a
  corrected sentence to its copies.

## References

- Related rule: `.claude/rules/claims.md` — check 5, and the "two habits" heading rescoped to the
  first four
- Related ADR: `.claude/choices/0031-claims-carry-their-bounds.md` — the original four checks
- Related ADR: `.claude/choices/0042-a-vault-s-assets-are-not-evidence-of-a-stake.md` — carries two
  of the three retractions, struck through in place
- Related task: `tasks/23-the-tool-surface.md`, `tasks/26-the-app-has-no-dom-test-environment.md`
