# Claim field v2: hover first

**For:** Claude Code. **Component:** `app/src/components/atom/ClaimField.tsx` (used by `AtomPanel.tsx` and `AgentClaims.tsx`). **Reference:** `claim-field.html` next to this file. Open it in a browser, switch cases with the top bar, and use the reduced-motion toggle. It is the visual and behavioural truth. Every name and figure in its `CASES` blob is a sample: never ship one.

It answers `arp-claim-field-handoff.md` §12 (hover first) and §13 (weak points 1 to 5). **The reading head (the loupe) and its line to the card stay, exactly as in the original**: resting at -60° on the outer ring, tied to the card the whole time. What is new is how it moves. It obeys ADR 0073: a reveal answers the keyboard, reveals a fact the page holds, and moves no layout.

---

## 0. Two decisions for Maxime, before building

1. **Dot size by position count.** A backed dot grows with how many accounts stand behind it: `10 + 3.2·log2(positions)` px, capped at 17. **Never by amount** (dust, ADR 0042). A free claim is always 10px and hollow, so it can never look heavy. `docs/17` §4 proposed this; the current component refuses any size scale. If refused, every dot is 10px and nothing else changes.
Write his answer into ADR 0073's follow-up, or a new ADR.

---

## 1. What changes against the current component

| | current | v2 |
|---|---|---|
| the loupe | rests at -60°, rides a selected dot | **same rest, same line to the card, always drawn.** Every 4 s it **tours** to the next claim on its own. Pointing (hover or focus) makes it **glide** to the dot and ride it, and the tour resumes from there. The glide is an exponential ease, time constant 160ms (≈95% in 480ms), computed per frame from the real elapsed time. Instant under reduced motion |
| the line | three points from the head's centre | starts on the loupe's **rim**, then the corner at `RISE_DEGREES 35`, then the bar at `BAR_Y 0.055`, overshooting under the card. The card sits above it (`z-index`), so its border stops the line |
| hit target | 10px | **28px** invisible target, 10px drawn mark |
| one claim | one dot orbiting, looks broken | the full hairline ring and the card **always naming the nearest dot**, so it is never blank while the dot comes round |
| more than 36 on a ring | 36 dots and a number | 36 interactive dots, plus **every other claim as grain**: a 1.2px steel stipple on the same ring between the drawn dots, `aria-hidden`. 250 reads dense |
| many predicates | one ring each, unbounded | at most **5 rings**. Past 5, rings 5 and up fold into one last ring, `+N other predicates`. The legend still names each of them with its own count |
| opposition | steel ring | **`--color-alarm` ring**, offset 2px. The one semantic exception, and a counter-position is exactly a fact that contradicts the claim |
| zero claims | nothing | a dashed hairline ring around the core and one line: `Nothing points at {subject} yet. A claim made about it appears here as a dot.` |
| card | a sentence under the field | a card beside the field, tied to the loupe, reserved at 6.5rem, never moving (§4) |

Kept unchanged: ring geometry (`INNER 0.17`, `OUTER 0.42`, half-step offset on odd rings), ring speeds (`110 + 40·ring` s, alternating), filled = `positions > 0`, real links with the whole triple as their accessible name, the arrival class on the container with the stagger capped at 8, the Saffron core (ADR 0067), and the list below the field.

---

## 2. Geometry additions (`claim-field-geometry.ts`)

```ts
export const MAX_RINGS = 5;

// Fold: groups past MAX_RINGS - 1 merge into one last ring.
// Its rows keep their own predicate, so each dot still names its whole triple.
// shown = groups.slice(0, 4) + { label: `+${rest.length} other predicates`, rows: rest.flatMap(...) }

// Grain, for a ring with total > drawn:
extra = total - drawn
per   = ceil(extra / drawn)                 // grain points per gap between two drawn dots
for e in 0..extra:
    slot  = e % drawn
    layer = floor(e / drawn)
    a     = -π/2 + offset + (slot + (layer + 1) / (per + 1)) · step
    r'    = r + (per > 6 ? (layer odd ? 0.007 : -0.007) : 0)   // a second row only when crowded
    point (0.5 + r'·cos a, 0.5 + r'·sin a), radius 0.0036
```

The grain lives **inside the ring's rotating wrapper** (one `<svg viewBox="0 0 1 1">`), so it turns with its ring for free.

---

## 3. Interaction: the loupe

```
HEAD_DEGREES = -60   RISE_DEGREES = 35   BAR_Y = 0.055   HEAD_RADIUS = 0.032   DOT_R = 0.0142
GLIDE_MS = 160   TOUR_MS = 4000
```

