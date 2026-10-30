# Motion v2: the landing as a scene sequence

**For:** Claude Code, working in this repo. **From:** the design session of 2026-10-27/28 with Maxime.
**Reference:** `docs/design/motion/index.html` (replaced by v2). Open it in a browser: it needs no build. The page is the visual and timing truth. **Where its header comment and this file disagree, this file wins**: the header was written early in the session and some of it is stale.

Read `docs/18_THE_MOTION_SPEC.md` and `.claude/rules/ui.md` first. This file says what changed against them and why.

---

## 0. Decisions to record before building

Maxime made each of these explicitly during the session. Several go against a written rule, so each one needs an ADR (or an amendment to an existing one) before the code lands. Do not decide any of them yourself; write them down as his.

| #   | Decision                                                                                                                                             | What it changes                                                                                                                                                            |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | **One gesture, one scene.** Inside the pinned deck, a single wheel event, swipe or key press plays the whole hand-over to the next scene on a timer. | `SceneDeck.tsx` said "nothing hijacks the wheel". The scrollbar stays native and draggable, Home/End still jump, and the first and last scenes hand back to native scroll. |
| D2  | **Scenes no longer overlap.** One scene's text is gone before the next one's appears.                                                                | Reverses `SceneDeck`'s "neighbours overlap" (HOLD 0.55). Opacity is still continuous in scroll position, so v1's "jump then fade" does not come back.                      |
| D3  | **Saffron as a transition material.** The dive into the core and the four Saffron spheres between scenes use the accent as decoration.               | `rules/ui.md` limits the accent to the primary action, the selected state and the viewer's own position. Needs an explicit exception.                                      |
| D4  | **The hero core is Saffron at zero declarations.**                                                                                                   | `PulseField` keeps the core grey when the count is 0 ("the accent means somebody paid"). Maxime wants the Source Field look: Saffron core, rings turning.                  |
| D5  | **The evidence ladder scene is removed** ("c'est inutile").                                                                                          | Landing loses Fig. 02.                                                                                                                                                     |
| D6  | **"Three ways to add a beat" becomes four jobs** (check, declare, list, be hired), taken from the README.                                            | Landing Fig. 03.                                                                                                                                                           |
| D7  | Copy changes listed in §3, including the removals Maxime asked for.                                                                                  | Landing prose.                                                                                                                                                             |

`docs/18` §5 rejects wipes and colour flashes for **route** changes. These transitions stay inside one page and are scroll-driven, so they do not contradict it, but say so in the ADR.

---

## 1. Tokens to add to `app/src/index.css`

`bun run check:tokens` must pass. Every `var(--…)` resolves or the style is inert, and `tsc` and `eslint` will not tell you.

```css
--scene-reveal: 700ms; /* an element arriving inside a pinned scene */
--scene-step: 150ms; /* between siblings inside a pinned scene */
--scene-rise: 28px; /* how far it rises */
--word-rise: 380ms; /* one word of the hero h1 */
--word-step: 34ms; /* between words on one rendered line */
--line-step: 110ms; /* between rendered lines */
--stagger-ceiling: 560ms; /* total stagger of one heading, never more */
--list-step: 30ms; /* list rows, first 8 only (LIST_CAP = 8 in JS) */
--route-out: 120ms;
--route-in: 200ms;
--loader-delay: 150ms; /* a cached route never shows a loader */
```

JS constants: these live in code, not CSS, because they are computed per frame:

```
MIN_HEIGHT 680, MIN_WIDTH 900       unchanged: below this, stacked
GONE 0.48                           a scene is gone at 0.48 of a band from its centre
SLIDE 70                            px of drift at GONE
STEP  dive 2400 · seed 2900 · other 1700   ms per hand-over (other = hash jumps)
settle 300                          ms of input swallowed after a move (trackpad inertia)
```

---

## 2. Mechanism

### 2.1 The deck (`SceneDeck.tsx`)

Keep: `position: sticky`, continuous `progress`, refusing to pin below 680×900 / under reduced motion / before JS, hash navigation owned by the deck, `inert` + `aria-hidden` on inactive scenes, and pinned stagger triggered by the scene becoming active.

Change:

1. **Start under the nav.** Pinned, the deck gets `margin-top: -88px`, so band 0 is the top of the page. Otherwise the first 88px scroll natively and the first wheel notch is spent before anything plays. The stage keeps `padding-top: 88px`.
2. **Signed drift, no overlap (D2).** With `d = progress - i` and `t = clamp(|d| / GONE)`:
   - leaving (`d ≥ 0`): `y = -SLIDE·(1-(1-t)²)` (ease-out, so it moves from the first frame) and `opacity = 1 - t²` (ease-in, so it is seen moving before it goes);
   - arriving (`d < 0`): `y = SLIDE·t²` and `opacity = 1 - smoothstep(t)`.
