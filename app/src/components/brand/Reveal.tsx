import {useEffect, useRef, useState, type ReactNode} from "react";

import {useScene} from "./scene-context";

/**
 * Bring an element in once, when it first reaches the viewport.
 *
 * ## Why this and not a motion library
 *
 * The ask was GSAP. This is the same effect in ~30 lines against ~70 kB, and `rules/ui.md`'s bundle
 * rule is there to ask that question — the same trade `PulseField` makes against Three.js. Nothing
 * here needs a timeline, an easing curve library or scroll scrubbing: one threshold, one
 * transition, once. If a later design wants sequenced timelines or scrubbing, that is the moment to
 * weigh a dependency, with a brief that names what it buys.
 *
 * ## The rules it obeys
 *
 * - **It is not mouse-reactive.** `rules/ui.md` rejects parallax, repulsion, hover tilt and cursor
 *   trails. This reads scroll position only through `IntersectionObserver`, never the pointer, and
 *   it never moves again after it has arrived.
 * - **`prefers-reduced-motion` skips it entirely** — the element is simply present, at its final
 *   position and opacity. Not a faster animation: none.
 * - **It never hides content it cannot bring back.** The hidden state is chosen at first render by
 *   {@link canAnimate}, which asks whether an `IntersectionObserver` exists at all — so a reader
 *   whose environment cannot reveal is never hidden in the first place. A reveal that can swallow
 *   the page is worse than no reveal. (The hidden state used to be set inside the effect, which is
 *   a cascading render and which eslint rejects outright.)
 */

/** Whether this environment can both animate and observe. Read once, at first render. */
function canAnimate(): boolean {
    if (typeof window === "undefined") return false;
    if (typeof IntersectionObserver === "undefined") return false;
    return !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Far enough that an element has finished arriving before it is read, short enough to feel owed. */
const ROOT_MARGIN = "0px 0px -12% 0px";

export function Reveal({
    children,
    /** Stagger within a group, in milliseconds. `index * 60` is the house step. */
    delayMs = 0,
    className = "",
}: {
    children: ReactNode;
    delayMs?: number;
    className?: string;
}) {
    const {pinned, isActive} = useScene();
    const ref = useRef<HTMLDivElement | null>(null);
    const [seen, setSeen] = useState(() => !canAnimate());

    // Pinned, the trigger is the scene arriving; stacked, it is the element reaching the viewport.
    const shown = pinned ? !canAnimate() || isActive : seen;

    useEffect(() => {
        const node = ref.current;
        if (node === null) return;
        if (pinned) return;
        if (!canAnimate()) return;

        const observer = new IntersectionObserver(
            (entries) => {
                for (const entry of entries) {
                    if (!entry.isIntersecting) continue;
                    setSeen(true);
                    observer.disconnect();
                }
            },
            {rootMargin: ROOT_MARGIN, threshold: 0.08},
        );
        observer.observe(node);
        return () => observer.disconnect();
    }, [pinned]);

    return (
        <div
            ref={ref}
            className={`motion-safe:transition-[opacity,transform] motion-safe:duration-[260ms] motion-safe:ease-[var(--ease-out-quart)] ${
                shown ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0"
            } ${className}`}
            // The delay is on the way **in** — which is the opposite of the usual reflex. Put it
            // on the hidden state and the element waits before leaving, so a scene change drags.
            style={shown ? {transitionDelay: `${delayMs}ms`} : undefined}
        >
            {children}
        </div>
    );
}
