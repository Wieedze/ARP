import {cssVars} from "../../lib/css-vars";

/**
 * A section heading whose authored lines arrive one after another.
 *
 * The unit here is a **line the writer wrote**, not a line the browser wrapped — these headings are
 * two short statements ("Start by reading." / "It costs nothing.") and the second is dim, so they
 * are already two elements for a reason that has nothing to do with motion. {@link
 * import("./Words").Words} is the other case, where the unit is a word and the line has to be
 * measured because it moves with the viewport.
 *
 * ## It carries its own size, and that is load-bearing
 *
 * `dim` is `--color-grey` at 3.84:1, which `rules/ui.md` allows for **display text only** — 18.66px
 * and up. `type-section` is a clamp whose floor is 28px, so a dim line is above the bar by
 * construction rather than by whatever its parent happened to set. Inheriting the size instead
 * made the component's accessibility depend on a caller remembering, and `check:contrast` said so.
 */
export function Lines({
    lines,
    className = "",
}: {
    lines: readonly {text: string; dim?: boolean}[];
    className?: string;
}) {
    return (
        <span className={`arp-lines type-section ${className}`}>
            {lines.map((line, index) => (
                <span
                    key={line.text}
                    className={`arp-line ${line.dim === true ? "text-[color:var(--color-grey)]" : ""}`}
                    style={cssVars({"--line-index": index})}
                >
                    {line.text}
                </span>
            ))}
        </span>
    );
}
