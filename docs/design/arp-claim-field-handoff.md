# The claim field — spec and source

A constellation of every claim about one atom, a reading head that rests on the outer ring and
**follows whatever you point at**, and a card naming the claim under it.

Everything needed to rebuild it is here: the arithmetic, the animation, the colour tokens, the
rules it has to obey and the current source. No repository access required.

---

## 1. What it is

An atom sits at the centre of a square box. Every **claim pointing at it** is a dot. Claims sharing
a predicate share a ring, innermost first — so the distance from the centre says *which predicate*,
and the count on a ring says *how many said it*.

The rings turn. A **reading head**, a small circle outline, rests on the outer ring's radius and
does not turn with it, so dots pass through it and the card names each one as it arrives.

Point at any dot, or `Tab` to it, and **the head leaves its resting place and rides that dot** for
as long as it is selected. The card follows. That is the interaction; the resting behaviour is only
what happens when nobody is pointing at anything.

```
        ·  ·  ·
     ·           ·          ┌──────────────────────────┐
   ·      ·  ·      ◯───────│ ● HAS TAG                │
  ·     ·  ●  ·      ·      │ minimalist-ui            │
   ·      ·  ·      ·       │ 0.00099 tTRUST · 1 pos   │
     ·           ·          └──────────────────────────┘
        ·  ·  ·
```

## 2. The data

```ts
type EdgeRow = {
    tripleId: string;
    name: string;          // the claim's subject
    compactName: string;   // the same, host dropped — what the card shows
    nameIsId: boolean;     // true when the graph named nothing, render mono
    subjectAtomId: string;
    backing: string | null;   // formatted amount, or null when nobody staked
    positions: number;
    opposition: string | null; // only when somebody took the other side
};

type GroupView = {
    label: string;         // the predicate
    rows: EdgeRow[];
    backing: string | null;
    positions: number;
};

<ClaimField
    groups={GroupView[]}   // one per predicate, render order = ring order
    subject={string}       // the atom this page is about
    edgeCount={number}     // across every group, for the legend
    truncated={boolean}    // the read hit the indexer's cap, so edgeCount is a floor
/>
```

## 3. The geometry — exact

All coordinates are fractions of the box's width. The box is **square**.

```
INNER = 0.17          radius of the innermost ring
OUTER = 0.42          radius of the outermost
MAX_DOTS_PER_RING = 36
```

**Ring radius**, for ring `i` of `n` groups:

```
n === 1  ?  OUTER
         :  INNER + (i / (n - 1)) * (OUTER - INNER)
```

**Dot placement** on a ring with `drawn = min(total, 36)` dots:

```
step   = 2π / drawn
offset = (i % 2) * (step / 2)        // half a step per ring, so two claims about the
                                     // same subject under two predicates do not line
                                     // up on one radius and read as a single mark
angle  = -π/2 + offset + position * step     // -π/2 is twelve o'clock; y is DOWN,
                                             // so increasing angle runs clockwise
cx     = 0.5 + r * cos(angle)
cy     = 0.5 + r * sin(angle)
```

`drawn` caps at 36 and the ring's legend says how many it actually has. **A field quietly showing
36 of 250 is the thing to avoid** — 250 dots on one ring is a solid line, so the cap is stated
rather than hidden.

## 4. The animation

One wrapper per ring, and the dots live **inside** it so the ring and its claims turn together.
Nothing moves but the angle, so a single transform on the wrapper is the whole of it and the
compositor does the work.

```css
@keyframes arp-orbit {
    to { transform: rotate(var(--orbit-to, 360deg)); }
}
.arp-orbit {
    animation: arp-orbit var(--orbit-for, 90s) linear infinite;
}
@media (prefers-reduced-motion: reduce) {
    .arp-orbit { animation: none; }
}
```

Set per ring by the component:

```
--orbit-for:  (110 + ring * 40) seconds      slower further out
--orbit-to:   ring % 2 === 0 ? 360deg : -360deg      direction alternates
```

Slower further out and alternating, so it reads as a constellation rather than one wheel.

### Arrival

The dots scale in from 0.4 with a staggered delay, one frame after mount, driven by a class on the
container rather than on each dot — one state change instead of 36 re-renders.

