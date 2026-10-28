# 0068 — Scenes do not overlap

**Status:** Accepted
**Date:** 2026-10-28
**Triggered by:** user decision, relayed through `arp-motion-reference/MOTION-V2.md` §0 D2

## Context

`SceneDeck` v1 reasoned itself into an overlap on purpose:

> This one keeps a continuous `progress` and derives each scene's opacity from its distance to it,
> **so the outgoing and incoming scenes overlap** and the fade is tied to the scroll rather than
> racing it.

`HOLD = 0.55` means a scene is fully opaque for a little over half its band and cross-fades across
the remaining 45%. For a list of rows that is right. For this page it is not, and the reference
caught it with a measurement: at `progress 1.8`, two display headings at 52px were on screen
simultaneously, one on top of the other — "Back what you use" reading through "Four rungs". Two
lines of 800-weight Archivo at 125% width overlapping is not a cross-fade, it is illegible.

The overlap was not the point. The point was that opacity stay **continuous in scroll position**,
because v1's predecessor switched on a rounded index and read as "a jump followed by a slow fade".
Those two properties are separable and v1 conflated them.

## Decision

**A scene is gone before the next one appears, and opacity stays continuous in scroll position.**

With `d = progress - i` and `t = clamp(|d| / GONE)`, `GONE = 0.48`, `SLIDE = 70`:

|                    | drift                                                        | opacity                                        |
| ------------------ | ------------------------------------------------------------ | ---------------------------------------------- |
| leaving (`d ≥ 0`)  | `y = -SLIDE·(1-(1-t)²)` — ease-out, moves on the first frame | `1 - t²` — ease-in, seen moving before it goes |
| arriving (`d < 0`) | `y = SLIDE·t²` — rises and slows as it lands                 | `1 - smoothstep(t)`                            |

`GONE` below 0.5 leaves 4% of a band with nothing on screen. At a 1700–2900 ms hand-over that is
70–120 ms: long enough that the two never collide, short enough to read as one beat between them
rather than a cut. The jump v1 fixed does not return, because opacity is still a continuous function
of scroll and never a class swap.

The asymmetry is deliberate and is what makes the gap work. Leaving eases **out** of position but
**in** to transparency, so the text is seen moving while it is still readable; arriving does the
reverse, so it is nearly opaque by the time it stops. Both ease-out on both channels and the scene
leaves before anyone notices it moved.

## Alternatives considered

- **Keep the overlap and cross-fade only the bodies, holding headings solid.** Two headings still
  coexist, just at different opacities, and the taller one wins. It also means the scene is no
  longer one object, which every other part of the deck treats it as.
- **Drop to `GONE = 0.5` exactly** so there is no empty frame at all. Tested in the reference: at
  exactly 0.5 the two meet at one opacity each and a 52px heading at 50% over another at 50% is
  still two headings. The gap has to be positive to be a gap.
- **Slide further so they never share the same space.** `SLIDE` past about 120px reads as a
  carousel, which is the note v1 already recorded at 18px being chosen over something larger.
- **Switch on a rounded index** — the original design, and the thing v1 existed to replace.

## Consequences

**Positive:**

- Text is never on top of text. This was a legibility defect, not a preference, and it was visible
  in a screenshot.
- The hand-over has a shape: something leaves, there is a beat, something arrives. With the Saffron
  cover from ADR `0067` filling that beat, the gap is not empty at all.

**Negative:**

- The deck now has a frame or two where the stage holds nothing but the veil. If the veil ever fails
  to draw — a canvas that did not size, a `--color-accent` that did not resolve — the reader sees a
  blank screen mid-hand-over instead of a cross-fade. The failure is louder than v1's would have
  been.
- `HOLD` is gone as a tuning knob. One constant (`GONE`) now sets both when a scene leaves and how
  long the gap is, so they cannot be tuned independently.

**Neutral (worth knowing):**

- `SLIDE` rose from 18 to 70px. That is not a contradiction of v1's "small, because a large slide
  reads as a carousel": at 18px over a 240 ms fade the movement was invisible, and the drift now
  spans a whole band rather than a quarter of one, so it reads as slow travel rather than a slide.

## References

- Build contract: `arp-motion-reference/MOTION-V2.md` §0 D2, §2.1 item 2
- Related ADR: `.claude/choices/0066-one-gesture-plays-one-scene.md` (the input half),
  `.claude/choices/0067-saffron-is-a-transition-material.md` (what fills the gap)
- Related doc: `docs/18_THE_MOTION_SPEC.md`
