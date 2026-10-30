import type {ReactNode} from "react";

import {cssVars} from "../../lib/css-vars";

/**
 * Bring an element in once, when its scene arrives.
 *
 * ## It is CSS, and the state is on the scene
 *
 * This used to own an `IntersectionObserver` per element and hold a `seen` boolean. It no longer
 * owns anything: {@link import("./SceneDeck").SceneDeck} flips one `data-on` attribute on the
 * scene, and `index.css`'s `.arp-scene[data-on] .arp-rev` rules bring the whole subtree in. One
 * attribute, one paint, and a scene of twenty elements costs one observer instead of twenty.
 *
 * It also fixes a failure the per-element version had by construction: in a pinned deck every scene
 * is mounted and inside the viewport the whole time, just transparent, so an observer fires for all
 * of them at once and every stagger plays off-screen before anybody scrolls.
 *
 * ## Why this and not a motion library
 *
 * The ask was GSAP. `docs/18` §6 sets the bar for a motion dependency — a timeline, scrubbed
 * progress, or reversibility. The block scale needs none of the three: it is one transition, once.
 * The deck's hand-over needs the second and got it in about sixty lines (ADR `0066`).
 *
 * ## The rules it obeys
 *
 * - **It is not mouse-reactive.** `rules/ui.md` rejects parallax, repulsion, hover tilt and cursor
 *   trails. Nothing here reads the pointer.
 * - **`prefers-reduced-motion` skips it entirely** — the media query at the end of `index.css`
 *   pins every one of these rules to its final state. Not a faster animation: none.
 * - **It never hides content it cannot bring back.** The hidden state is a descendant selector
 *   under `[data-on="false"]`, and the deck's initial attribute is `"true"` with a failsafe that
 *   turns the first scene on regardless. A reader whose JavaScript never runs sees the whole page.
 */
export function Reveal({
    children,
    /**
     * Which sibling this is. Multiplied by `--reveal-step` stacked, `--scene-step` pinned.
     *
     * It is an **order**, not a delay in ms: the two timings differ by nearly 2× and putting a
     * millisecond value here would hardcode one of them at the call site.
     */
    index = 0,
    /** Hold the whole group back, in ms — for a block that waits on another block's stagger. */
    afterMs = 0,
    /** Fade without sliding. For a label or an eyebrow, which reads as misaligned if it moves. */
    fade = false,
    className = "",
}: {
    children: ReactNode;
    index?: number;
    afterMs?: number;
    fade?: boolean;
    className?: string;
}) {
    return (
        <div
            className={`arp-rev ${fade ? "arp-rev-fade" : ""} ${className}`}
            style={cssVars({"--reveal-index": index, "--reveal-after": `${afterMs}ms`})}
        >
            {children}
        </div>
    );
}
