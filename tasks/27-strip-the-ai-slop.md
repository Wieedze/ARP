# Task 27 — A pass over the prose: slop, redundancy, over-explanation

> **Status: NOT STARTED** (recorded 2026-10-20, at the user's request, to be run **after** the
> connector and the tools page — not before).
> Scope: every word a human or a third party reads. Not the code.

## Why this is a task and not a tidy-up

The repo has **43 ADRs, 18 post-mortems, 31 task files and 16 docs**, almost all written by me in a
few weeks. Count them rather than quoting this line:
`ls .claude/choices/[0-9]*.md .claude/learning/[0-9]*.md tasks/*.md docs/*.md | wc -l`.
(The first draft of this sentence said 44, 27 and 15 — three of its four figures wrong, in a task
file about prose that misstates things. `claims.md` check 5 caught it before the commit.) Three habits have compounded in them:

- **AI slop** — sentences that sound like conclusions and carry nothing. "This is the whole argument."
  "That is the point." "Worth knowing." Each was true once and has been copied since.
- **Redundancy** — the same fact stated in four files. `claims.md` check 5 and ADR `0043` exist
  because a _correction_ landed in one of four copies; the underlying problem is that there were
  four.
- **Over-explanation** — a measured figure arrives with three sentences defending it. The user has
  said so directly, more than once: _"je comprend rien, cest tres compliqué pour pas grand chose tu
  tembrouille"_ and _"explique moi tres simplement"_.

A reader who is not me cannot tell which sentence is load-bearing. That is a defect in the record,
and the record is half of what this project is.

## What to cut, with a test for each

| pattern                                                      | the test                                              |
| ------------------------------------------------------------ | ----------------------------------------------------- |
| a sentence that would not change a decision if deleted       | delete it                                             |
| a figure explained more than once in one file                | keep the explanation at the first site, cite it after |
| a fact stated in more than two files                         | keep it where it is _acted on_, cite from elsewhere   |
| "this is the point" / "the whole argument" / "worth knowing" | name the thing instead, or cut                        |
| a paragraph defending a measurement nobody disputed          | the script name is the defence                        |
| an em-dash aside inside an em-dash aside                     | one level                                             |

## What must NOT be cut

- **Retraction records.** Struck-through text in an append-only ADR is the only thing stopping a
  reader believing the old version. ADR `0043`.
- **The script name beside a figure.** `claims.md`'s first habit. A number without its script is an
  assertion.
- **Scope caveats on a green gate.** `claims.md` check 4. "tsc clean over `app/src`; `scripts/` is
  outside every gate" reads like hedging and is the opposite.
- **The reason a deferral was deferred**, once it is the true reason. `tasks/23` has one that was
  false for a commit.

## Order

Front-facing first, because those are read by people who did not write them:

1. `README.md` — the repo's front page.
2. `packages/protocol/README.md` — the surface a third party installs.
3. The UI copy in `app/src` — `rules/ui.md` already forbids marketing voice and apologetic
   microcopy; check it holds.
4. `docs/` — and `docs/12` is **canonical**, so it gets the lightest hand of all.
5. `.claude/rules/` — these are read at the start of every task, so verbosity here costs every time.
6. Task files and ADRs — append-only, so cut only what is not a record.

## Do not do in this task

- Do not rewrite `docs/12`. It is the canonical statement and it is already short.
- Do not delete a retraction, a strike-through, or a script citation.
- Do not touch code comments that record a measured fact or a defect's cause. `code.md` forbids
  comments that restate the next line; it does not forbid one that says why a branch exists.
- Do not make the prose friendlier. The register is factual, not warm.

## Gate

Every file in the order above is shorter, and a reader who did not write it can say which sentence in
each section is the one that matters. No figure loses its script. No retraction loses its strike.

## Which tier of the evidence ladder does this serve?

None — it is the record, not the evidence. It serves the thing the ladder is for: a claim nobody can
read is as useless as a claim nobody can check.
