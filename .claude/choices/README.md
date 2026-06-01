# choices/ — Architecture Decision Records (ADRs)

This is where non-obvious decisions are recorded. The format is a standard ADR: context, decision, consequences.

## When to write an ADR

Write one when:

- A design tradeoff was made (chose approach A over B; both were viable).
- An architectural boundary was placed.
- A rule was changed (either tightened or relaxed).
- A dependency was added.
- A scope decision was made that wasn't already in `docs/03_MVP_SCOPE.md`.
- A deviation from an obvious approach was chosen, with reason.

Do **not** write an ADR for:

- Standard patterns already specified in docs or rules.
- Naming choices.
- Bug fixes where the right answer was obvious.
- "I refactored X." Refactors don't need ADRs unless they cross a boundary.

## Format

See `TEMPLATE.md`. Numbered sequentially: `NNNN-kebab-case-title.md`. Once an ADR is committed, it is immutable except for the `Status` field (which can move from `Accepted` to `Superseded by NNNN`).

## Relationship to other layers

- An ADR may **cite** a rule, a skill, a doc, or a post-mortem.
- A rule change is **paired** with an ADR documenting the change.
- A post-mortem in `learning/` may **trigger** an ADR.

## Status lifecycle

- **Proposed** — written, awaiting user review.
- **Accepted** — user has confirmed.
- **Superseded by NNNN** — replaced by a later ADR. Both stay in the repo.
- **Rejected** — proposed but the user said no. Stays in the repo for posterity.

Never delete an ADR. Mark it superseded or rejected. The record is the point.
