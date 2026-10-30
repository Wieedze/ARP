import {useLocation, useNavigationType} from "react-router-dom";
import type {ReactNode} from "react";

/**
 * The next route arriving — **the least visible of the three motion scales.**
 *
 * `docs/18` §5 is explicit about that: _« mais moins visible dans l'enchaînement des pages »_. A
 * page change that announces itself is a page change the reader waits through. So this is opacity
 * only, over `--route-in`, with no movement at all. The nav and the footer are fixed furniture and
 * are outside it by construction — `Layout` renders them above this.
 *
 * ## There is no out-fade, and that is a deviation from the design with a reason
 *
 * The reference's route lab fades the old page out over `--route-out` (120ms) before the new one
 * arrives, and §5 suggests that shape — while also rejecting _"anything that delays the first paint
 * of the new route by more than a frame or two"_. Those two are in tension, and the second wins:
 *
 * - React Router renders from the location in context, so holding the old page on screen means
 *   keeping a **remembered** location in state and swapping it on a timer. That is 120ms in which
 *   the new route has rendered and is deliberately not shown.
 * - It is also 120ms of two pages' worth of state alive at once, and a `setState` on a timer that
 *   has to be cancelled on every further navigation. The failure mode is a page stuck at
 *   `opacity: 0`, which is the worst outcome available here.
 *
 * `--route-out` and `.arp-route-out` are gone with it, rather than left defined and unused.
 *
 * **If the cut turns out to read as a cut**, the right fix is the platform's — `startViewTransition`
 * through React Router's `viewTransition` prop, which cross-fades a GPU snapshot of the old frame
 * and so costs no delayed paint and no React state. It needs the prop on every `Link` in the app,
 * which is a change worth making deliberately rather than as part of a motion pass.
 *
 * ## Back and forward are not slower than a click
 *
 * §5: _"a transition that runs on `popstate` makes history feel broken."_ `POP` gets no class at
 * all, so returning to a page is a swap and nothing else. Same under `prefers-reduced-motion`,
 * where `index.css`'s reduced-motion block makes the class inert anyway — this just avoids relying
 * on that.
 */
export function RouteTransition({children}: {children: ReactNode}) {
    const location = useLocation();
    const navigationType = useNavigationType();

    return (
        // Keyed on the location, so React replaces the subtree rather than reconciling two
        // different pages into each other — which is what makes the animation restart at all.
        <div key={location.key} className={navigationType === "POP" ? undefined : "arp-route-in"}>
            {children}
        </div>
    );
}
