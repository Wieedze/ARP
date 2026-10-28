# 0066 — One gesture plays one whole scene

**Status:** Accepted
**Date:** 2026-10-28
**Triggered by:** user decision, relayed through `arp-motion-reference/MOTION-V2.md` §0 D1

## Context

`SceneDeck` shipped on 2026-10-27 with a line in its docstring that was the point of the design:

> The scrollbar behaves normally, `Home`/`End`/`Page Down` work, and nothing hijacks the wheel —
> `position: sticky` over JS pinning is the consensus recommendation and it is the reason this needs
> no scroll library.

That is still the right default for a long document. It is the wrong one for this deck, and the
reason is the hand-over itself. A scene's elements arrive over `--scene-reveal` 700 ms with
`--scene-step` 150 ms between siblings, and a Saffron cover closes and opens across the midpoint. A
wheel notch moves roughly 100 px, so a reader crossing one band of 680–1080 px delivers seven to ten
notches through that sequence — each one re-deriving `progress` from the new scroll offset and
re-painting a partially-complete animation at a new position. The user's words, 2026-10-27: _« 1
scroll déclenche toute l'animation jusqu'à la scène suivante, sinon ça fait saccadé. »_

The jerkiness is structural, not a tuning problem. Scrubbing a 2.4-second composition with a
quantised input device samples it at the device's resolution, and no easing curve fixes the sample
rate.

## Decision

**Inside the pinned deck, the first event of a gesture plays the whole hand-over to the next scene
on a timer, and the rest of that gesture is swallowed.**

- Triggers: `wheel` (non-passive), `touchend` with `|dy| > 30`, and `keydown` on
  Arrow Up/Down, Page Up/Down, Space and Shift+Space.
- The glide is `requestAnimationFrame` plus `scrollTo({behavior: "instant"})` over
  `STEP` ms — 2400 for the dive out of the hero, 2900 between seeded scenes, 1700 for a hash jump —
  eased `0.5 - 0.5·cos(πt)`.
- Events during the move, and for 300 ms after it, are `preventDefault`ed. That window is trackpad
  inertia: without it one flick advances three scenes.
- **The deck only owns input while it owns the viewport** (`box.top <= 89 && box.bottom >=
innerHeight - 1`), and a step past the first or last scene is not prevented, so native scroll
  resumes at both ends.

What does **not** change, and is what keeps this from being a scroll-jacking library: the page is
still at a real scroll offset, the scrollbar is native and draggable, `Home` and `End` still jump,
the deck still refuses to pin under `prefers-reduced-motion` or below 680×900, and the stacked
fallback has no gesture handling at all.

## Alternatives considered

- **Leave it scrubbed and shorten the animations.** Tried in v1 — 520 ms down to 240 ms was the
  previous round of exactly this complaint. It makes each sample closer to the last, which reduces
  the jerk without removing it, and it also removes the pacing the deck exists to provide. The
  Saffron cover in particular cannot be short: it has to close, swap and open.
- **Snap on scroll end** (debounce, then animate to the nearest band). The reader sees the raw
  scrubbed motion first and a correction afterwards, which is the "jump then fade" failure v1 was
  built to avoid, arriving from the other direction.
- **A scroll library (GSAP ScrollTrigger, Lenis).** `docs/18` §6 sets the bar for a motion
  dependency: a timeline, scrubbed progress, or reversibility. This needs the second, and it now has
  it in about 60 lines. Revisit if route transitions and the veil want to share a timeline.
- **Buttons or a "next" affordance instead of the wheel.** Honest and accessible, and rejected: the
  deck is the first screen of a public page and an explicit control there reads as a slideshow.

## Consequences

**Positive:**

- One input, one complete composition. The animation is played rather than sampled, which is the
  whole of the user's complaint.
- The dive into the core and the seed covers become possible. Scrubbed, they were sampled at 7–10
  points and read as stutter.

**Negative:**

- **It is scroll-jacking, and that is a real accessibility cost.** A reader who wants to move half a
  screen cannot, inside the deck. The mitigations are the three above — native scrollbar, working
  `Home`/`End`, and a hard hand-back at both ends — plus the reduced-motion and small-viewport
  refusals, which mean a large share of readers never meet it at all.
- Momentum scrolling on macOS and iOS delivers events for up to a second after the finger lifts, so
  the 300 ms settle window is tuned, not derived. Too short double-steps; too long makes the deck
  feel unresponsive to a deliberate second scroll.
- `SceneDeck` now attaches a non-passive `wheel` listener, which Chrome reports in its "does not use
  passive listeners" audit. Unavoidable: `preventDefault` is the mechanism.

**Neutral (worth knowing):**

- The docstring line quoted above is now **wrong and has been rewritten**, not deleted — the reason
  it was written is still the reason the scrollbar stays native.
- **None of the input handling is covered by the app suite**, and the reason is narrower than it
  first looked. `happy-dom`'s viewport is 1024x768 with `prefers-reduced-motion` false, so
  `canPin()` is true and the deck does pin in a DOM test — but `getBoundingClientRect()` returns
  zero, so `progress` never leaves 0 and no wheel, swipe or key press can be made to move anything.
  The structure is testable; the stepping is not. `MOTION-V2.md` §5 is the browser checklist.

## References

- Build contract: `arp-motion-reference/MOTION-V2.md` §0 D1, §2.1 item 5
- Related ADR: `.claude/choices/0068-scenes-do-not-overlap.md` (the other half of the hand-over)
- Related rule: `.claude/rules/ui.md`
- Related doc: `docs/18_THE_MOTION_SPEC.md` §6 (when a motion dependency is justified)
