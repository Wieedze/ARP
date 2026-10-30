import type {CSSProperties} from "react";
import {cssVars} from "../../lib/css-vars";

/**
 * A staggered list row, as props to spread onto the row **itself**.
 *
 * ## Why props and not a component
 *
 * A wrapper would be a `<div>` between `<ul>` and `<li>`, which is invalid and which drops the list
 * out of the accessibility tree — so a staggered list of four tools would announce as four
 * paragraphs. The element that animates has to be the element that carries the semantics.
 *
 * ## Why it is capped
 *
 * `--list-step` is 30ms, tuned on the three rows a testnet query returns. Uncapped that is a
 * six-second wait on two hundred rows, and the directory pages do return two hundred. Row 9 onward
 * arrives with row 8, so the stagger reads as a sequence at the top of a list and costs nothing
 * below the fold.
 *
 * It lives in its own module rather than beside `Reveal`, because a file that exports both a
 * component and a helper breaks React Fast Refresh and eslint rejects it here.
 */
export const LIST_CAP = 8;

export function rowMotion(index: number, afterMs = 0): {className: string; style: CSSProperties} {
    return {
        className: "arp-row",
        style: cssVars({
            "--row-index": Math.min(index, LIST_CAP - 1),
            "--reveal-after": `${afterMs}ms`,
        }),
    };
}
