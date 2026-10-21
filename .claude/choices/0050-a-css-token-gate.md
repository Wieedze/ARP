# 0050 — a gate for CSS custom properties, because neither existing gate reads a class name

**Status:** Accepted
**Date:** 2026-10-20
**Triggered by:** the `ui-reviewer` pass on `/tools` — five blocking findings, the first of which
`tsc` and `eslint` were both green across.

## Context

The `/tools` page was written against **five custom properties this app does not define**:
`--color-text`, `--color-text-dim`, `--color-focus`, `--text-micro`, `--color-surface-hover`. The
real vocabulary is `--color-fg`, `--color-fg-60`, `--text-label`, `--color-accent`.

An undefined custom property is invalid at computed-value time: inherited properties fall back to the
inherited value and everything else to its initial value. So **fourteen styling sites were inert in
the browser** — every dim text colour rendered at full white, every micro font-size inherited its
parent, and the row hover did nothing at all — while `tsc -b` returned 0 and `eslint --max-warnings 0`
returned 0.

Both gates were honestly green. Neither can see this: **a string in a class name is a string to
every tool in this repo.** That is the gap, and it is not specific to one page.

## Decision

**`app/check-css-tokens.ts`, wired as `bun run check:tokens`.** It parses `index.css`'s `@theme`
block for definitions and every `var(--…)` under `src/`, and exits non-zero naming the token and the
files that use it.

Two design points, both from failures demonstrated rather than imagined:

- **It scans `.css` as well as `.ts`/`.tsx`.** `index.css` holds 17 `var()` references of its own —
  `body`'s colour and type, the `button` border, `a:hover`, `::selection`, the focus ring — and the
  first version did not check them, so renaming a theme token would have broken the base layer
  silently. That layer is where this project's hardest-won rules live.
- **Definitions come from `@theme` only.** A pattern over the whole file counts a property defined
  inside a single class as defined everywhere, which would bless a token that resolves in one rule.

Both holes were closed and then **watched to fail**: a broken token inside `index.css` exits 1 naming
`src/index.css`, and a token defined only in `.scoped-only` exits 1 naming both files. A gate nobody
has seen fail is not known to work.

**Wired into the protocol, not just available.** `.claude/rules/ui.md` names it with the other three,
and `.claude/agents/ui-reviewer.md` step 6 runs it — so every UI task runs it by construction rather
than when somebody remembers.

## Alternatives considered

- **A Tailwind-aware check, or a rendered-page check.** Would also catch the two failure classes this
  one does not (see Consequences), and would be slow, need a browser or a build, and rot against a
  Tailwind version. For a check that must run on every UI task, running in under a second without a
  network matters more than completeness.
- **Define the missing tokens instead.** Five names for four existing concepts is vocabulary drift,
  not a palette. One of the five — `--color-surface-hover` — _was_ real in effect: two components
  carried the same literal fallback for it, so it is now defined in `@theme` once and both inline
  fallbacks are gone.
- **A comment in the rule file and nothing else.** That is what the repo had, and it is what failed.

## Consequences

**Positive:**

- The failure class is unreachable rather than documented. It cost 14 inert sites once.
- It found and fixed a pre-existing smell on the way: `ModuleList.tsx` was carrying
  `var(--color-surface-hover,rgba(255,255,255,0.03))` twice — a theme value hiding in a component.

**Negative:**

- **It covers one of three failure classes and must not be trusted further.** It reads `var()`
  references, not class names. A Tailwind utility that **does not exist** emits nothing in v4,
  silently, so a typo and a real utility both pass. And a utility **defeated by an unlayered rule** is
  invisible to it — the same review found `index.css`'s `button { border: 1px solid … }` beating
  every Tailwind `border-*` utility, which made the order control's selected state invisible. No
  static check sees that one; a comment at the call site is its only defence. The script's header
  says all of this, so nobody reads it as covering more than it does.
- One more command in the UI loop.

**Neutral (worth knowing):**

- There is no CI and no hook in this repo, so `check:tokens` is at parity with `lint` and `test`:
  all three run when a human or an agent types them. The `ui-reviewer` step is what makes it bite.
- A usage typo containing uppercase is reported under a truncated name, because the pattern is
  lowercase — it still **fails closed**, which is the property that matters.

## References

- Related rule: `.claude/rules/ui.md` (gate named), `.claude/rules/claims.md` §4 — "confirm a gate's
  scope covers your change before calling it green" is exactly what failed here, in its original form
- Related agent: `.claude/agents/ui-reviewer.md` step 6
- Script: `app/check-css-tokens.ts`