```css
.arp-claim {
    opacity: 1;
    transform: none;
    transition: opacity var(--reveal-fade) var(--ease-out-quart),
                transform var(--reveal-fade) var(--ease-out-quart);
    transition-delay: calc(var(--row-index) * var(--list-step) + var(--reveal-after));
}
.arp-claim-enter .arp-claim { opacity: 0; transform: scale(0.4); }
```

## 5. The reading head — the part worth getting right

```
HEAD_DEGREES = -60      from the +x axis, y down. Five minutes on a clock face:
                        a clock's minute is 6° and its zero is 90° back from this axis.
RISE_DEGREES = 35       the connector's angle
BAR_Y        = 0.055    where the horizontal bar sits, ABOVE the head
HEAD_RADIUS  = 0.032
```

**Head position**, on the *outer* ring's radius `r`:

```
hx = 0.5 + r * cos(HEAD_DEGREES)
hy = 0.5 + r * sin(HEAD_DEGREES)
```

**Connector**, a polyline of three points, taking the head's *current* point rather than a radius —
it is no longer always on one circle at one angle. The bar is above and the angled segment comes
down onto the ring:

```
corner_x = hx + |hy - BAR_Y| / tan(RISE_DEGREES)
polyline = (hx, hy) → (corner_x, BAR_Y) → (1.32, BAR_Y)
```

The corner is **always to the right** of the head, whichever side of the bar the head is on: the
card is over there, and a corner that crossed back would draw the line through the field it came
from.

It overshoots to `1.32` so the bar crosses the gap to the card whatever the box's measured width;
the card's own border stops it. `overflow: visible` on the SVG, `vector-effect="non-scaling-stroke"`
so it stays one hairline at every size.

### Which dot is under it

**Read the animation's own clock, never a timer of your own.**

```js
const animation = ringEl.getAnimations()[0];
const ms        = typeof animation?.currentTime === "number" ? animation.currentTime : 0;
const period    = (110 + ringIndex * 40) * 1000;
const sign      = ringIndex % 2 === 0 ? 1 : -1;
const turned    = (((ms / period) * 360 * sign) % 360 + 360) % 360;

const step  = 360 / dotsOnRing;
const exact = ((HEAD_DEGREES + 90 - turned) % 360) / step;
const at    = Math.round(exact);          // nearest dot — what the CARD reads
const offBy = Math.abs(exact - at) * step; // how far it still is, in degrees
```

Polled four times a second. A rAF loop would run sixty times a second to move a number that changes
every three seconds.

**Why `currentTime` and not `performance.now() - mountTime`:** a backgrounded tab pauses the CSS
animation and a wall clock does not, so the two part ways and only one of them is still describing
what is on screen. A card naming a different claim from the dot it points at is worse than no line
at all.

### Following the selection

While a dot is hovered or focused, the head rides it. The dot is turning, so this is a `requestAnimationFrame`
loop for as long as the selection lasts, and nothing at all when idle:

```js
const base   = Math.atan2(dot.cy - 0.5, dot.cx - 0.5);   // its resting angle, recovered
const turned = ((ms / period) * 2π * sign) % 2π;         // its ring's phase, same clock as above
head = { x: 0.5 + ring.r * cos(base + turned),
         y: 0.5 + ring.r * sin(base + turned) };
```

**Why this is not the mouse-reactive effect the rules forbid**, and it is the reason the keyboard
condition is worth keeping rather than a nuisance: a marker that follows the selection is *what a
selection looks like*, and focus is a selection too, so the head moves for `Tab` exactly as it moves
for the pointer. The same movement driven by the pointer alone, unreachable by keyboard, would be
the parallax and the hover-tilt this project refused four separate times.

Store only the followed point. The resting place derives from the ring's radius, so keeping it in
state is state that mirrors a prop; release it in the effect's **cleanup**, never in its body, or
it is a cascading render.

### Lighting the dot

The card reads the **nearest** dot, always — so it never goes blank between dots. The dot goes warm
only when the **whole of it is inside the head**, which is a smaller window:

```
HEAD_BITE = 0.0178              // headRadius 0.032 − dotRadius 0.0142
threshold = (HEAD_BITE / r) * (180/π)     // 2.4° at the outer radius
lit       = offBy <= threshold            // against a 10° step on a full ring
```

Hover and focus override both: a reader who reached for a dot asked for that one.

## 6. Dot states — read off the data, never invented

