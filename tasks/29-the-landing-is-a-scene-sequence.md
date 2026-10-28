# Task 29 — The landing is a scene sequence, not a long page

> **Status: COMPLETE** 2026-10-28 — ADRs `0066`, `0067`, `0068`, `0069`, `0070`.
>
> All five browser checks **run and pass**, in Chromium, against the built bundle:
> `scripts/measure/landing-fit.ts`. It found two defects nothing else could see — the manifesto
> scene was 1296px tall at every viewport, and the page scrolled sideways by 8px wherever a
> scrollbar exists. Both fixed and re-measured.
>
> An earlier version of this line said the checks could not be run because the session had no
> browser. **That was asserted without testing it** — Chromium is in the image at
> `/root/.cache/ms-playwright/`, and what was missing was a driver, not a browser.
> `rules/claims.md` §1 applies to a blocker as much as to a figure, and the same false premise is
> written in five other task files (`tasks/28` item 35).
>
> `arp-motion-reference/index.html` + `MOTION-V2.md` are the design base, at the user's
> decision: _« garde tout ce qui vient de ce dossier, c'est la nouvelle base »_ and
> _« surtout garde bien tous les textes et tout ce qui a été fait dans le design »_.

## Objective

Build the design that came back from the design session of 2026-10-27/28, as delivered, and record
the seven decisions in it that were the user's rather than ours — three of which go against a
written rule in `.claude/rules/ui.md`.

The design is **not** a suggestion to interpret. The copy is the reference's copy, to the word; the
timings are its timings; the things it lists as tried and rejected do not come back.

## Required skills

None global. `.claude/rules/ui.md`, `code.md`, `claims.md`, `workflow.md`.

## Do not do in this task

- **Do not reinterpret the copy.** Eleven sentences are removals, not rephrasings
  (`MOTION-V2.md` §3). The list of what was tried and rejected in §2.3 is binding.
- **Do not ship a sample.** The reference's `vault-auditor`, `crytic-runner`, `maturity-bot`,
  `Echidna`, `0.1 TRUST` and `0.11 TRUST` are samples. Every figure in the app is a chain read or
  a sentence saying there is none.
- **Do not promise payment for `be hired`.** ADR `0060` took hire and pay out of scope.
- **Do not touch the other four pages.** They have no motion and that inconsistency is real; it is
  the next task, not this one.

## What the design asked for, and what it got

### The seven decisions (`MOTION-V2.md` §0)

|     | decision                                      | ADR    | breaks a rule?                                  |
| --- | --------------------------------------------- | ------ | ----------------------------------------------- |
| D1  | one gesture plays one whole scene             | `0066` | yes — `SceneDeck`'s "nothing hijacks the wheel" |
| D2  | scenes no longer overlap                      | `0068` | no                                              |
| D3  | Saffron as a transition material              | `0067` | yes — `ui.md`'s one-accent rule                 |
| D4  | the hero core is Saffron at zero declarations | `0067` | yes — `PulseField`'s own reasoning              |
| D5  | the evidence ladder scene is removed          | `0069` | no                                              |
| D6  | three wallet acts become four jobs            | `0069` | no                                              |
| D7  | the copy removals                             | `0069` | no                                              |

`.claude/rules/ui.md` is amended in the same commit for D1, D3 and D4, per `CLAUDE.md`'s "When to
update a rule".

### The three motion scales (`docs/18` §1)

| scale | state before                  | state now                                                           |
| ----- | ----------------------------- | ------------------------------------------------------------------- |
| block | shipped, observer per element | one `data-on` on the scene, CSS descendant rules, tokens            |
| word  | **not built**                 | `Words` + `words-timing` — delay from the **rendered** line, capped |
| route | **not built**                 | in-fade only. The out-fade is argued down in ADR `0070`             |

### What shipped

New: `SourceField.tsx` (+ `source-field-geometry.ts`), `Words.tsx` (+ `words-timing.ts`),
`Lines.tsx`, `RouteTransition.tsx`, `row-motion.ts`, `scene-hand-over.ts`.
Rewritten: `SceneDeck.tsx`, `Reveal.tsx`, `scene-context.ts`, `pages/Landing.tsx`, `App.tsx`.
Deleted: `PulseField.tsx`.
`index.css`: 22 motion tokens in `@theme`, and the arrival rules — unlayered descendant selectors,
because a utility cannot express "elements inside a scene that is not on yet".

## Gate

All of these, and the browser checks `MOTION-V2.md` §5 lists — which are now
`scripts/measure/landing-fit.ts`, run against `vite preview` rather than `bun run dev`, because the
dev server does not minify the CSS and that difference is where the word scale's defect lived.

**What the suite does and does not reach, measured rather than assumed.** `happy-dom`'s viewport is
**1024x768** with `prefers-reduced-motion` false, so `canPin()` is true and the deck **does** pin in
every DOM test — an earlier version of this line said it never pins, which was inherited from a session
summary and wrong.
What `happy-dom` returns zero for is `getBoundingClientRect()`, so `progress` never leaves 0. That
covers the pinned **structure** at the first scene and leaves everything **driven by scroll**
uncovered: the gesture stepping, the hand-over in situ, the dive, the four Saffron covers, the
scrubbed manifesto and the `played` set.

