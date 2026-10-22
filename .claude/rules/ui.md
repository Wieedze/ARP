# UI rules

Load for every task touching `app/`. Compose with `docs/05_UI_DESIGN.md` which holds the visual spec.

> **Amended 2026-10-22 by ADR `0057` — "The Source".** The identity changed: graphite neutrals,
> **Saffron `#FFB020`** in place of cyan, **Archivo + Geist Mono** in place of Inter + JetBrains
> Mono, and tiered corners in place of "nothing above 4px". The build contract is
> `arp-design-handoff/HANDOFF.md`; `arp-design-handoff/reference/*.html` is the visual truth.
>
> **The handoff's section 8 (screens and routes) is deliberately NOT adopted** — user decision,
> 2026-10-22: _« garde les règles du design mais garde notre implémentation »_. So the tokens, the
> logo, the sigils, the radii, the hints and the loaders apply; the landing page, the agent drawer
> and the rebuilt profile do not, and the pages we have keep their structure. Four of the handoff's
> assumptions about this repo are stale for the same reason — they are listed in ADR `0057`'s
> header.

## Anti-templates

The UI must not look like a generic shadcn/ui starter, a v0.dev export, or a Vercel template. Things that signal "template":

- Three-column hero with a tagline + two CTAs
- Gradient backgrounds (`bg-gradient-to-br`)
- Universally rounded corners. **Corners are now tiered, not forbidden** (ADR `0057` §4):
  `--radius-tag` 6px, `--radius-control` 8px, `--radius-button` 10px, `--radius-card` 12px. One
  radius on everything is still the template signal; `rounded-xl` everywhere is still a rejection.
  Full circles (`rounded-full`) are reserved for **dots and agent sigils**, so a circle on this
  surface always means "an agent".
- Emoji in body copy or icons
- "How it works" scrollytelling sections
- Generic skeleton loaders with the gray-block-on-gray-background pattern

Strip these reflexes. If you find yourself reaching for one, stop.

## Design language

- **Typography-driven.** Hierarchy comes from type weight and size, not from boxes and borders.
- **Dark-first.** Light mode is a later concern. Design and test in dark.
- **Mono for data, sans for prose.** Addresses, ids, hashes, amounts, timestamps and **labels** —
  Geist Mono. Descriptions, names, copy — Archivo. Labels are mono 10–12px, uppercase, letter-spacing
  `0.06em`–`0.12em`. Display type is Archivo 800 at `font-stretch: 125%`, letter-spacing `-0.02em` to
  `-0.03em`, line-height `0.92`–`1`.
- **One accent, and it is warm.** Saffron `--color-accent`, 10.4:1, spent on the primary action, the
  selected state, and the viewer's own position — nothing else. Ink on top of it is
  `--color-accent-ink`, never paper. `--color-alarm` remains the single semantic exception (ADR
  `0018`): a signature mismatch, or a module used but never declared. Nothing decorative.
- **Text levels are named for what they are, not for an alpha step.** `--color-fg` paper 15.5:1,
  `--color-silver` 8.5:1 body secondary, `--color-steel` 5.9:1 labels and secondary text,
  `--color-grey` 3.8:1 **dim display text only — never body copy**. Surfaces: `--color-ground` the
  page, `--color-bg` panels, `--color-raised` selected rows and drawers.
- **Negative space is content.** Don't fill the canvas. Empty space carries meaning.
- **Borders, not shadows.** Hairlines (`--color-rule`, 1px) for separation, `--color-rule-strong`
  for control borders and table head rules. No `box-shadow`, no glow, no gradients.
- **No explanatory sentence inside a card, a row or a panel** (ADR `0057` §5, and the user's
  standing instruction). A figure that genuinely needs a caveat gets a `Hint` — a 15px "?" that
  opens one sentence on hover **and** keyboard focus. Explanations live in the code comment, the ADR
  and `docs/`, not on screen.
- **No mouse-reactive effects.** No parallax, no repulsion, no hover tilt, no cursor trails — the
  user rejected all four. Row hover is a background change and nothing else.
- **One loader, and it is the mark.** `RingLoader` (ADR `0057` §6), static under
  `prefers-reduced-motion`. Not a grey block on a grey background.
- **Agent identity is a `Sigil`**, generated from chain data and never drawn by hand: a dot per
  declared module, fill carrying proven / declared-only / used-but-undeclared, size carrying the
  TRUST tier, Saffron centre when the viewer holds a position. No container, no background, no
  connecting lines — all three were tried and rejected.

## Component discipline

- shadcn primitives are allowed as a starting point, but **every component is restyled** to match the design language before shipping. Default classes (`rounded-md`, `border-input`, etc.) are not acceptable.
- A component shipped with default shadcn styling is a regression. Reviewer rejects on sight.
- Lucide icons are allowed for utilitarian glyphs (search, close, copy). No decorative icons. Never use them at large sizes as feature illustrations.

## Layout

- Max content width is intentional, not the viewport.
- Lists are dense by default. A list of modules shows ~15+ rows above the fold on a 13" laptop.
- Detail views use a two-column layout: metadata on the left, content on the right. Not stacked.
- Forms are single-column. Labels above inputs, never beside.

## Copy

- No marketing voice. No "Get started today!", no "Unlock the power of...".
- Microcopy is short, factual, and never apologetic. "Module not found" not "Oops! We couldn't find that module 😔".
- Empty states explain what would normally be there and how to make it appear. Not a marketing pitch.

## Accessibility

- Color contrast meets WCAG AA. Verify in dark mode.
- All interactive elements are keyboard-reachable. Focus rings are visible (not `focus:outline-none` without a replacement).
- Form inputs have associated labels (`<label htmlFor>` or `aria-label`).
- Buttons have accessible names. Icon-only buttons get `aria-label`.

## Performance

- Bundle size is monitored. Adding a dependency to the UI requires justification in the PR description.
- Lazy-load route-level code. No eager-loading of the entire app.
- Images are explicit `<Image>` (Next.js) with dimensions. No layout shift.

## Gates

Four, and the fourth exists because the other three cannot see it:

```
cd app && bunx tsc -b
cd app && bun run lint
cd app && bun run test
cd app && bun run check:tokens
```

`check:tokens` checks that every `var(--…)` resolves to a token `index.css` defines. It is also what
made ADR `0057`'s rename of 286 colour call sites safe in one pass, and it is literal about the text
it scans — it will flag a `var(--…)` written as an **example inside a comment**, which happened once
on the day it was adopted. ADR `0050`: a
page shipped against **five custom properties that do not exist**, and `tsc` and `eslint` were both
green while fourteen styling sites were inert in the browser — an undefined custom property is
invalid at computed-value time, so dim text rendered at full white and row hover did nothing. **A
string in a class name is a string to every other tool here.**

It covers one failure class and not three. Two remain uncovered and no static check sees them:

- a Tailwind utility that **does not exist** — v4 emits nothing, silently, so a typo passes;
- a utility **defeated by an unlayered rule** in `index.css`. `button { border: 1px solid … }` beats
  every Tailwind `border-*` utility regardless of specificity, which once made a selected state
  invisible. When you work against a base-layer rule, say so in a comment at the call site — that
  comment is the only defence there is.

## Review

UI changes pass through the `ui-reviewer` agent before a task is marked complete. See `.claude/agents/ui-reviewer.md`.