| | means | style |
| --- | --- | --- |
| filled | a position stands behind the claim | `bg` and `border` in `--color-fg` |
| hollow | declared, nothing behind it | `border` in `--color-steel`, no fill |
| ringed | somebody took the other side | add `ring-2` in `--color-steel` with a 2px offset |
| lit | under the reading head, or hovered | `--color-accent`, `scale(1.8)` |

**Filled is the position COUNT, never the amount.** Creating a term seeds its vault, so
`assets > 0` only means "this term exists". Three separate "has stake?" checks in this project were
wrong for exactly that reason.

**There is deliberately no size scale.** A dot sized by TRUST would invent a ladder the data does
not carry.

## 7. The card

Three lines and a header rule, 6.5rem of reserved height, 22–34rem wide.

```
● HAS TAG                      header: a lit dot, the predicate, mono 10px uppercase,
                               tracking 0.06em, --color-steel, rule underneath
minimalist-ui                  the subject, display type 22px, truncated
0.00099 tTRUST · 1 position    mono, --color-fg with the count in --color-steel
0.0009 against                 only when somebody took the other side, --color-alarm
```

Rules this card had to learn the hard way:

- **The object is not on it.** It is the page the reader is already on, so every line ended with
  the card's own address.
- **The count is not on it.** `Claims · 98` never changed as the head turned — the one line that
  could not vary, taking the top of the card.
- **The height is reserved whether or not a claim is active.** A card that appeared would push the
  field down under the pointer.
- **A claim nobody paid for says `nothing behind it`**, not a blank and not a zero.
- **An empty counter prints nothing at all.** 969 of 285,775 triples chain-wide have ever carried a
  position against; a zero there reads as "everybody agrees" when it means "nobody bothered".
- **Paper, not accent, for the figure.** It is somebody else's position. The accent is spent on the
  primary action and on the viewer's own position.

## 8. The layout

```
flex, items-start, gap-x-16, wrap

  field   aspect-square, w-full, max-w-22rem, sm:mt-8
  card    flex-1, min-w-22rem, max-w-34rem, min-h-6.5rem
  legend  basis-full, below both
```

`sm:mt-8` on the **field**, not `-mt-8` on the card. The card was lifted with a negative margin to
meet the bar, which took it out of its own flow, and it came to rest on the section rule above.
Pushing the field down gives the same offset with every box inside the space the layout gave it.

Measured: the bar lands `BAR_Y × 22rem = 1.21rem` below the field's top, and the card's middle
`3.25rem` below the row's top.

## 9. Colour tokens

```
--color-accent        #FFB020   saffron. The centre mark, the lit dot, the header dot.
--color-fg            paper, 15.5:1      a filled dot
--color-silver        8.5:1              body secondary
--color-steel         5.9:1              labels, hollow dots, rings, secondary figures
--color-rule          hairlines
--color-rule-strong   control borders, the connector
--color-ground        the page
--color-bg            panels and the card
--color-alarm         the one semantic exception: opposition
```

Type: **Archivo** for display and prose, **Geist Mono** for every figure, id, address and label.
Display type is Archivo 800 at `font-stretch: 125%`, letter-spacing `-0.02em`, line-height `0.92–1`.
Labels are mono 10–12px, uppercase, letter-spacing `0.06–0.12em`.

Radii: tag 6px, control 8px, button 10px, card 12px. **Full circles are reserved for dots and agent
sigils**, so a circle on this surface always means "an agent" — which is why every dot here being
the subject of a claim satisfies the rule by what the data is rather than by exception.

## 10. Hard constraints

- **No mouse-reactive effects.** No parallax, no repulsion, no hover tilt, no cursor trails. Motion
  may express data; it may not express the pointer. A reveal is allowed **only** when it also
  answers the keyboard, reveals a fact the page already holds, and moves no layout. This one does
  all three.
- **`prefers-reduced-motion` holds everything still.** The rings stop, the arrival is instant, and
  the head reads whichever dot is parked under it — correct rather than frozen.
- **The dots are real `<a>` elements, absolutely positioned — not `<circle>` in one `<svg>`.**
  Focus rings, accessible names and keyboard order then come from the DOM instead of being rebuilt.
  Each carries the whole triple as its accessible name, so focus announces it once and completely.
- **No box shadows, no gradients, no glow.** Borders and hairlines only.
- **No explanatory sentence on the surface.** A figure that needs a caveat gets a 15px "?" that
  opens one sentence on hover **and** keyboard focus.

## 11. The source

Two files plus the CSS above.

