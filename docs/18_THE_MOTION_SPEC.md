# 18 — Motion: the page as one continuous read

**For:** the design agent. **Status:** a brief, answered — see the box below.
**Date:** 2026-10-27, annotated 2026-10-28
**Surfaces:** `/` first (`app/src/pages/Landing.tsx`), then `/agents`, `/tools`, `/atom/:atomId`.

> **Answered on 2026-10-28, and this file is now the brief plus its answer.** The design came back
> as `arp-motion-reference/index.html` and `arp-motion-reference/MOTION-V2.md`, which is **the build
> contract** — where it and this file disagree, it wins. All three scales are built on `/`. The
> seven decisions it carried that were the user's rather than ours are ADRs `0066`–`0069`; what §4
> and §5 became, including the one thing asked for here and deliberately not built, is ADR `0070`.
>
> §2 below describes components that no longer exist. It is left as written, because §3's three
> rules were derived from them and the derivation is the useful part.

Read `docs/12_THE_IDEA.md` first — it is short and it is the only canonical statement of what this
protocol is. Read `.claude/rules/ui.md` second: it is the build contract, and three of its rules
constrain everything below.

---

## 1. What is being asked for

The user's words, 2026-10-27:

> _« j'imaginais toute une trame avec des pages qui s'enchaînent, avec les mots qui arrivent un par
> un avec des fondus au fur et à mesure — comme j'ai fait pour mon site wieedze blog — mais moins
> visible dans l'enchaînement des pages. »_

Three distinct asks, and they are not the same problem:

| scale     | what arrives                                      | where it applies                    |
| --------- | ------------------------------------------------- | ----------------------------------- |
| **word**  | words of a headline, one after another, fading in | the hero h1, each section's h2      |
| **block** | a heading, then its body, then its rows           | every section — **this one exists** |
| **route** | one page leaving, the next arriving               | between `/`, `/agents`, `/tools`, … |

The route transition must be **the least visible of the three**. That is explicit: _"mais moins
visible dans l'enchaînement des pages"_. A page change that announces itself is a page change the
reader waits through.

**The reference is the user's own `wieedze` blog on GitHub.** This brief has not read it. Read it
before designing, and say in your delivery which of its decisions you kept and which you dropped —
that is the most useful page of any handoff.

---

## 2. What existed when this was written, and its contract

**Superseded 2026-10-28.** `Reveal` is now CSS driven by one `data-on` attribute on the scene rather
than an observer per element, its timings are tokens (`--reveal-fade` 260ms stacked,
`--scene-reveal` 700ms pinned), and `delayMs` is `index` — an **order**, not a duration, because the
two modes are nearly 2× apart and a millisecond value at the call site would hardcode one of them.
`PulseField` is deleted; `SourceField` replaces it (ADR `0067`). The paragraphs below are kept
because §3 was derived from them.

`app/src/components/brand/Reveal.tsx` — block scale only, shipped 2026-10-27.

- `IntersectionObserver` at `threshold: 0.08`, `rootMargin: "0px 0px -12% 0px"`.
- Transition `opacity, transform` over **620ms**, `cubic-bezier(0.2, 0.65, 0.3, 1)`, from
  `translateY(12px)` and `opacity: 0`.
- Fires **once** per element and disconnects. Nothing re-animates on scroll back.
- `delayMs` staggers a group. The act cards use `index * 90`.

Measured in a browser, 1440×980: **11 elements hidden at load, 0 still hidden after a full scroll**,
and **0 ever hidden** under `prefers-reduced-motion: reduce`.

`app/src/components/brand/PulseField.tsx` — the hero's particle field. Canvas 2D, ~80 lines, no
dependency. It is driven by real chain data (`beats`, `backed`) and draws the mark alone when those
are zero. Do not replace it with a library without reading §6.

`app/src/index.css` already defines the motion tokens: `--duration-base: 200ms` and
`--ease-out-quart: cubic-bezier(0.16, 1, 0.3, 1)`. **A new duration or curve belongs there**, not in
a class — `bun run check:tokens` enforces that every `var(--…)` resolves, and a page shipped once
against five custom properties that did not exist while `tsc` and `eslint` were both green
(ADR `0050`).

---

## 3. The three rules this cannot break

These are not preferences. Two of them were arrived at by the user rejecting work.

1. **No mouse-reactive motion.** `rules/ui.md`: no parallax, no repulsion, no hover tilt, no cursor
   trails — all four were built and all four were rejected. Scroll position is allowed; the pointer
   is not. Row hover is a background change and nothing else.

2. **`prefers-reduced-motion: reduce` means none, not less.** The still state must be the **same
   composition** at full opacity and final position — never a different layout, never a faster
   version of the same animation. This is the setting most likely to be on in the user's own
   browser: with Windows "Effets d'animation" off, `Reveal` correctly does nothing at all, which
   is why the motion looked broken on 2026-10-27 when it was working exactly as specified.