3. **Hero clears early.** Scene 0 also fades over `progress ∈ [0, 0.34]` (ease-out), because the dive needs the screen.
4. **Elements arrive when the cover opens,** not at the midpoint swap where the Saffron still hides them: `on = active && d ≥ opens`, with `opens = -1` for scene 0, `-0.33` for scene 1 and `-0.2` for the others. A scene plays **once**: leaving adds `played`, and later visits show it instantly.
5. **One gesture, one scene (D1).** On `wheel` (`passive: false`), `touchend` (|dy| > 30) and `keydown` (ArrowUp/Down, PageUp/Down, Space, Shift+Space), when the deck owns the viewport (`box.top ≤ 89 && box.bottom ≥ innerHeight - 1`):
   - the **first** event of any gesture steps to the next whole scene (`floor(p+0.02)+1` or `ceil(p-0.02)-1`) with a sine ease-in-out glide (`0.5 - 0.5·cos(πt)`), driven by `requestAnimationFrame` and `scrollTo({behavior: "instant"})`;
   - events during the move and for 300ms after it are swallowed (`preventDefault`);
   - past the first or last scene, the event is not prevented, so native scroll takes over.

   Duration: `STEP.dive` between scenes 0 and 1, `STEP.seed` for the others. Hash links glide too, with `STEP.other`. Ignore events from inputs, and ignore Ctrl+wheel (zoom).

6. **Rail.** Dots only, plus a fixed `02 / 06 · NAME` label at the bottom right. Both are hidden when the deck is not in view.

### 2.2 The field (new `SourceField` in Canvas 2D, replacing `PulseField`'s drawing)

It ports the approved Three.js values to 2D: 22 rings of `6k` dots. Ring radius fraction `f(u) = (8u - 7u²/2) / 4.5`, first ring at 0.52 of a 3.6 rim. Dot size `0.45 + 2.4·(1-u)^1.1`, colour paper fading to grey past `u = 0.55`, alpha `1 - 0.6u`. Rotation speed `±2π / (36 + 9k)` rad/s, alternating by ring. Y is squashed by `cos(0.35)` for the tilt. Saffron core (D4). Still under reduced motion. Port `draw()` and `geometry()` from the reference.

- **Pinned:** a fixed full-viewport canvas behind the stage. Centre `x = 0.76·w`, `y` = middle of the area under the nav, rim `min(0.52·(h-88), 0.25·w)`. That keeps it clear of the copy, whose `max-width` is `min(40rem, 44vw)`.
- **Stacked:** inside the hero. Below 900px wide it sits **above** the copy (320px tall), never behind body text.
- **The dive (scene 0 → 1).** `a = clamp(progress / 0.65)`, `zoom = 70^a`, centre lerped to the viewport centre. Dots stream past the edges and fade (`1 - smoothstep((zoom - 2.5) / 9)`). The core is drawn on the veil, covers the screen, then a hole from the centre opens over `progress ∈ [0.66, 0.96]`.

### 2.3 The veil (new): a second fixed canvas above the scenes (z 15, under the nav at z 20)

**Seeds, scenes 1 to 4.** Each scene already holds a Saffron sphere, half out of frame, in a spot it leaves empty. It appears over `[n-0.14, n]`. With `w = clamp((p - (n + 0.1)) / 0.8)`:

- cover: `cin = 1 - (1 - smoothstep(w/0.62))^1.8`, radius `r0 + (far - r0)·cin`, where `far` is the farthest **visible** corner (`y ≥ 88`) **exactly**. The disc reaches it as `cin` reaches 1, at the slowest point, so the last dark sliver does not snap shut. This was a visible "cut" until fixed.
- uncover: `cout = smoothstep((w - 0.62) / 0.38)`, a full rect with a circular hole of radius `cout^1.15 · reach` from a per-scene origin.

| from scene     | sphere centre (×w, ×h) | r0 (×h) | hole opens from (×w, ×h) |
| -------------- | ---------------------- | ------- | ------------------------ |
| 1 What you see | 0.90, 1.06             | 0.17    | 0.5, 1.0                 |
| 2 Why          | -0.06, 0.56            | 0.13    | 0.0, 0.5                 |
| 3 For you      | 1.04, 0.16             | 0.14    | 0.5, 0.5                 |
| 4 No score     | 0.50, 1.10             | 0.16    | 0.0, 1.0                 |

**Tried and rejected, do not bring back:**

- dots running ahead of the edge;
- a grid of shrinking dots for the uncover ("grossière");
- square stripes;
- the field travelling between scenes ("les cercles qui s'en vont et reviennent").

### 2.4 Arrival inside a scene

Pinned scenes use `--scene-reveal` / `--scene-step` / `--scene-rise`. Labels and eyebrows fade without sliding. h2s arrive by authored line (`--l × --scene-step`). The hero h1 arrives word by word, with the delay from the **rendered** line (`offsetTop`), recomputed on resize and capped at `--stagger-ceiling`. It keeps one readable sentence for assistive tech: a visually hidden full text, and the animated words `aria-hidden`. Figures never animate.

### 2.5 Route scale

Unchanged from the reference's lab: out 120ms, in 200ms, opacity only, loader only past 150ms, instant on popstate. Lists: the first 8 rows stagger, the rest arrive with row 8.