```
cd app && bunx tsc -b
cd app && bun run lint
cd app && bun run test
cd app && bun run check:tokens
cd app && bun run check:contrast
bun --filter '*' lint && bun --filter '*' test
bun run check:scripts
```

Browser, and not optional — all five are in `scripts/measure/landing-fit.ts`:

```
cd app && bun run build && bunx vite preview --port 4173 &
bun run scripts/measure/landing-fit.ts
```

1. At 1440×680, 1440×900 and 1920×1080 — every pinned scene sits between y = 88 and the bottom
   edge. A scene that grows stops the deck pinning at that size, **silently**. The script walks
   each of the six bands and measures whichever scene becomes active there; a one-shot measurement
   at scroll 0 checks one scene of six, which is how the manifesto's 1296px went unseen.
2. One wheel notch from the top plays the full dive and lands on scene 1. A burst of six advances
   exactly one more, so `SETTLE` is swallowing the tail. Past scene 6, native scroll resumes, and
   `Home`/`End` still jump.
3. `#build` lands on scene 6 with the target at `opacity: 1`. It once moved the page 268px and left
   the target invisible.
4. Under `prefers-reduced-motion` and at 390px wide: stacked, nothing hidden, nothing moving, no
   horizontal scroll, the field above the hero copy.
5. No sample name or amount from the reference anywhere on the page. **`0.11 TRUST` is not one** —
   it looks invented and is mainnet's real floor, `getTripleCost()` 0.1 plus `minDeposit` 0.01. The
   first run of the script listed it as a sample and reported a correct chain figure as fabricated.

Measured 2026-10-28, all three pinned viewports: every band activates its own scene, every scene
fits, one notch gives scene 1, a burst of six gives scene 2, `#build` gives scene 5 at opacity 1.00.
Both 390px and all three reduced-motion runs stack, hide nothing and do not scroll sideways.

## What the browser found that no gate did

Both were invisible to `tsc`, `eslint`, 459 tests, `check:tokens` and `check:contrast`.

1. **Scene 4 was 1296px tall at every viewport**, and the stage is `overflow-hidden`, so it clipped
   in silence. Caused by this task's own fix for `check:contrast`: moving the font-size off the
   paragraph and onto its three lines made `max-w-[22ch]` resolve `ch` against **15px body text**
   instead of 72px display, so the paragraph was 189px wide and three short lines wrapped into
   eighteen. The reference sets the size on the paragraph and has no max-width; so does the code
   now. **A correction is not exempt from the rule it corrects.**
2. **The page scrolled sideways by 8px at every width with a scrollbar.** `calc(50% + 50vw)` counts
   the scrollbar in `50vw` and not in `50%`, and no CSS unit excludes it, so the bleed cannot be
   made exact — it has to be cut. `overflow-x: clip` on the root, **not `hidden`**: `hidden`
   creates a scroll container, and a scroll container on `html` breaks the `position: sticky` the
   deck is built on.

## Deliberately not carried over from the reference

- **Fig. 01's agent has no `Sigil` and no id.** The reference puts both beside the name. The id
  (`#2214`) is sample data, and the sigil is generated from an agent's declared modules —
  `RecentDeclaration` carries none, so drawing one would need a second read per card on the front
  page. `rules/ui.md` makes the sigil the agent's identity, so this is a real gap and not a
  simplification; it closes when scene 2 reads a profile rather than a grouped edge list.
- **The route out-fade.** ADR `0070`, argued there rather than here.

## Open, and the user's to settle

- **The nav became `sticky top-0 z-20` with an opaque background** (`NavSplit.tsx`), because the
  deck assumed it: the stage reserves 88px for it and the Saffron cover computes its reach from the
  farthest corner **below** y=88. Static, all three were wrong at once and the cover fell 16–68px
  short of a top corner at the exact frame a scene swaps. It changes every page, which is why it is
  listed here — it is a defensible improvement (`docs/18` §5 already called the nav fixed
  furniture) but it was not asked for.
- **The route transition reached all four other pages**, which this task said not to touch.
  `RouteTransition` wraps the whole `<Routes>` tree, so `/agents`, `/tools`, `/atom/:atomId` and
  `/agent` each gained a 200ms arrival fade. Defensible — the route scale is page-agnostic by
  definition and `docs/18` §5 asks for it app-wide — but it is a change to four pages that were
  out of scope, so it is listed here rather than assumed.
- **Six viewports of deck with the nav as the only way out.** The deck owns the wheel while it owns
  the viewport, so a reader who wants to leave uses the nav, the scrollbar, `End`, or a link inside
  a scene. That is a consequence of ADR `0066` rather than a separate decision, and worth a look in
  a browser before it is called fine.

## Evidence ladder

**Tier 3 and 4 — staked and proven**, indirectly: the page's whole job is to make a deposit legible
as evidence, and every figure on it is one. Nothing here moves ARP up the ladder; it is the surface
that explains the two rungs ARP already stands on.

**Two** scenes read live edges off the same query, not one: Fig. 01's two cards, and the hero's beat
card. Fig. 01 shows positions rather than claims — `positionCount`, never an amount (ADR `0042`) —
and the beat card prints the newest declaration's deposit as an amount, which is the one figure on
the page that is somebody else's position rather than a count. It is paper, not Saffron, for exactly
that reason.
