# 0067 — Saffron is a transition material, and the core is warm at zero

**Status:** Accepted
**Date:** 2026-10-28
**Triggered by:** user decision, relayed through `arp-motion-reference/MOTION-V2.md` §0 D3 and D4

## Context

`.claude/rules/ui.md` has spent the accent on three things and nothing else since ADR `0057`:

> **One accent, and it is warm.** Saffron `--color-accent`, 10.4:1, spent on the primary action, the
> selected state, and the viewer's own position — nothing else. […] Nothing decorative.

Two pieces of the new landing break that, and they break it in the same way, so they are one
decision:

1. **The hand-overs.** The first one dives into the hero's core until Saffron fills the screen and a
   hole opens onto the next scene. The four after it grow a Saffron sphere that was already sitting
   half out of frame into a cover, then open it. The user's words, 2026-10-27: _« zoomer dans
   l'animation et entrer dans le safran, puis un jeu de bandeau ou de cercle safran. »_
2. **The hero's core at zero declarations.** `PulseField` — the component `SourceField` replaces —
   reasoned the opposite in its own comment, deliberately:

   > Saffron means "somebody paid" on every surface in this app, so the core is warm only when
   > something is actually on the record. At zero beats a warm core says the opposite of the figure
   > beside it.

   Mainnet returns zero today, so on the live page the core is grey. The user wants the Source Field
   look: a Saffron core with the rings turning.

Both are decoration by the rule's own definition. Neither is a primary action, a selected state, or
the viewer's position.

## Decision

**The accent rule gains one exception, written narrowly: Saffron may carry a transition, and the
Source Field's core is Saffron unconditionally.**

The exception is bounded by three conditions, and the point of writing them down is that the next
surface does not get to cite this ADR for a warm border:

- **It is motion, not state.** Saffron as a transition material exists only while a hand-over is in
  flight. Nothing is left warm when the motion settles — every scene lands with the accent back on
  the primary action and nothing else.
- **It is the mark, not a palette.** The field's core and the seed spheres are the same object the
  logo is. Saffron there reads as "the source", which is what the whole page is named after, and
  it does not compete with a button because no button is on screen during a cover.
- **A figure never wears it decoratively.** Unchanged, and the hard half of the rule. Every amount,
  count and timestamp still follows ADR `0057` — the declaration cost in the primary card is
  Saffron because it is the primary action's own cost, and no other number on the page is.

The second half, the warm core at zero, drops `PulseField`'s coupling of core colour to the beat
count. The honest-state argument that comment makes is **not** wrong, and it is answered elsewhere
on the page rather than by the core: the beat card says `Pulse · 0`, says "No declaration on this
chain yet", and says "Nobody has run the loop here, including us." Three sentences in prose carry
that better than a grey dot nobody can read as an assertion.

`.claude/rules/ui.md` is amended in the same commit, per `CLAUDE.md`'s "When to update a rule".

## Alternatives considered

- **Keep the rule and use a neutral for the covers** (`--color-raised`, or paper). Tried in the
  design session as a dark cover and rejected by the user — a near-black wipe on a near-black page
  reads as a dropped frame, not a transition. The contrast that makes a cover legible is the thing
  the rule is protecting.
- **Keep the core coupled to the count and accept grey on mainnet.** This is the status quo and it
  is defensible; it loses the hero on the one chain the page is actually pointed at, for a signal
  the same screen already states three times in words.
- **A second warm token** so the transition is not literally the accent. Rejected: two warm tokens
  one step apart is the "two names for one value" failure `rules/claims.md` §5 is about, and
  `check:tokens` cannot tell them apart.
- **A written exception with no conditions.** Rejected because that is how a one-accent rule becomes
  a two-colour palette. The three conditions above are the ADR's actual content.

## Consequences

**Positive:**

- The hand-overs are visible and are the page's signature. The mark becomes something the reader
  passes through rather than something sitting in a corner.
- The hero reads as designed on mainnet, which is the chain the page defaults to.

**Negative:**

- **The accent's meaning is now contextual rather than absolute.** "Saffron means somebody paid" was
  a sentence a reader could learn in one screen; it now needs "except while the page is moving".
  That is a real loss and it is why the exception is three conditions long.
- A full-screen Saffron cover at 10.4:1 against the ground is a large, bright area appearing for
  about a second. It is scroll-driven and reversible, and it does not flash — `cin` decelerates into
  the close — but it is the brightest event in the app and it is unavoidable at this size.
  Readers with `prefers-reduced-motion` never see it: the deck stacks and the veil is not drawn.
- `PulseField.tsx` is deleted rather than amended, and with it the reasoning quoted above. A
  comment that argues for behaviour the file no longer has is worse than none (`rules/code.md`), and
  git is where the argument lives now. `docs/18` §2 still describes the old component and is
  corrected in the same commit.

**Neutral (worth knowing):**

- `check:contrast` reads text sizes and colours; it has nothing to say about a canvas. Neither does
  `check:tokens`, beyond confirming `--color-accent` resolves. This is a browser check.

## References

- Build contract: `arp-motion-reference/MOTION-V2.md` §0 D3, D4, §2.2, §2.3
- Amends rule: `.claude/rules/ui.md` (§Design language, "One accent")
- Related ADR: `.claude/choices/0057-brand-identity-the-source.md` (the one-accent rule),
  `.claude/choices/0018-trust-panel-design-and-join.md` (`--color-alarm`, the only prior exception)
- Related doc: `docs/18_THE_MOTION_SPEC.md` §3 (what motion may not break)
