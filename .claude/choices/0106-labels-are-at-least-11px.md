# 0106 — Labels are at least 11px

**Status:** Accepted
**Date:** 2026-11-02
**Triggered by:** `docs/tasks/48-the-journeys.md` item 7. The user said « fais tout ça » to the
journey list, where this item was marked as a rule change.

## Context

`ui.md` allowed mono labels from 10 to 12px. `--text-label` is 11px, but 24 call sites wrote
`text-[10px]` by hand, and one more wrote `text-[9px]`: "TIME", "CHAIN", "YOUR SUPPORT", the
eyebrow tags, the activity bar. Below 11px a label is hard to read, and the steel colour that labels
use is already the quietest text level allowed for reading.

## Decision

Labels are mono **11–12px**. Every hand-written 10px or 9px label now uses `--text-label` (11px),
so the size comes from one token. The `?` glyph inside `Hint`'s 15px circle stays at 9px, because it
is a glyph and not a label.

## Alternatives considered

- **Keep 10px as allowed.** It is the size every site of this problem used, and the token already
  said 11.
- **Raise the token to 12px.** It would change every label on every page at once. A separate
  decision if 11 still reads small.

## Consequences

**Positive:**

- One label size, from one token, in every page.

**Negative:**

- The labels in the landing scenes and the activity bar take one pixel more, so their rows are a
  little taller.

## References

- Related rule: `.claude/rules/ui.md` (Design language), amended by this ADR
- Related ADR: `0057` (the identity)
