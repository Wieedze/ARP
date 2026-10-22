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
 * A text link rendered as an action.
 *
 * `a { color: inherit }` and `a { text-decoration: none }` are **both unlayered** in `index.css`, so
 * a link's colour utility needs the bang and a plain `underline` emits nothing at all — ten sites
 * across the app were dead before this module existed. `underline!` is `text-decoration-line` with
 * importance, which is what wins.
 *
 * One consequence worth knowing before adding to it: because `color` here is `!important`,
 * `index.css`'s `a:hover { color: var(--color-accent) }` can no longer fire, so these links have no
 * hover colour shift. The underline carries the affordance instead. An unbanged `hover:text-*` added
 * later would be inert for the same reason the original was.
 */
export const linkClass = "text-[color:var(--color-accent)]! underline! underline-offset-4";
