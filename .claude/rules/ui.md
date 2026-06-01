# UI rules

Load for every task touching `app/`. Compose with `docs/05_UI_DESIGN.md` which holds the visual spec.

## Anti-templates

The UI must not look like a generic shadcn/ui starter, a v0.dev export, or a Vercel template. Things that signal "template":

- Three-column hero with a tagline + two CTAs
- Gradient backgrounds (`bg-gradient-to-br`)
- Universally rounded corners (`rounded-xl` on every surface)
- Emoji in body copy or icons
- "How it works" scrollytelling sections
- Generic skeleton loaders with the gray-block-on-gray-background pattern

Strip these reflexes. If you find yourself reaching for one, stop.

## Design language

- **Typography-driven.** Hierarchy comes from type weight and size, not from boxes and borders.
- **Dark-first.** Light mode is a later concern. Design and test in dark.
- **Mono for data, sans for prose.** Addresses, IDs, hashes, gas numbers — mono. Descriptions, names, copy — sans.
- **Negative space is content.** Don't fill the canvas. Empty space carries meaning.
- **Borders, not shadows.** Hairline borders (1px, low contrast) for separation. Avoid `box-shadow` for depth.

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

## Review

UI changes pass through the `ui-reviewer` agent before a task is marked complete. See `.claude/agents/ui-reviewer.md`.
