import type {CSSProperties} from "react";

/**
 * Custom properties as a React `style` object, with the cast in **one** place.
 *
 * React's `CSSProperties` has no index signature for `--*`, so every inline custom property needs a
 * cast. `rules/code.md` requires a comment on each one, and this task introduced twelve — twelve
 * copies of the same comment is how a comment stops being read. Here is the comment:
 *
 * The cast is safe because the values go straight into the `style` attribute, where a custom
 * property is valid wherever a declaration is, and React does not interpret them. It is **not**
 * type-checked against anything: a token name with a typo compiles and renders nothing, which is
 * what `bun run check:tokens` exists to catch (ADR `0050`) — so a `var()` reading it must appear in
 * `index.css`, or the gate fails.
 *
 * Numbers are passed through unchanged rather than stringified, because a unitless custom property
 * is legitimate (`--reveal-index`, `--lit`, `--draw-length`) and React does not append `px` to a
 * property it does not recognise.
 */
export function cssVars(vars: Record<string, string | number>): CSSProperties {
    return vars as CSSProperties;
}
