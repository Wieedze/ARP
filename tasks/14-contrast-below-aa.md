# Task 14 — `--color-fg-40` is below AA wherever it carries meaning

> **Status: NOT STARTED** (specified 2026-09-17). Found by `ui-reviewer` and confirmed by
> `task-verifier` during Task 12.

## The finding

`--color-fg-40` computes to **3.66:1** on the app background. `.claude/rules/ui.md` requires WCAG AA,
which is 4.5:1 for text below 18.66px.

60 usages across `app/src`. The ones that matter are where it is paired with `--text-label` (11px) —
roughly twenty sites, including the `Layout.tsx` footer.

Task 12 removed it from the tab strip, where the tone _was_ the signal rather than chrome, and took
the top tier from font weight instead. It introduced no new instance. The rest predate it and were
left alone as out of scope — correctly, but they are still a violation of a rule this repo states
plainly.

## What to decide, before touching anything

Not every use is equally wrong. The question is what the token is doing in each place:

- **Carrying meaning** — a verdict, a state, a distinction the reader must perceive. Sub-AA here is a
  defect: the information is simply not reaching some readers.
- **Chrome** — a separator, a placeholder, decoration next to text that is already legible. Sub-AA is
  defensible, and `ui.md`'s own "negative space is content" argues for keeping some things quiet.

Sort the 60 before changing any. A blanket raise would flatten a hierarchy that is deliberate in
places.

## Then

Raise the meaning-carrying ones to at least `--color-fg-60` (7.04:1) or give them weight instead of
tone, which is what the tab strip did. Leave the chrome, and say in the ADR which is which and why —
otherwise this comes back as a finding every time someone measures.

## Verification

Contrast measured, not eyeballed — there is no browser in the build environment and the whole reason
this was found is that a ratio was computed rather than judged. `ui-reviewer` pass.

## Out of scope

Redefining the palette. This is about which token is used where, not about changing what the tokens
are.