3. **Motion never gates content.** If the observer never fires, if JavaScript is slow, if the
   element starts off-screen in an overflow container — the reader still gets the text. `Reveal`
   does this by choosing its hidden state at first render from `canAnimate()`: an environment that
   cannot reveal never hides. **Any word-level effect has to answer the same question**, and it is
   harder there, because a half-revealed sentence is worse than an unrevealed block.

---

## 4. Word scale — the part that did not exist (built 2026-10-28, ADR `0070`)

The hardest of the three, and the one with real accessibility weight.

**The naive version is wrong.** Splitting a headline into `<span>` per word breaks the accessible
name: a screen reader may announce it word by word, with a pause at each, and text selection and
find-in-page both degrade. Whatever is built must keep **one readable sentence in the accessibility
tree** — the usual answer is a visually-hidden full-text node plus `aria-hidden` animated spans, and
if there is a better one, say so.

Constraints that are specific to this page:

- **Mono text is data.** Addresses, ids, amounts, timestamps and labels are in Geist Mono because
  they are facts. A number that animates in character by character reads as a counter, and this
  page has no counters — every figure is a deposit somebody made, shown at its real value. **Do not
  animate figures.** Animate prose.
- **`--text-display` is a `clamp()`.** Words wrap differently at every width, so a per-word delay
  computed from index will stagger across a line break in a way that reads as a glitch at some
  widths and not others. Test at 1920, 1440, 1024 and 390.
- **A figure that is still loading must not arrive as a placeholder.** The page renders `—` until
  the chain answers, deliberately. If the reveal animates the `—` in and then the number swaps
  under it, the page has animated a thing it told the reader it does not know.

Specify: the unit (word, or line), the per-unit delay, the total ceiling for a headline — past about
600ms of total stagger the reader is waiting rather than reading — and what happens if the element
re-enters the viewport.

---

## 5. Route scale — the least visible of the three (built 2026-10-28, ADR `0070`, minus the out-fade)

Routes are in `app/src/App.tsx`, each lazy-loaded behind a `<Suspense>` with a `RouteFallback`. So
there are already **three** states to design, not two: leaving, loading, arriving. The loading state
is `PageLoading` — a centred `RingLoader` with the footer held down — and it currently appears
without transition.

The ask is that this reads as **continuous**, not as a cut and not as a curtain. Things that will be
rejected: a full-screen wipe, a colour flash, a slide that moves the whole viewport, anything that
delays the first paint of the new route by more than a frame or two. The nav and the footer are
fixed furniture across routes and should not move at all.

A workable shape, to argue with rather than implement as given: the outgoing content fades on a
short duration while the incoming content fades in slightly longer, with no movement, and the
`RingLoader` appearing only if the lazy chunk takes longer than ~150ms — so a cached route never
shows a loader at all.

**Browser back and forward must not feel slower than a click.** A transition that runs on `popstate`
makes history feel broken.

---

## 6. Why not Three.js, and when a dependency would be justified

The question was asked directly. **Three.js is a WebGL 3D renderer** — scenes, cameras, meshes,
lights. None of the three scales above is 3D. Words fading in are DOM and CSS; route transitions are
DOM and CSS; the particle field is 2D points on a circle. Three.js would add ~600kB to do none of it
better, and `rules/ui.md` requires a written justification for any UI dependency.

GSAP is the more serious suggestion and the answer is still **not yet**. What exists today is one
threshold, one transition, once — about 30 lines against ~70kB. The honest case for a motion library
is a **timeline**: several elements whose arrivals depend on each other, scroll-scrubbed progress,
or a sequence that has to be reversible. If the design you return needs any of those, say so
explicitly and name which, and that is the brief that justifies the dependency. If it does not,
`IntersectionObserver` plus the tokens in `index.css` is the whole toolkit.

---

## 7. What to deliver

- A **single standalone HTML page** demonstrating all three scales, loading nothing from this repo,
  with the tokens from `rules/ui.md` §Design language copied into `:root`.
- **The reduced-motion state rendered beside the animated one**, not described. It is the state
  the user's own machine is most likely in.
- The **empty, the one and the two-hundred** cases for any list that staggers — a stagger tuned on
  three rows is a two-second wait on forty.
- Working at **390px** as well as 1920.
- One short section in prose: **what you dropped and why**, and what you kept from the `wieedze`
  reference.

---

## 8. The question to answer first

**Does the motion make the page easier to read, or only more impressive to watch?**

The page's argument is that an opinion costs something. It is a page of figures, each of which is
somebody's money, and the reader's job is to believe them. Motion that reads as a product launch
works against that; motion that paces a long page so each claim lands on its own works for it.

If the honest answer for any one of the three scales is "it looks better", say so for that scale and
we will not build it. The block-level reveal already exists and is defensible on pacing alone. The
word scale and the route scale each have to earn their own line.
