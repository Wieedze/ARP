# 0104 — Detail pages put the facts on the right

**Status:** Accepted
**Date:** 2026-11-02
**Triggered by:** `docs/tasks/46-the-redesign-from-references.md`, the user's "oui" on 2026-11-02 to
the two shared layouts and to the agent page with its facts on the right.

## Context

`ui.md` says detail views put "metadata on the left, content on the right". Two of the four detail
pages do the opposite, and they are the two the user likes best:

| page | columns | where |
| --- | --- | --- |
| skill | content, then facts in a `minmax(20rem,26rem)` column | `pages/SkillPage.tsx:91` |
| repo | the same | `pages/RepoPage.tsx:90` |
| atom | facts in an `18rem` column, then content | `pages/AtomPanel.tsx:199` |
| agent | the same | `pages/AgentTrustPanel.tsx:287` |

The skill page was taken as the model for every detail page in task 46: an eyebrow, the name in
display type, the description and content on the left, fact cards on the right (Classification,
External signals), the market, then the relations as `ClaimField`. The Mobbin references for an
asset's page (Coinbase, Kraken, Uniswap, Vercel's deployment details) put the summary and the action
on the right too.

## Decision

A detail page puts its **content on the left and its facts on the right**, in cards, in a
`minmax(20rem,26rem)` column. The skill page is the reference. The agent and atom pages move to it,
each in its own pass of task 46. Still not stacked above `lg`.

## Alternatives considered

- **Keep the rule and turn the skill and repo pages around.** That changes the two pages the user
  holds up as the good ones to match a rule written before either existed.
- **Leave each page as it is.** Two layouts for one kind of page is what task 46 exists to end.

## Consequences

**Positive:**

- One layout for the four detail pages. The reader looks for the facts in the same place on all of
  them.

**Negative:**

- The agent and atom pages each need a rebuild of their header area, and their tests may assert the
  old order.

**Neutral (worth knowing):**

- The facts column is wider than the old 18rem, so long identifiers wrap less. Each one still
  carries its copy control.

## References

- Related rule: `.claude/rules/ui.md` (Layout), amended by this ADR
- Related task: `docs/tasks/46-the-redesign-from-references.md`
- Related ADR: `0057` (the identity this keeps), `0103` (the words the cards use)
