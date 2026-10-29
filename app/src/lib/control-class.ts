/**
 * The class string for a button, in one place, with the `!` the cascade requires.
 *
 * ## Why this is a module and not three strings
 *
 * It was three — `AgentImport`, `StakeControl` and `ToolRegister` each held their own — and two of
 * them were **inert**. `index.css` carries an **unlayered** base rule:
 *
 * ```css
 * button {
 *   border: 1px solid var(--color-rule);
 *   border-radius: var(--radius-button);
 *   color: var(--color-fg);
 *   cursor: pointer;
 * }
 * ```
 *
 * An unlayered normal declaration beats a normal declaration in **every** `@layer`, and Tailwind
 * emits utilities into `@layer utilities`. So `border-[color:…]`, `text-[color:…]` and
 * `disabled:cursor-not-allowed` all lose unless they carry `!`. Measured by parsing the built
 * stylesheet for layer depth, not inferred: `@layer utilities` spans one byte range and
 * `button{border:` sits outside all of them.
 *
 * The visible cost of the copies: every button in the app rendered at `--color-border` (6% alpha)
 * instead of `--color-border-strong`, and kept `cursor: pointer` while disabled. Worse, the primary
 * action on the stake confirmation — "Sign in wallet", at the moment real TRUST is committed —
 * rendered with Cancel's border and Cancel's text colour, differing only in its label.
 *
 * `rules/ui.md` names this as one of two failure classes no static check sees, and says the comment
 * at the call site is the only defence there is. Three call sites meant three comments to keep true,
 * and one of them already described a defence that did not work. One module, one comment.
 *
 * ## What needs the bang and what does not
 *
 * | property | base rule sets it | needs `!` |
 * | --- | --- | --- |
 * | `border-width` | yes, 1px — so do not set it at all | n/a |
 * | `border-color` | yes | **yes** |
 * | `color` | yes, `--color-fg` — this is the one the table used to omit | **yes** |
 * | `cursor` | yes | **yes** |
 * | `border-radius` | yes, 10px since ADR `0057` — so do not set it at all | n/a |
 * | `opacity` | no | no |
 * | padding, font size | `@layer base` preflight only | no |
 *
 * The width is deliberately left to the base rule. A first draft of `ToolRegister`'s copy wrote
 * `border-0! border border-[…]!`, which is width zero with an important colour: an invisible button.
 *
 * The radius joined that list with ADR `0057`: 10px is the design default, so a `rounded-*` utility
 * here would be inert and a component that genuinely wants another radius needs `rounded-[…]!`. The
 * tokens are `--radius-tag` 6, `--radius-control` 8, `--radius-button` 10, `--radius-card` 12, and
 * full circles are reserved for dots and agent sigils so that a circle always means "an agent".
 */

/** Spacing and type, shared by both variants. */
const SHAPE = "px-3 py-1.5 text-[length:var(--text-body-sm)]";

/** Disabled state. `opacity` carries without a bang; `cursor` does not. */
const DISABLED = "disabled:opacity-40 disabled:cursor-not-allowed!";

/**
 * A secondary action — cancel, switch chain, look something up.
 *
 * No focus utilities: `index.css`'s global `:focus-visible` block is unlayered too, so it supplies
 * an accent outline no utility can defeat and none can usefully add to. Four
 * `focus-visible:outline-*` classes were being carried here for nothing.
 */
export const controlClass = `${SHAPE} border-[color:var(--color-rule-strong)]! ${DISABLED}`;

/**
 * The primary action, in accent — Saffron since ADR `0057`. Use it for the one button that commits.
 *
 * Both properties banged, which is the whole reason this constant exists separately: without them it
 * is indistinguishable from {@link controlClass}, and "the button that spends real TRUST looks like
 * the button that abandons it" is the defect that prompted this module.
 */
export const primaryControlClass = `${SHAPE} border-[color:var(--color-accent)]! text-[color:var(--color-accent)]! ${DISABLED}`;