---

## 3. The six scenes and their copy

Every scene fits at **1440×680** between the nav and the bottom edge. Re-measure after building: if a scene grows, the deck stops pinning on screens where it pinned before, silently.

1. **Pulse (hero).** Label `ARP · Agent Reputation Protocol`. H1 `The reputation pulse for autonomous agents and tools.`. Lede `Every beat is someone paying to say what they saw.`. CTA `Open the agent index` and `or build against it →`. The beat card sits **under the CTA, in the left column** (`Pulse · 0 on mainnet`, `No declaration on this chain yet. Nobody has run the loop here, including us.`) and reads the real count. **The full-width ticker is removed**: it covered the field.
2. **What you see.** H2 `See what every agent runs on.` / dim `Choose by its tools. Earn as yours spreads.`. Label `Fig. 01 · two ways to read the record`. Two cards:
   - **Choosing an agent:** one agent and its tools, a filled dot for proven and a hollow dot for declared only. Footer `What it says it uses, and what it paid to prove. Then rate it, at a price.`
   - **Your tool or your skill:** one tool and the latest agents that declared it. Footer `Every agent that paid to say it used it, and when. List it first and hold a position: each agent that backs it after you pays more on the curve.`

   Rows arrive one by one. **In the app these cards read real data** (`use-find-agents`, `use-tool-usage`, `use-recent-declarations`) **or say there is none.** The reference's names (vault-auditor, crytic-runner…) are samples and must not ship.

3. **Why.** H2 `Your agent uses something.` / dim `Others follow. Both reputations grow.`. Label `Fig. 02 · how a reputation grows`. Left: three steps (`Your agent uses a tool`, `It takes a position`, `Others arrive and do the same`) and the line `Run several agents? Each one builds its own record.` Right: an **illustrative chart**, not data. Along the axis, your agent arrives first (Saffron dot), then five others. Two lines draw left to right: the tool's reputation, a white staircase, and your position, a Saffron curve. Keep its `aria-label`.
4. **For you.** H2 `Start by reading.` / dim `It costs nothing.`. Label `Fig. 03 · four things you can do`. Four cards:
   - `01 · check`: See who paid to stand behind an agent or a tool. Needs nothing · Wallet no.
   - `02 · declare` (primary, Saffron border): Say what your agent used. Costs from (real floor) · Needs wallet + ERC-8004 id.
   - `03 · list`: Add a tool that is not listed yet. You give its URL · Needs a wallet with TRUST.
   - `04 · be hired`: Let other agents find yours and call it. Needs an endpoint you run · ARP hosts nothing.

   Do **not** promise payment for being hired: ADR 0060 took hire and pay out of scope.

5. **No score.** `No score. No grade. No stars.` / grey `Just what agents really use.` / `On the record, for anyone to check.`. The lit lines go from grey to paper with scroll, over `progress ∈ [3.58, 3.92]`.
6. **Build.** H2 `Plug in without asking anyone.` / dim `It lives on a public chain, not on our servers.`. Label `Fig. 04 · build against it`. Two columns: "The usual way" (hollow dots, steel) against "With ARP" (filled dots, paper). The ARP lines come from the README and ADR 0045. Then the CTA row: `Open the agent index`, `Read the skill, nothing to install →` and `@arp-protocol/core` (no "npm": the package is not published).

**Removed by Maxime, do not reintroduce:**

- "Never signs" and "holds no key, has no send path";
- "The rest costs what it should";
- "and pay to mean it";
- "ARP has no opinion about any agent" and "Every number is somebody's deposit";
- "Over 444,000 agents" with its dot grid and its legend;
- the four-rungs ladder.

---

## 4. Traps nobody's checker sees

- **Undefined custom property.** `check:tokens` catches it. Run it.
- **A Tailwind utility that does not exist.** v4 emits nothing, silently. Check in the browser.
- **A utility beaten by an unlayered rule in `index.css`.** `button { border }` beats every `border-*`, which is how the hero button once shipped square. Comment at the call site when you work against a base rule.
- **`<a class="cta">`** is not covered by the `button` rule: declare the radius on it.
- **A `<canvas>` with only `left` and `right` set stays 300px wide** (replaced element). Give it an explicit width and height. This made the field tiny in the reference until fixed.
- **Two `class` attributes on one SVG element:** the second is ignored. Merge them.

---

## 5. Done means

- `tsc -b`, `lint`, `test`, `check:tokens` and `check:contrast` all pass.
- Measured in a browser at 1440×680, 1440×900, 1920×1080: every pinned scene sits between y = 88 and the bottom edge.
- One wheel notch from the top plays the full dive and lands on scene 1. A trackpad burst advances exactly one scene. Past scene 6, native scroll resumes.
- Under `prefers-reduced-motion` and at 390px wide: stacked, nothing hidden, nothing moving, no horizontal scroll, the field above the hero copy.
- No sample name or number from the reference in the app. Every figure comes from the chain or says it is not there.
- The ADRs for D1 to D7 are written and Maxime has accepted them.
