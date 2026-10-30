import {useId} from "react";

export type SparklinePoint = {
    /** What the x position is, for the label under the line and for the accessible summary. */
    label: string;
    value: bigint;
};

/**
 * A value over time, as one line and nothing else.
 *
 * Hand-rolled SVG rather than a chart library, and that is a `rules/ui.md` decision: adding a
 * dependency to the UI requires justification in the PR, and a polyline over normalised points is
 * twenty lines. A charting library would also bring its own visual language — gridlines, tooltips,
 * rounded everything — into a surface whose whole design rule is that hierarchy comes from type and
 * hairlines.
 *
 * **No axes, no gridlines, no gradient fill.** The number that matters is set in large mono type by
 * the caller, above the line; the line is the shape of how it got there. `05_UI_DESIGN.md`'s closing
 * rule is "when in doubt, remove something", and an axis on a 48px-tall series is something.
 *
 * ## Accessibility
 *
 * An SVG polyline is unreadable to a screen reader, so the shape is **also** given as text: the
 * figure, the span and the direction. `role="img"` prunes the subtree, and the name comes from a
 * `<title>` child referenced by `aria-labelledby`.
 *
 * The `aria-labelledby` is **redundant rather than wrong** — `<title>` as first child is already the
 * accessible name — and it is kept because it is explicit at the call site rather than relying on a
 * reader knowing that SVG rule. An earlier version of this paragraph claimed the code used
 * `aria-label` "rather than a `<title>` child", which was the opposite of what it did.
 *
 * One thing worth knowing before changing it: React 19 hoists `<title>` to `document.head`
 * everywhere **except** inside SVG, so this works only because it is inside an `<svg>`.
 */
export function Sparkline({
    points,
    describe,
    height = 48,
}: {
    points: readonly SparklinePoint[];
    /** Renders one value for the accessible summary — the caller owns the unit. */
    describe: (value: bigint) => string;
    height?: number;
}) {
    const titleId = useId();

    // Two points is the minimum for a line; one is a dot and says less than the number above it.
    // Both callers guard independently, so this is the backstop rather than the rule — a third
    // caller passing one point gets nothing rendered and no diagnostic, which is the known cost.
    if (points.length < 2) return null;

    const values = points.map((point) => point.value);
    const low = values.reduce((min, value) => (value < min ? value : min), values[0] ?? 0n);
    const high = values.reduce((max, value) => (value > max ? value : max), values[0] ?? 0n);
    const span = high - low;

    // Normalised to a 100 × `height` box with `preserveAspectRatio="none"`, so the line stretches to
    // whatever width the container gives it without the caller measuring anything.
    const coords = points.map((point, index) => {
        const x = (index / (points.length - 1)) * 100;
        // A flat series has `span === 0`; drawing it at y=0 would put it on the ceiling, so it sits
        // on the midline instead, which is what "no change" looks like.
        const ratio = span === 0n ? 0.5 : Number(((point.value - low) * 1000n) / span) / 1000;
        // Inset by half the stroke at both ends: on a `0 0 100 height` box the extreme points sit
        // exactly on y=0 and y=height, and the default clip eats half the 1px line there.
        const INSET = 1;
        return `${x.toFixed(2)},${(INSET + (1 - ratio) * (height - INSET * 2)).toFixed(2)}`;
    });

    const first = points[0];
    const last = points[points.length - 1];
    const direction =
        last === undefined || first === undefined
            ? ""
            : last.value > first.value
              ? "up"
              : last.value < first.value
                ? "down"
                : "flat";

    return (
        <div>
            <svg
                viewBox={`0 0 100 ${height}`}
                preserveAspectRatio="none"
                className="w-full"
                style={{height}}
                role="img"
                aria-labelledby={titleId}
            >
                <title id={titleId}>
                    {`${describe(last?.value ?? 0n)} on ${last?.label ?? ""}, ${direction} from ` +
                        `${describe(first?.value ?? 0n)} on ${first?.label ?? ""}, over ` +
                        `${points.length} points.`}
                </title>
                {/* The stroke is a class, not a `stroke=` attribute. An SVG presentation
                    attribute maps to a declaration ranked **below every author declaration**,
                    layered or not — the floor of the cascade. It renders today because nothing
                    sets `stroke` anywhere, and it would lose silently to any future `stroke-*`
                    utility or `svg {}` rule, including a layered one. `check:tokens` sees the
                    token either way, since it greps the raw text.

                    **And the `color:` prefix is load-bearing.** `stroke-[var(--color-accent)]`
                    compiles to nothing at all, silently — Tailwind cannot tell a colour from a
                    length in an arbitrary value without it, so it emits no rule and no warning.
                    That is the *second* failure class `rules/ui.md` names, the one where "a comment
                    at the call site is the only defence there is", and it is a different trap from
                    the cascade note above. Found by grepping the built stylesheet for the emitted
                    rule after making the change, which is the only thing that catches it. */}
                <polyline
                    points={coords.join(" ")}
                    fill="none"
                    strokeWidth="1"
                    vectorEffect="non-scaling-stroke"
                    className="stroke-[color:var(--color-accent)]"
                />
            </svg>
            <div className="mt-1 flex justify-between font-mono text-[length:var(--text-label)] text-[color:var(--color-steel)]">
                <span>{first?.label}</span>
                <span>{last?.label}</span>
            </div>
        </div>
    );
}