### `claim-field-geometry.ts`

```ts
export type ClaimDot = {index: number; ring: number; cx: number; cy: number};
export type ClaimRing = {ring: number; r: number; drawn: number; total: number};

const INNER = 0.17;
const OUTER = 0.42;
export const MAX_DOTS_PER_RING = 36;

export function claimField(groups: readonly number[]): {rings: ClaimRing[]; dots: ClaimDot[]} {
    const rings: ClaimRing[] = [];
    const dots: ClaimDot[] = [];
    let index = 0;

    groups.forEach((total, ring) => {
        const drawn = Math.min(total, MAX_DOTS_PER_RING);
        const r =
            groups.length === 1 ? OUTER : INNER + (ring / (groups.length - 1)) * (OUTER - INNER);
        rings.push({ring, r, drawn, total});

        const step = drawn === 0 ? 0 : (Math.PI * 2) / drawn;
        const offset = (ring % 2) * (step / 2);
        for (let position = 0; position < drawn; position += 1) {
            const angle = -Math.PI / 2 + offset + position * step;
            dots.push({
                index: index + position,
                ring,
                cx: 0.5 + r * Math.cos(angle),
                cy: 0.5 + r * Math.sin(angle),
            });
        }
        index += total;
    });

    return {rings, dots};
}
```

### `ClaimField.tsx`

The component is in this repository at `app/src/components/atom/ClaimField.tsx`, ~470 lines with
its comments. Everything it does is specified above; the parts worth copying verbatim are the
reading-head arithmetic in §5 and the dot states in §6.

---

## 12. The direction for the redesign: hover first

**The head is not load-bearing. It is the resting behaviour, and the interaction is the pointer.**

Following the selection is already built (§5), so the direction is set rather than proposed. What
is left is to make the *whole* component read that way: the head still rests at a fixed angle on
one ring, the card still opens from an auto-advance, and the geometry still assumes a mark that
mostly sits still.

You may cut the resting behaviour entirely, shrink the head to a mark, or replace the whole
mechanism. It is yours.

**The one rule you cannot cut**, and it is why this component was allowed at all:

> A reveal may answer the pointer **only when it also answers the keyboard**, reveals a fact the
> page already holds, and moves no layout.

Three conditions, all of them, every time:

1. **`onFocus` / `onBlur` alongside `onMouseEnter` / `onMouseLeave`.** A reveal only a mouse can
   reach is the effect this project rejects outright — along with parallax, repulsion, hover tilt
   and cursor trails, all four of which were proposed and refused.
2. **It reveals a fact, not a motion.** Data already on the page: the claim's subject, its stake,
   who took the other side. A decoration that merely responds to being pointed at is still
   forbidden.
3. **It moves no layout.** The slot is in the DOM at its final size before anything is hovered. A
   surface that reflows under the pointer *is* the pointer moving things.

Practical consequences for a hover-first design:

- Every dot stays a focusable element in DOM order, so `Tab` walks the constellation in the same
  sequence the eye does. That is why the dots are `<a>` and not `<circle>`.
- Whatever grows, lights or opens on hover has to do the same on focus, and look the same.
- A hit target of 10px is too small for a pointer at 36 dots on a ring. Give each dot an invisible
  larger target without changing what is drawn.
- Hovering **nothing** is a state too, and it is the common one. Decide what the card says then —
  the current answer is "whatever the head is on", and "the heaviest claim" or "nothing, with the
  slot held open" are both defensible.

## 13. What to improve

Known weak points, in the order they bother a reader:

1. **A one-claim field.** One orbiting dot has to look deliberate, not broken. It currently does
   not.
2. **Two hundred claims.** The cap draws 36 and says so, but 36 evenly spaced dots do not express
   "250". Something should.
3. **Arbitrary predicates.** Anybody may use any atom as a predicate — one book's atom on mainnet
   is the object of edges whose predicates are `Ethereum`, `Bitcoin`, `prefers` and
   `Donald Trump`. A design that assumes five known predicates will meet a sixth.
4. **The head rests on one ring.** It follows a dot on any ring once selected, but at rest it sits
   on the outer one, so with three predicates two of them turn with nothing watching them.
5. **Nothing expresses the amount.** Distance, size and speed are all unused, and the brief that
   started this proposed distance for stake and mass for backers. Both were left out because a free
   claim must be visible and must never be able to look heavy — but the room is there.