/**
 * The one filled button in the app: a hero's call to action.
 *
 * {@link primaryControlClass} is bordered, which is right inside a confirmation panel — the panel
 * carries the weight and a filled button there would shout over the figures it is confirming. On a
 * hero there is no panel, and the reference's `.cta` is filled.
 *
 * `--color-accent-ink` on `--color-accent` measures **10.17:1** (`scripts/measure/contrast.ts`), so
 * the one place ink sits on the accent clears AA comfortably.
 *
 * **It is applied to an `<a>`, not a `<button>`, and that is why the radius is here.** Every other
 * control in this app inherits `--radius-button` from `index.css`'s unlayered `button { }` rule; an
 * anchor is not covered by it, so this shipped as the one hard-cornered control on the page —
 * `border-radius: 0px` measured in the browser against the header button's 10px. The same slip made
 * `border-[color:…]!` inert, because nothing set a width: a banged colour on a zero-width border
 * paints nothing. Dropped rather than completed; the fill is the affordance.
 *
 * The `text-…!` bang stays load-bearing: `index.css`'s unlayered `a { color }` would otherwise
 * repaint the label.
 */
export const heroControlClass =
    "px-5 py-2.5 text-[15px] font-bold rounded-[var(--radius-button)] bg-[color:var(--color-accent)]! text-[color:var(--color-accent-ink)]!";

/**
 * A text link rendered as an action.
 *
 * **No accent.** It was `text-[color:var(--color-accent)]!`, which put Saffron on every link in the
 * app — and `rules/ui.md` reserves the accent for three things: the primary action, the selected
 * state, and the viewer's own position. A link is none of them. The user cut it on sight
 * (2026-10-27): _« les liens en jaune, j'aime pas »_. The rule had said so first.
 *
 * What carries the affordance instead is the **underline**, and `index.css`'s base `a` rule now
 * supplies the colour: silver, paper on hover. So this constant is down to the one property the
 * cascade will not give for free.
 *
 * `a { text-decoration: none }` is **unlayered** in `index.css`, so a plain `underline` utility
 * emits nothing at all — ten sites across the app were dead before this module existed.
 * `underline!` is `text-decoration-line` with importance, which is what wins. The offset is an
 * ordinary utility and needs no bang.
 *
 * **There is deliberately no `decoration-*` here, and the story is worth the paragraph.** This
 * module shipped `decoration-[color:var(--color-rule-strong)]` without a bang, and it was **inert**
 * for the reason above one property further along: `text-decoration` is a **shorthand**, so the
 * unlayered `a` rule resets `text-decoration-color` to `currentcolor` and beats the layered
 * utility. Measured in the browser, the class on an `<a>` computed `rgb(169, 174, 178)` —
 * `--color-silver`, i.e. currentColor — while the identical class on a `<span>` computed
 * `rgb(67, 71, 75)`.
 *
 * Adding the bang made it apply, and **made the app worse**: `--color-rule-strong` on
 * `--color-ground` measures **2.05:1** (`scripts/measure/contrast.ts`), under WCAG 2.1 SC 1.4.11's
 * 3:1 for a cue that identifies a component — and this file's own argument is that the underline
 * *is* the affordance. Link text is `--color-silver`, dimmer than the `--color-fg` prose around it,
 * so the underline is the only positive cue a link has. currentColor draws it at **8.57:1**.
 *
 * So the inert utility had been shipping the **better** value for weeks, and the intended one had
 * no design authority at all: `arp-design-handoff/reference/*.html` sets anchors to the silver
 * token with `text-decoration: none`, in all four files — the handoff has no underlines, and its
 * affordance is the silver-to-paper hover. (That sentence quoted the reference's CSS verbatim at
 * first, and `check:tokens` rejected the file: the gate scans text, so a `var()` written as an
 * **example in a comment** is a call site to it. `rules/ui.md` warns about exactly this, and it
 * happened here inside the paragraph about a different cascade trap.) The rule-strong colour was
 * a plausible token that happened never to apply. It is gone rather than corrected to
 * `--color-steel` (5.95:1), because the thing to match is what the app has actually been showing.
 *
 * The lesson is not "add the bang". It is that **a utility measured inert is not yet a defect** —
 * what it would do when it applied had never been checked.
 *
 * The hover shift works again now that the colour is not banged here: the base `a:hover` rule
 * fires, and an unbanged `hover:text-*` added later would still be inert against it.
 */
export const linkClass = "underline! underline-offset-4";
