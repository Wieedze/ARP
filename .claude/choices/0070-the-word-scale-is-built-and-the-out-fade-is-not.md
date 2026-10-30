# 0070 — The word scale is built; the route out-fade is not

**Status:** Accepted
**Date:** 2026-10-28
**Triggered by:** `docs/18_THE_MOTION_SPEC.md` §4 and §5, built — and one of the two reduced

## Context

`docs/18_THE_MOTION_SPEC.md` asked for three motion scales and said each had to earn its own line. Two did not exist
when it was written:

- **§4, word scale** — the words of a display heading arriving one after another. The brief called
  it "the hardest of the three, and the one with real accessibility weight", and named the trap: a
  headline split into one `<span>` per word can be announced word by word, with a pause at each,
  while find-in-page and text selection both degrade.
- **§5, route scale** — one page leaving and the next arriving, and _"the least visible of the
  three"_. The brief suggested a shape to argue with: outgoing content fading over a short duration,
  incoming over a slightly longer one, a loader only past ~150ms, and instant on `popstate`.

The design reference built both in its lab panes, with `--route-out: 120ms` and `--route-in: 200ms`.

## Decision

**The word scale is built as specified. The route scale ships the in-fade and drops the out-fade.**

### Word scale — three things that are not negotiable

1. **One readable sentence in the accessibility tree.** The heading holds the full text in a
   visually hidden node and the animated words `aria-hidden`. The sentence exists twice in the DOM;
   that is the trade §4 asks for explicitly, and animating the real text is the version that breaks.
2. **The delay comes from the rendered line, not the word index.** `--text-display` is a `clamp()`,
   so the headline wraps at a different word at every width. An index-based delay staggers _across_
   a line break — word 7 is the last word of line 1 at 1440px and the first word of line 2 at
   1024px, so at the second width the second line starts mid-stagger, which reads as a glitch at
   some widths and not others. `retimeWords` measures `offsetTop` after layout and re-measures on
   resize without re-splitting.
3. **Capped at `--stagger-ceiling` (560ms).** Past about 600ms of total stagger the reader is
   waiting rather than reading, so a long heading scales its own step down rather than taking
   400ms longer than a short one.

§4's other constraint holds unchanged: **figures never animate.** Mono text is data, every figure on
this page is somebody's deposit, and a number arriving character by character reads as a counter.

### Route scale — why there is no out-fade

§5 asks for two things that are in tension, and the second wins:

> the outgoing content fades on a short duration while the incoming content fades in slightly longer
>
> […] anything that delays the first paint of the new route by more than a frame or two [will be
>
> > rejected]

Holding the old page on screen for 120ms means keeping a **remembered** location in React state and
swapping it on a timer, because React Router renders from the location in context. That is 120ms in
which the new route has already rendered and is deliberately not shown, 120ms of two pages' state
alive at once, and a timer that has to be cancelled on every further navigation — whose failure mode
is a page stuck at `opacity: 0`, the worst outcome available here.

So `--route-out` is **not defined** in `index.css`, rather than defined and unused, and `index.css`
says why at the point where it would have been.

What ships: the arriving page fades in over `--route-in`, opacity only, no movement; `POP` and
`prefers-reduced-motion` get no class at all, because §5 is explicit that back and forward must not
feel slower than a click; and the route loader is held invisible for `--loader-delay` by an
`animation-delay`, so **a cached route never shows a loader** and no JS timer decides it.

**If the cut reads as a cut**, the right fix is the platform's: `startViewTransition` through React
Router's `viewTransition` prop, which cross-fades a GPU snapshot of the old frame and so costs no
delayed paint and no React state. It needs the prop on every `Link` in the app, which is a change to
make deliberately rather than inside a motion pass.

## Alternatives considered

- **Animate the real heading text** rather than a hidden copy. The failure §4 names. Rejected.
- **An index-based word delay.** Simpler, no measurement, no resize listener — and wrong at every
  width but the one it was tuned at.
- **Per-character arrival.** Reads as a typewriter, and §4 forbids it for figures specifically.
  Prose would survive it; the page has too many figures sitting next to prose for the two to use
  different grammars.
- **Hold the old route in state for the out-fade.** Costed above.
- **View transitions now.** The right long-term answer, wrong scope tonight: it touches every
  `Link`, and it replaces this component rather than extending it.

## Consequences

**Positive:**

- The hero's headline arrives as a sentence being spoken rather than a block appearing, which is
  what the whole deck's pacing is for.
- The measurement is unit-tested (`words-timing.test.tsx`), including the wrap case `happy-dom`
  cannot produce on its own — `offsetTop` is defined per word, which is the only way to reach the
  branch that shipped the bug.
- Nothing delays a route's first paint. A cached navigation is a swap and a 200ms fade.

**Negative:**

- **The heading's text is in the DOM twice.** Find-in-page matches the hidden copy, so a browser's
  find highlight lands on an invisible node. There is no way around it that keeps the accessible
  name intact, and §4 chose this side of the trade.
- `retimeWords` forces a synchronous layout per heading on resize. One heading is cheap; a page that
  put `Words` on twenty headings would not be.
- **The route change is a cut followed by a fade-in**, not a cross-fade. It is a deviation from the
  reference, it is visible if you look for it, and the remedy above is named rather than built.
- `--route-out` is a number in the design reference with no counterpart in the code. Anyone
  comparing the two will find it missing; `index.css` and `RouteTransition` both say why, which is
  the mitigation available.

**Neutral (worth knowing):**

- Both scales are invisible to the app's suite beyond the unit tests. `happy-dom` lays out at
  1024x768 and does pin the deck, but `offsetTop` and `getBoundingClientRect()` both return zero
  there, so no rendered assertion can see a stagger and the wrap case has to be faked by defining
  `offsetTop` per word. `MOTION-V2.md` §5 is the browser checklist.

## References

- Brief: `docs/18_THE_MOTION_SPEC.md` §4, §5, §7
- Build contract: `docs/design/motion/MOTION-V2.md` §2.4, §2.5
- Related ADR: `.claude/choices/0066-one-gesture-plays-one-scene.md`,
  `.claude/choices/0068-scenes-do-not-overlap.md`
- Related rule: `.claude/rules/ui.md` (reduced motion, and the bundle rule §6 answers)
