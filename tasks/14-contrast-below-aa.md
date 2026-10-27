# Task 14 — `--color-fg-40` is below AA wherever it carries meaning

> **Status: COMPLETE** 2026-10-27. The original token is gone and the replacement palette is
> measured, sorted and gated.

## What happened

**`--color-fg-40` no longer exists.** ADR `0057` replaced the whole palette — graphite neutrals with
four named text levels — so the specific finding dissolved. That is not the same as the problem being
solved, so the palette was re-measured rather than assumed.

`scripts/measure/contrast.ts` computes WCAG ratios for every token against every surface it can land
on. **The first version of that script was wrong** and it is worth recording how: it linearised red
and green and left **blue raw**, which inflated every luminance and reported `--color-accent` at
2.38:1 against the page. Caught by hand-checking one cell against the formula. This task's own
verification line says "measured, not eyeballed" — a wrong computation is exactly as confident as a
right one, and the only defence was arithmetic on paper.

The corrected table matches what `index.css` documents, which is itself a check:

| token            | worst surface | verdict                |
| ---------------- | ------------- | ---------------------- |
| `--color-fg`     | 13.73         | AA body                |
| `--color-silver` | 7.55          | AA body                |
| `--color-steel`  | 5.24          | AA body                |
| `--color-accent` | 9.24          | AA body                |
| `--color-alarm`  | 5.26          | AA body                |
| `--color-grey`   | **3.38**      | **AA large text only** |

Accent ink on accent: 10.17.

## The sort the task asked for

One token is below AA body, and `rules/ui.md` already restricted it — "dim display text only, never
body copy". So the question was not what to change it to, it was where the rule was being broken.

**Twenty-three sites were.** The footer at 11px, the wallet's disconnected state, "Graph read from",
the capability search's `try` label, every step label on `/rig`, the atom page's sentence object.
All raised to `--color-steel` (5.24 worst case).

**Two were not**, and keep the token: the agent panel's `h1` when the name is the indexer's stand-in,
and the index's `h2` dim half. Both are `type-title` / `type-section`, whose clamps floor at 28px —
above the 18.66px bar by construction.

## The gate, which is the part that lasts

`app/check-contrast.ts`, wired as `bun run check:contrast`. A use of a sub-AA token must sit within
four lines of a display-type class or be `aria-hidden`. The window is not laziness: both legitimate
uses put the class and the token on different lines — a `className` template split by the formatter,
and a `<span>` inside an `h2` whose class is on the parent. A one-line check flagged both, and a
check that flags correct code teaches people to silence it.

## The finding

`--color-fg-40` computes to **3.66:1** on the app background. `.claude/rules/ui.md` requires WCAG AA,
which is 4.5:1 for text below 18.66px.

60 usages across `app/src`. The ones that matter are where it is paired with `--text-label` (11px) —
roughly twenty sites, including the `Layout.tsx` footer.

Task 12 removed it from the tab strip, where the tone _was_ the signal rather than chrome, and took
the top tier from font weight instead. It introduced no new instance. The rest predate it and were
left alone as out of scope — correctly, but they are still a violation of a rule this repo states
plainly.

## What to decide, before touching anything

Not every use is equally wrong. The question is what the token is doing in each place:

- **Carrying meaning** — a verdict, a state, a distinction the reader must perceive. Sub-AA here is a
  defect: the information is simply not reaching some readers.
- **Chrome** — a separator, a placeholder, decoration next to text that is already legible. Sub-AA is
  defensible, and `ui.md`'s own "negative space is content" argues for keeping some things quiet.

Sort the 60 before changing any. A blanket raise would flatten a hierarchy that is deliberate in
places.

## Then

Raise the meaning-carrying ones to at least `--color-fg-60` (7.04:1) or give them weight instead of
tone, which is what the tab strip did. Leave the chrome, and say in the ADR which is which and why —
otherwise this comes back as a finding every time someone measures.

## Verification

Contrast measured, not eyeballed — there is no browser in the build environment and the whole reason
this was found is that a ratio was computed rather than judged. `ui-reviewer` pass.

## Out of scope

Redefining the palette. This is about which token is used where, not about changing what the tokens
are.
