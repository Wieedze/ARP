# 0073 — a reveal answers the keyboard, or it is a mouse effect

**Status:** Accepted
**Date:** 2026-10-28
**Triggered by:** the user, on the claim field — _« tu peux les rendre animé et au over on voit
l'arrête qui compose le sujet, le prédicat et l'objet »_.

## Context

`rules/ui.md` says, flatly:

> **No mouse-reactive effects.** No parallax, no repulsion, no hover tilt, no cursor trails — the
> user rejected all four. Row hover is a background change and nothing else. **Scroll position is
> allowed and the pointer is not** — that is the line, and it did not move.

Drawing an edge from the atom to a claim's subject when the pointer is over it is, read literally,
the thing that sentence forbids. And the user asked for it.

Read for its **intent**, the rule is about four named things — parallax, repulsion, tilt, cursor
trails — which have one property in common: the pointer **moves** something, and the movement is the
content. None of them tells the reader anything.

The repo already contains the counter-case, and it predates this: `Hint` opens a tooltip on hover.
It was never a breach, because it opens on **keyboard focus** too, and what it reveals is a sentence
that is otherwise absent from the page. It is a disclosure, not an effect.

## Decision

A reveal driven by the pointer is allowed when **all three** hold. Otherwise the rule stands.

1. **It answers the keyboard as well.** The same `onFocus`/`onBlur` as `onMouseEnter`/`onMouseLeave`.
   A reveal only a mouse can reach is the mouse-reactive effect the rule rejects, and it fails the
   keyboard-reachability rule in the same file.
2. **It reveals a fact, not a motion.** The thing shown is data the page already holds — here, which
   subject and which predicate compose this claim. A decoration that merely responds is still
   forbidden.
3. **It moves no layout.** The slot it appears in is in the DOM at its final size before anything is
   hovered. A field that reflows under the pointer is the pointer moving things, which is exactly
   what 1 and 2 do not excuse.

`rules/ui.md`'s bullet is amended to state these three, so the next reader does not have to infer
them from `Hint`.

## Alternatives considered

- **Keep the rule literal and refuse.** The rule exists to stop decoration; refusing a disclosure
  because it shares an event with decoration would be reading the letter against the purpose. The
  user who wrote the rule asked for this.
- **Click instead of hover.** A click commits — on this surface a dot is a link, so a click
  navigates. Overloading it to also mean "explain yourself" would make the primary action ambiguous.
- **Always draw every edge.** Thirty-six lines from one centre is a starburst, not a graph, and it
  would hide the thing the field is for: how many, under which predicate, and which carry a
  position.

## Consequences

**Positive:**

- The field says what a triple _is_ — subject, predicate, object — rather than leaving a reader to
  assemble it. That is the same correction `AtomPanel`'s rows already took: a row used to read
  "Agent 13579:3" under a heading "uses" and now reads as the sentence.
- The condition is testable and is tested: `AtomPanel.test.tsx` focuses a dot and asserts the triple
  is named, so a future change that makes the reveal hover-only fails a gate rather than a review.

**Negative:**

- **The rule now has an exception, and an exception is a door.** The three conditions are narrow on
  purpose, and the first is the one that matters: anything that cannot be reached by `Tab` is not
  covered by this and the flat prohibition applies.

**Neutral:**

- The dots also arrive with a stagger. That is not covered by this ADR and needed no exception: it
  is `--list-step` and `--reveal-fade`, the vocabulary `.arp-row` already uses, neutralised under
  `prefers-reduced-motion` by the same block that neutralises every other arrival in the app.
- The announcement lives on the **link**, not in a live region. A visible sentence plus a live
  region would announce twice, and a live region firing on hover says nothing to a reader who
  navigates by focus. The visible sentence is `aria-hidden` and is a visual echo of the name focus
  already read out.

## Amended the same day: the reveal is light, not a line

The first build drew an **edge** from the centre to the hovered claim. The user cut it —
_« pas besoin du trait »_ — and asked for _« un effect lumineux »_ instead, with the rings turning
_« comme en page d'accueil »_.

**What survives unchanged is the decision above**, which is about the three conditions and not about
what is drawn. The reveal is still hover **and** focus, still a fact rather than a motion (the
triple, named), and still moves no layout. Only the rendering changed.

**"Luminous" without breaking the rule it would seem to break.** `rules/ui.md` forbids `box-shadow`,
glow and gradients outright, in the same file that reserves Saffron for the primary action, **the
selected state**, and the viewer's own position. A dot under the pointer or the keyboard _is_ a
selected state — so the accent arriving on it is this design system's own idea of light, and it
needs no shadow to say it. The dot takes `--color-accent` and scales; nothing else changes.

So this is **not** a second exception. The glow prohibition stands exactly as written; what was
reached for instead is a colour the rule already assigns to this state.

**The rings turn**, each at its own rate and alternating direction, as one CSS transform on a
wrapper that carries that ring's dots. The landing's field recomputes every point's angle per frame
because its points also breathe and dive; nothing here moves but the angle, so the compositor does
the work. Neutralised by the same `prefers-reduced-motion` block as every other arrival in the app.

**One thing this cost, recorded because only a screenshot could have caught it.** Removing the edge
meant replacing a span of JSX that ran from the rings to the dots — and the **centre core sat in
that gap**. The atom disappeared from its own field, every gate stayed green, and the loss was
visible only in a rendered image. The same lesson as `docs/tasks/29`'s word scale and `docs/tasks/30`'s money
figure: a change that passes `tsc`, `eslint` and 497 tests can still delete the subject of the page.
