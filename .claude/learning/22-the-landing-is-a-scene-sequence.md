# 22 — The landing is a scene sequence, not a long page

**Task:** `docs/tasks/29-the-landing-is-a-scene-sequence.md`
**Completed:** 2026-10-30
**Commit:** `26450c6` (build) · `2da6c26` (two browser defects) · `f13e2b5` (verifier punch list)
**Verifier verdict:** PASS — second pass. First FAIL: eight items, **none of them in the page** —
a Gate check that could only fail, a nav figure stale in two places and a sixth copy of it, two
`as` casts the task's own helper was built to remove, and one untested module.

## What shipped

- `apps/web/src/components/brand/` — `SourceField.tsx` + `source-field-geometry.ts` (9 tests),
  `Words.tsx` + `words-timing.ts` (7), `Lines.tsx`, `RouteTransition.tsx`, `row-motion.ts` (4,
  added by the punch list), `scene-hand-over.ts` (6); `SceneDeck.tsx`, `Reveal.tsx`,
  `scene-context.ts` rewritten. `PulseField.tsx` deleted.
- `apps/web/src/pages/Landing.tsx` — six scenes, one gesture each, Saffron hand-overs.
- `apps/web/src/index.css` — 22 motion tokens at `26450c6` (25 now; the atom page added three in
  `53c022c`), plus the arrival rules as unlayered descendant selectors, because a utility cannot
  express "elements inside a scene that is not on yet".
- `apps/web/src/lib/css-vars.ts` — the `as CSSProperties` cast in one place with one comment.
- `scripts/measure/landing-fit.ts` — the browser gate. Found both defects no other gate could see.
- ADRs `0066`-`0070`; `rules/ui.md` amended for D1, D3, D4.

## Surprises

- **The browser gate found two defects that `tsc`, `eslint`, 459 tests, `check:tokens` and
  `check:contrast` were all green on**, and one of them was caused by this task's own fix for
  `check:contrast`: moving a font-size onto three lines made `max-w-[22ch]` resolve `ch` against
  15px body text instead of 72px display, so a scene went 1296px tall inside an `overflow-hidden`
  stage and clipped in silence. **A correction is not exempt from the rule it corrects.**
- **The gate itself rotted in two days, in two independent ways**, and both were invisible to every
  other check because the script lives in `scripts/` — inside `check:scripts`'s typecheck, which
  typechecks a wrong constant and a dead selector as happily as right ones.
  1. It clicked `a[href="#build"]`; the user cut that link on 2026-10-29; `?.click()` became a
     silent no-op and it reported the deck as having landed on the scene it never left. **A check
     that could only fail** — the mirror of the "check that could no longer fail" this same repo
     had already written a commit about (`684e136`). The verifier proved the product was fine by
     injecting a link and by deep-linking `/#build`: scene 5 at opacity 1.00 both ways.
  2. It carried `const NAV = 88` — the **fifth** copy of a number that `nav-height.ts` exists to
     hold once and that went 88 → 64 on 2026-10-29. Its fit assertion was therefore 24px stricter
     than the geometry it checks, and at 1440×680 band 5 sits at exactly 88: one pixel from failing
     a page nobody had touched. A **sixth** copy was in this task file's own Gate item 1.
- **`Landing.test.tsx` knew.** It carries a comment dated 2026-10-29 recording that the `#build`
  anchor was cut and that its guard now iterates over zero anchors. The DOM test disclosed the
  removal honestly; the browser script, one directory away and outside every app gate, did not
  inherit it. Two gates, one fact, one of them told.
- **The task's own helper missed two of its sites.** `css-vars.ts` was created *by this task*,
  its docstring saying the task introduced twelve casts and "twelve copies of the same comment is
  how a comment stops being read". Fourteen sites existed; twelve adopted it.

## Decisions made

- **The header's "all five browser checks run and pass" was narrowed to four, not papered over.**
  Gate item 2 has three clauses and the script asserts one; there is no assertion for `Home`/`End`
  or for native scroll resuming past scene 5. `claims.md` §4 — a gate cited green over a scope
  wider than it covers. Verifier's call, on the coordinator's referral; adding the two assertions
  is the next touch of that script and is recorded in the task file rather than left implicit.
- **The nav figure is corrected and the yes is scoped to the mechanism.** The user decided the
  sticky-nav scope question against "89px / 218px / 26% / all five pages"; measured 2026-10-30 it
  is 65px / 202px / 24% / 13 routes. The yes stands because it was a yes to the nav being sticky —
  the deck's geometry depends on it at any height — but the only evidence the file offered a future
  reader described a nav that had stopped existing.
- No new ADR for the punch list. Nothing in it was a design decision; all eight were a claim or a
  rule miss. ADRs `0066`-`0070` cover the task's seven real decisions.

## Rules touched

- `claims.md` §5 — **sufficient, and this is the clearest instance of it in the repo.** A number
  unified into one module, corrected in that module, and left stale in the script whose whole job
  is to check the thing the number describes, plus a sixth copy in the task file's prose. The rule
  already says a count has more copies than it looks like; what this adds is that **the sites
  outside the product's gates are the ones that survive**, because nothing fails when they are
  wrong.
- `claims.md` §4 — sufficient, and it caught the header. Worth noting the new shape: the gate here
  did not have too *narrow* a scope, it had a **dead** assertion. A green exit code and a passing
  line of output are not the same as a check that can still distinguish pass from fail.
- `code.md` "no `as` casts without a comment" and "a function shipped without tests is not done" —
  both sufficient, both breached, both one line to fix. Neither was catchable by `tsc` or `eslint`.
- `ui.md` — amended by this task for D1, D3, D4 per `CLAUDE.md`'s "When to update a rule". No
  further gap found.

## Suggestions for future tasks

- **A measurement script is product code for the purposes of `claims.md` §5.** When a constant is
  unified into one module, grep `scripts/` as well — it is outside every app gate, so a stale copy
  there is silent and permanent. `nav-height.ts`'s own docstring said "four places" and there were
  six.
- **When a check probes for something by a selector that can be deleted, print the count and
  assert the mechanism.** The fix here was two lines: drive `location.hash`, print the anchor
  count. A check whose subject can vanish without the check noticing is worth less than no check,
  because it reports a healthy product as broken and the next reader starts debugging the page.
- **Re-run a browser gate after a directory move or any commit near the surface, before quoting
  its old result.** Eight commits touched the landing between the gate and the close; two of them
  changed what the gate measures.
- **The next UI task owes the other routes the block and word scales.** The step is visible the
  moment you leave `/`, and the user's yes to the sticky nav explicitly did not cover it.
- Renumbering one of the two `docs/18` files is still open and is the user's convention call;
  `CLAUDE.md`'s map now marks the collision and says to cite either by its full filename.

## Evidence ladder

**Tier 3 and 4 — staked and proven**, served rather than advanced. Nothing here moves ARP up the
ladder; it is the surface that makes the two rungs ARP already stands on legible, and every figure
on it is a chain read or a sentence saying there is none.
