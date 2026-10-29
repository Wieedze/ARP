/**
 * The container shapes, in one place.
 *
 * Separate from `control-class.ts`, which exists for a cascade problem — `index.css`'s unlayered
 * `button`/`a` rules defeat utilities unless they carry `!`. A container has no such problem, so
 * these are ordinary class strings and the two concerns do not belong in one module.
 *
 * The shape is the design reference's own, `arp-design-handoff/reference/agents.html`'s `.stake`:
 * a 1px border, `--radius-card` (12px) and 18px of padding on the page background. The border is
 * `--color-rule` rather than the reference's `rule-strong`, matching the three cards the app had
 * already shipped (`Landing.tsx`, `ToolCatalog.tsx`, `AgentDirectory.tsx`) and `rules/ui.md`'s own
 * split: hairlines separate, `rule-strong` is for control borders and table head rules.
 */

/** A card: a bordered region that groups one thing a reader can act on. */
export const cardClass =
    "rounded-[var(--radius-card)] border border-[color:var(--color-rule)] p-[18px]";

/**
 * An **action** card, which is a different object from {@link cardClass}.
 *
 * The design reference's own `.act`, from `arp-design-handoff 2/reference/agent-page.html`: a 1px
 * **rule-strong** border, a 12px radius, 20px of padding, on the **panel** background — and
 * `.act.primary` swaps the border colour for **saffron** and changes nothing else.
 *
 * (Quoted in prose rather than as CSS, because `check:tokens` reads this file as text and a `var()`
 * written as an **example in a comment** is a call site to it. `rules/ui.md` warns about exactly
 * that, and it has now caught three comments in this task alone.)
 *
 * Three differences from a plain card, each of them the reference's decision and not a preference:
 * a **stronger** border, because a thing you can act on should separate harder than a thing you
 * read; **20px** of padding rather than 18; and the **panel** background rather than the page's, so
 * the card sits above the surface instead of being drawn on it.
 *
 * `--color-bg` is this repo's name for the reference's `--panel` — `index.css` labels it "panels,
 * code blocks".
 */
export const actionCardClass =
    "rounded-[var(--radius-card)] border border-[color:var(--color-rule-strong)] bg-[color:var(--color-bg)] p-5";

/**
 * The one action a surface wants most, bordered in the accent.
 *
 * `rules/ui.md` spends Saffron on "the primary action", and this is the border form of that. The
 * reference does the same and nothing else to it — no fill, no shadow, no second colour.
 */
export const primaryActionCardClass =
    "rounded-[var(--radius-card)] border border-[color:var(--color-accent)] bg-[color:var(--color-bg)] p-5";

/**
 * An action card's heading: display type, not body weight.
 *
 * The reference sets it at 22px, line-height 1, weight 800, stretch 125%. This is the
 * hierarchy the agent page was missing — the user's words: _« tout est pareil »_. `type-face`
 * carries the face without a size, which is what it exists for, so the size comes from a utility
 * that is not inert against it.
 */
export const actionHeadingClass = "type-face text-[22px]";