- **Rest:** `rest = (0.5 + r_outer·cos(-60°), 0.5 + r_outer·sin(-60°))`.
- **Tour:** with nobody pointing, every `TOUR_MS` the loupe moves on its own to the next claim, in DOM order (ring order, then graph order), and wraps. The first 4 s it sits at rest. It glides with the same ease and rides the dot, and the card reads that claim, lit. `touring = touring === null ? 0 : (touring + 1) % dots`.
- **Pointing:** `onMouseEnter` **and** `onFocus` set `pointing = index`; `onMouseLeave` **and** `onBlur` clear it. Pointing overrides the tour; letting go sets `touring` to the dot you left and waits a full `TOUR_MS` before moving on, so the loupe never jumps away from under the reader. Rings keep turning, so the loupe **rides** the dot.
- **Every frame** (one `requestAnimationFrame` loop for the component's life):
  - `held = pointing ?? touring`; `target = held === null ? rest : rendered centre of that dot`. Read the centre with `getBoundingClientRect` against the field, so it is exactly where the turning ring has the dot.
  - `k = reducedMotion ? 1 : 1 - exp(-dt / GLIDE_MS)`, with `dt` the real frame time capped at 64ms.
  - `cur += (target - cur) · k`.
  - **Lock on arrival:** once `|target - cur| < 0.006` (about 2px), the loupe locks onto that dot and `k = 1` until the held dot changes. An ease alone trails a moving target by about a pixel, which reads as off centre.
  - Redraw the head at `cur` and the polyline: rim point → `(cur.x + |cur.y - BAR_Y| / tan 35°, BAR_Y)` → `(1.6, BAR_Y)`.
- **What the card reads:**
  - pointing or touring: that claim, lit (Saffron dot, scale 1.6, header dot Saffron, loupe stroke Saffron);
  - at rest: the **nearest outer-ring dot** to the loupe, polled every 120ms (not every frame), never blank. It lights only when the whole dot is inside the loupe: `distance ≤ HEAD_RADIUS - DOT_R`.
- **Layout:** the field has `margin-top: 2rem` and the card a `min-height: 6.5rem`, so the bar (`BAR_Y × 22rem ≈ 1.2rem` below the field's top) meets the card about halfway down. Below 640px the card goes underneath and the polyline is hidden; the loupe still moves.
- `Tab` walks the dots in DOM order, which is ring order then graph order.

The original's `getAnimations()[0].currentTime` arithmetic is no longer needed for the card. Reading rendered positions gives the same answer, and stays right when a backgrounded tab pauses the animation.

## 4. The card

```
● USES                                          header: dot (accent when lit, rule-strong otherwise),
                                                predicate, mono 10px caps
vault-auditor                                   subject, display 22px, truncated; mono 16px when nameIsId
1.2099 tTRUST · 12 positions                    mono 13px; "nothing behind it" in steel when positions = 0
0.0400 tTRUST against                           alarm, only when somebody took the other side
```

- `aria-hidden`: the link already carries the triple. 6.5rem min height, flex `1 1 22rem`, max 34rem, above the line's z-index.
- The figure is paper, not accent: it is somebody else's position.
- No count on the card, and no object (it is the page).

---

## 5. Legend

Above it, one line: `{edgeCount}{truncated ? "+" : ""} claims about {subject}`, then the key (filled, hollow, and the alarm ring only if any claim has opposition).

Below it, a grid, one row per ring:

- the ring number in mono grey, the predicate (mono when `labelIsId`), and on the right the count;
- the count reads `N claims`, or `N · 36 drawn, the rest as grain` past the cap (with `+` when `truncated`), then the group's own backing;
- for the folded ring, its members are listed one by one under it, each with its own count.

Never sum across groups.

---

## 6. Reduced motion and small screens

- **Reduced motion:** rings still, arrival instant, **no tour** (the loupe stays at rest), the loupe jumps instead of gliding, pointing still lights the dot and fills the card.
- **Below 640px:** the field is full width, the card goes underneath at full width, the legend is one column. No horizontal scroll at 390px.

---

## 7. Traps

- **Filled is `positions > 0`**, never `assets > 0` (dust, ADR 0042). The size scale reads `positions` too.
- **`AtomPanel`'s dust test watches for the word "backed"** anywhere on the page. Use "behind it".
- **The grain is decoration of a count the legend states.** It must stay `aria-hidden`, and the legend must keep saying "N drawn".
- **Arbitrary predicates.** Never assume a palette: rings are told apart by position, not colour, and the fold handles any number.
- **`check:tokens`.** Every `var(--…)` must exist in `index.css`. No new token is needed for v2.
- **Tailwind utilities that do not exist emit nothing**, and the unlayered `:focus-visible` and `button` rules in `index.css` beat utilities. Check the focus ring on the 28px target in a browser.

---

## 8. Done means

- `tsc -b`, `lint`, `test` and `check:tokens` pass. Extend `__tests__` for:
  - the fold at more than 5 groups;
  - the grain count equalling `total - drawn`;
  - dot size never above base when `positions === 0`;
  - the card reading "nothing behind it" at 0 positions.
- In a browser, all five cases render as in the reference: 0, 1, 3 predicates, 250 on one, 9 predicates.
- With nobody pointing, the loupe moves to the next claim every 4 s and the card follows.
- Keyboard only: `Tab` lights each dot, the loupe glides to it, and the card fills. Nothing moves the layout.
- Reduced motion: nothing turns, everything still reads.
- 390px: no horizontal scroll.
