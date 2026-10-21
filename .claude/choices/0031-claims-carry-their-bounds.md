# 0031 — A claim carries its bounds, or it is not written

**Status:** Accepted
**Date:** 2026-10-16
**Triggered by:** user feedback after the `intuition-integrator` review of ADR 0030 — _"le seul
problème ici c'est ton interprétation"_. Six statements in one session were wrong while every
underlying measurement was right.

## Context

`.claude/rules/` governed how code is written, how it is tested, how it is reviewed and how a task is
closed. It said nothing about **what may be asserted** in the records those rules produce.

That gap was expensive on 2026-10-16. The failures, each verified wrong by an independent reviewer
re-deriving the data:

| Claimed                                          | True                                                                                                         |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| 185 mainnet edges mislabelled as protocols today | **0** — the code path reaches none of them                                                                   |
| a vocabulary slot with 328 genuine edges         | 185 mainnet + 143 testnet, summed across chains; and the set contains `love`, `developed`, three book titles |
| Intuition publicly invited a connector proposal  | unsourced; `docs/07` documents an extension route                                                            |
| `tsc` 0, `lint` 0, tests pass                    | true for the repo, false for the two files the commit existed to fix                                         |

**The measurements were never wrong.** Two reviewers re-derived them and got identical values. The
break was always the step from a measurement to a sentence about it. That is a distinct failure mode
from a coding error and the existing rules do not catch it: `code.md` governs code, `workflow.md`
governs process, and neither asks whether a number means what the sentence around it says.

It is also the failure mode this project can least afford. ARP's entire argument is the evidence
ladder — asserted, rated, staked, proven — and that an unchecked assertion is the bottom rung. A repo
making that argument in prose it has not checked is arguing against itself.

## Decision

**Add `.claude/rules/claims.md`.** Load it at the end of every task, with `workflow.md`, and before
answering any question containing a number.

Four checks, one per observed failure:

1. **Reachability before blast radius.** Before saying a defect affects N things, measure how many
   the code can reach. A wrong branch nothing reaches is _latent_; say so. A defect fixed before it
   could fire is good news, and inflating it is worse than reporting it plainly.
2. **One number, one context.** Name the chain, the date and the population. Never sum across chains
   or time windows to make a figure larger. Never attach an adjective the data contradicts.
3. **Third-party claims carry a citation** to a file and a line, or they are not written. This is the
   one that propagates furthest, because it gets quoted back as settled.
4. **Confirm a gate's scope covers the change** before citing it green. Name the scope when it does
   not.

Plus two habits: **commit the script, not the number** — every measured figure in a doc, ADR, task
file or report names the script that reproduces it — and **quote the interval, not the point, when n
is small**, using Wilson rather than the normal approximation.

Also adopted, as the mechanism rather than the rule: `scripts/build-claude-index.ts` generates
`.claude/choices/INDEX.md` and `.claude/learning/INDEX.md` from the files, and reports what it cannot
parse instead of omitting it. A hand-written index drifts, and a drifted index is worse than none
because an agent trusts it. It immediately surfaced that **ADR 0015 is still `Proposed`** while the
project depends on it.

## Consequences

**Positive**

- The four failures each have a check that is one query or one `grep`. None is expensive.
- `.claude/STATE.md` gives an agent the project's position in one read instead of 44 files.
- Numbers in the repo become reproducible rather than quoted: the `scripts/measure-*.ts` family is
  now the required companion to any measured figure.
- The index is generated, so it cannot silently drift from what it indexes.

**Negative**

- A sixth rule file to load, against `CLAUDE.md`'s own warning that loading everything defeats the
  routing. Mitigated by scope: it loads at the _end_ of a task, where `workflow.md` already loads.
- `STATE.md` is hand-maintained and will drift if a task closes without updating it. The task-close
  protocol in `workflow.md` now names it, which is the only real defence.
- The rule cannot catch a claim nobody checks. It makes the check cheap and names the four shapes;
  it does not make the check automatic.

**Neutral**

- This ADR is itself subject to the rule. Every figure in it is reproducible:
  `scripts/measure/predicate-reachability.ts` for the zero, `scripts/measure/predicate-objects.ts`
  for the object histograms, `scripts/measure/predicate-edges.ts` for the edge counts.
- The wrong statements are left in the history rather than rebased away, and ADR 0030 carries its own
  correction in place with what it had claimed quoted. The record of being wrong is the point.
