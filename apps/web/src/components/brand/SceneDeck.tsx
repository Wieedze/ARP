import {Children, useEffect, useRef, useState, type ReactNode} from "react";

import {SceneContext} from "./scene-context";
import {GONE, handOver, heroClear, opensAt} from "./scene-hand-over";
import {SourceField} from "./SourceField";
import {clamp} from "./source-field-geometry";
import {NAV_HEIGHT} from "./nav-height";

/**
 * A scroll-driven sequence of full-viewport scenes: one at a time, handing over through Saffron.
 *
 * ## What it is
 *
 * The user's ask, 2026-10-27: _« je veux une page avec ça, puis tout disparaît pour laisser
 * apparaître ça, et ainsi de suite, avec des fondus et une trame d'histoire type storytelling étape
 * par étape. »_ Not sections stacked down a long page — those all coexist, and each step has to
 * **own the screen** while it is being read.
 *
 * A tall spacer (one viewport per scene) with a `sticky` stage inside it, so the page is at a real
 * scroll offset throughout and the scrollbar is native.
 *
 * ## Three decisions here were the user's, and each one has an ADR
 *
 * - **One gesture plays one whole scene** (ADR `0066`). The first wheel notch, swipe or key press of
 *   a gesture glides to the next scene on a timer and the rest of that gesture is swallowed. This
 *   reverses v1's "nothing hijacks the wheel", and the reason is that a 2.4-second composition
 *   scrubbed by a quantised input device is sampled seven to ten times across a band: _« sinon ça
 *   fait saccadé »_. No easing fixes a sample rate. The bounds are in the ADR and in `rules/ui.md`.
 * - **Scenes do not overlap** (ADR `0068`). v1 held for 0.55 of a band and cross-faded over the
 *   rest, which put two 52px display headings on screen at once, one through the other. A scene is
 *   now gone by `GONE` in `scene-hand-over.ts`, and opacity is still a continuous function of
 *   scroll, so the jump v1 fixed does not return.
 * - **Saffron carries the hand-over** (ADR `0067`), drawn by {@link SourceField}, which owns the
 *   veil for the same reason the dive is one object: it starts behind the copy and ends in front.
 *
 * ## Where it refuses to run, and why that is the design rather than a fallback
 *
 * A scene that does not fit the viewport would be **cut off with no way to reach the rest** — the
 * stage cannot scroll, which is the whole point of it. So the deck renders as an ordinary stacked
 * document, with no gesture handling at all, whenever:
 *
 * - `prefers-reduced-motion: reduce` — `rules/ui.md`: reduced means none, not less. A pinned,
 *   scrubbed, gesture-driven sequence is precisely what that setting exists to suppress, and the
 *   stacked version still has to tell the story.
 * - the viewport is shorter than {@link MIN_HEIGHT} or narrower than {@link MIN_WIDTH}. A large
 *   share of readers only ever see the stacked version, so it is designed, not degraded.
 * - JavaScript has not run. The initial state is **stacked**, so a reader who never gets the effect
 *   gets the whole page rather than one screen of it. Motion never gates content.
 *
 * ## In-page anchors have to be taught
 *
 * A scene that is not the active one is `position: absolute` inside the sticky stage, so its box is
 * nowhere near the scroll offset that would make it active. The browser's own anchor handling
 * scrolls to the box and lands on the wrong scene: measured, clicking `#build` moved the page 268px
 * and left the target at `opacity: 0`. So the deck **owns hash navigation** — it finds which scene
 * holds the id and glides to that scene's band instead.
 */

/** Below these the deck stacks. A scene has to fit, and at 640px tall most of them do not. */
const MIN_HEIGHT = 680;
const MIN_WIDTH = 900;

/**
 * Milliseconds per hand-over.
 *
 * The dive out of the hero and the seeded covers are different lengths because they are different
 * animations: the dive has a 70× zoom to get through, and a seed has to grow from a sphere, close,
 * and open again.
 */
const STEP = {dive: 2400, seed: 2900, hash: 1700} as const;

/**
 * Milliseconds of input swallowed after a glide ends.
 *
 * Trackpad and macOS momentum deliver events for up to a second after the finger lifts. Tuned, not
 * derived: shorter double-steps, longer makes a deliberate second scroll feel ignored.
 */
const SETTLE = 300;

/** `NavSplit`'s height. It is `sticky top-0 z-20`, so the stage reserves this band and the
 *  deck's negative margin puts band 0 at the top of the page. */
const NAV = NAV_HEIGHT;

function canPin(): boolean {
    if (typeof window === "undefined") return false;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return false;
    return window.innerHeight >= MIN_HEIGHT && window.innerWidth >= MIN_WIDTH;
}

export function SceneDeck({children}: {children: ReactNode}) {
    const scenes = Children.toArray(children);
    const ref = useRef<HTMLDivElement | null>(null);
    const [pinned, setPinned] = useState(false);
    const [progress, setProgress] = useState(0);
    /**
     * Which scenes have finished playing once.
     *
     * A scene plays once: coming back to it shows its words and rows instantly. Without this,
     * scrolling up and down replays every stagger, and a reader who scrolls back to re-read a line
     * watches it arrive again instead.
     *
     * **A scene is played when it LEAVES, not when it arrives**, and the difference is not
     * cosmetic. The first version marked `Math.floor(progress)`, and a glide lands on exactly
     * `progress === index`, so a scene was played the moment it became active — while its own
     * sequence was still running. `.arp-scene-played` carries `transition: none`, which cancels a
     * running transition and snaps to its end value, so Fig. 02's authored four-second diagram
     * (`--draw-at` out to 3700ms) collapsed into the ~850ms between the cover opening and the
     * glide finishing: the staircase, the curve, five dots and two labels all appeared at once,
     * deterministically, every time.
     */
    const [played, setPlayed] = useState<ReadonlySet<number>>(new Set());
    /** Scenes that have been `data-on`. A scene cannot have left before it arrived. */
    const hasBeenOn = useRef<Set<number>>(new Set());

    /**
     * Read by the gesture handlers, which must not be re-bound on every scroll frame.
     *
     * Written in an effect rather than during render: a ref assignment in a render body is a lint
     * error here and a real hazard under concurrent rendering, where a render that is thrown away
     * would still have published its value. The handlers are bound in an effect too, so by the
     * time one can fire this has already been written.
     */
    const live = useRef({pinned, progress, count: scenes.length});
    useEffect(() => {
        live.current = {pinned, progress, count: scenes.length};
    });

    useEffect(() => {
        let frame = 0;

        function measure() {
            const node = ref.current;
            const on = canPin();
            setPinned(on);
            if (!on || node === null) return;

            // Scene-space position: 0 is the first scene centred, 1 the second, and so on. The
            // stage is pinned for `scenes.length` viewports, so one viewport of scroll is one
            // scene and the division needs no magic number.
            const box = node.getBoundingClientRect();
            const raw = -box.top / window.innerHeight;
            const next = clamp(raw, 0, scenes.length - 1);
            setProgress(next);

            // At most one scene is on at a time: only the active one can be, and only once the
            // cover has opened onto it. Record that it arrived…
            const active = Math.round(next);
            if (next - active >= opensAt(active)) hasBeenOn.current.add(active);
            // …and mark it played only once it is fully gone, which is also the last moment its own
            // sequence could still have been running.
            const left = [...hasBeenOn.current].filter((index) => Math.abs(next - index) > GONE);
            if (left.length > 0) {
                setPlayed((before) => {
                    const after = new Set(before);
                    for (const index of left) after.add(index);
                    return after.size === before.size ? before : after;
                });
            }
        }

        function onScroll() {
            cancelAnimationFrame(frame);
            frame = requestAnimationFrame(measure);
        }

        measure();
        window.addEventListener("scroll", onScroll, {passive: true});
        window.addEventListener("resize", onScroll);
        return () => {
            cancelAnimationFrame(frame);
            window.removeEventListener("scroll", onScroll);
            window.removeEventListener("resize", onScroll);
        };
    }, [scenes.length]);

    /**
     * Gesture ownership and hash navigation, bound once.
     *
     * One effect rather than two because they share `glide`: a hash jump is the same movement as a
     * step, with its own duration, and two copies of a `requestAnimationFrame` scroll animation
     * could fight each other for the scroll position.
     */
    useEffect(() => {
        const deck = ref.current;
        if (deck === null || !pinned) return;

        let moving = false;
        let endedAt = 0;
        let touchStart: number | null = null;

        const bandTop = (index: number) =>
            window.scrollY + deck.getBoundingClientRect().top + index * window.innerHeight;

        /** Owned as soon as the deck is under the nav, not once its top has reached 0 — otherwise
         *  the first `NAV` px scroll natively and the first notch is spent before anything plays.
         *
         *  An arrow rather than a `function`, and so is `go` below: TypeScript carries the
         *  non-null narrowing of `deck` into a closure created after the guard, but not into a
         *  hoisted function declaration, which it has to assume could run first. */
        const owns = (): boolean => {
            const box = deck.getBoundingClientRect();
            return box.top <= NAV + 1 && box.bottom >= window.innerHeight - 1;
        };

        function glide(index: number, ms: number) {
            const from = window.scrollY;
            const to = bandTop(index);
            if (Math.abs(to - from) < 2) return;
            moving = true;
            const started = performance.now();
            function tick(now: number) {
                const t = clamp((now - started) / ms);
                // Sine in-out: it leaves at once, gently. A cubic in-out sat still for the first
                // fifth of the move, which read as a delay before the animation rather than as
                // the start of it.
                const eased = 0.5 - 0.5 * Math.cos(Math.PI * t);
                window.scrollTo({top: from + (to - from) * eased, behavior: "instant"});
                if (t < 1) requestAnimationFrame(tick);
                else {
                    moving = false;
                    endedAt = performance.now();
                }
            }
            requestAnimationFrame(tick);
        }

        /** Step one whole scene. Returns false at either end, where native scroll takes over. */
        function step(direction: number): boolean {
            const {progress: here, count} = live.current;
            // The 0.02 slack keeps a step from landing on the band it started on when the scroll
            // position is a hair off an integer, which it is after any glide.
            const target = direction > 0 ? Math.floor(here + 0.02) + 1 : Math.ceil(here - 0.02) - 1;
            if (target < 0 || target > count - 1) return false;
            const leaving = Math.min(target, Math.round(here));
            glide(target, leaving === 0 ? STEP.dive : STEP.seed);
            return true;
        }

        function onWheel(event: WheelEvent) {
            if (!owns() || event.ctrlKey || event.deltaY === 0) return;
            // Only the tail of the gesture that started a move is swallowed — the *first* event of
            // any gesture plays the whole hand-over.
            if (moving || performance.now() - endedAt < SETTLE) {
                event.preventDefault();
                return;
            }
            if (step(Math.sign(event.deltaY))) event.preventDefault();
        }

        function onTouchStart(event: TouchEvent) {
            touchStart = event.touches[0]?.clientY ?? null;
        }

        function onTouchMove(event: TouchEvent) {
            if (!owns() || touchStart === null) return;
            const dy = touchStart - (event.touches[0]?.clientY ?? touchStart);
            const {progress: here, count} = live.current;
            const atEnd = (here >= count - 1.001 && dy > 0) || (here <= 0.001 && dy < 0);
            if (moving || !atEnd) event.preventDefault();
        }

        function onTouchEnd(event: TouchEvent) {
            const from = touchStart;
            touchStart = null;
            if (from === null || !owns() || moving) return;
            const dy = from - (event.changedTouches[0]?.clientY ?? from);
            if (Math.abs(dy) > 30) step(Math.sign(dy));
        }

        /**
         * Anything that has its own meaning for Space or an arrow key.
         *
         * `button`, `a` and `summary` are the ones that mattered: `owns()` is true from scroll
         * position 0, so with focus on the nav's chain toggle or the wallet button, Space stepped a
         * scene and `preventDefault()` suppressed the control's own click. A deck that eats the
         * keyboard outside itself is not "bounded".
         */
        const OWN_KEYS = "input,textarea,select,[contenteditable],button,a,summary,[role='button']";

        function onKeyDown(event: KeyboardEvent) {
            if (!owns()) return;
            const target = event.target;
            if (target instanceof Element && target.closest(OWN_KEYS) !== null) return;
            const down =
                event.key === "ArrowDown" ||
                event.key === "PageDown" ||
                (event.key === " " && !event.shiftKey);
            const up =
                event.key === "ArrowUp" ||
                event.key === "PageUp" ||
                (event.key === " " && event.shiftKey);
            if (!down && !up) return;
            if (moving) {
                event.preventDefault();
                return;
            }
            if (step(down ? 1 : -1)) event.preventDefault();
        }

        const go = (hash: string): boolean => {
            if (hash === "" || hash === "#") return false;
            const target = deck.querySelector(`[id="${CSS.escape(hash.slice(1))}"]`);
            const scene = target?.closest("[data-scene]");
            const index = Number(scene?.getAttribute("data-scene") ?? "-1");
            if (!Number.isInteger(index) || index < 0) return false;
            glide(index, STEP.hash);
            return true;
        };

        function onClick(event: MouseEvent) {
            if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey) {
                return;
            }
            const target = event.target;
            if (!(target instanceof Element)) return;
            const href = target.closest("a[href^='#']")?.getAttribute("href");
            if (href === undefined || href === null) return;
            if (go(href)) {
                event.preventDefault();
                // `history.replaceState` rather than the router: a router navigation to the same
                // path with a new hash remounts nothing but does re-run the deck's effects, and
                // `RouteTransition` is keyed on `location.key`, so the whole page would fade. The
                // cost is that `useLocation().hash` desyncs — nothing on this page reads it, and a
                // reader who copies the URL still gets the right anchor.
                history.replaceState(null, "", href);
            }
        }

        function onHashChange() {
            go(window.location.hash);
        }

        // A deep link that arrives with the page, not only one clicked once it is open.
        if (window.location.hash !== "") {
            requestAnimationFrame(() => go(window.location.hash));
        }

        window.addEventListener("wheel", onWheel, {passive: false});
        window.addEventListener("touchstart", onTouchStart, {passive: true});
        window.addEventListener("touchmove", onTouchMove, {passive: false});
        window.addEventListener("touchend", onTouchEnd);
        window.addEventListener("keydown", onKeyDown);
        document.addEventListener("click", onClick);
        window.addEventListener("hashchange", onHashChange);
        return () => {
            window.removeEventListener("wheel", onWheel);
            window.removeEventListener("touchstart", onTouchStart);
            window.removeEventListener("touchmove", onTouchMove);
            window.removeEventListener("touchend", onTouchEnd);
            window.removeEventListener("keydown", onKeyDown);
            document.removeEventListener("click", onClick);
            window.removeEventListener("hashchange", onHashChange);
        };
    }, [pinned]);

    if (!pinned) {
        return (
            <>
                {/* Stacked, the field lives in the hero and there is no veil. */}
                <StackedScenes scenes={scenes} />
            </>
        );
    }

    const active = Math.round(progress);

    return (
        <div
            ref={ref}
            // `svh` rather than `vh`: on mobile the dynamic toolbar makes `vh` taller than what is
            // actually visible, which clips a pinned scene. Harmless above `MIN_WIDTH`, correct
            // below it. The negative margin puts band 0 at the top of the page, so the first notch
            // plays the dive instead of scrolling the stage into place.
            className="arp-deck-pinned"
            style={{height: `${scenes.length * 100}svh`, marginTop: -NAV}}
        >
            <div
                className="sticky top-0 flex h-[100svh] items-center overflow-hidden"
                style={{paddingTop: NAV}}
            >
                <SourceField pinned progress={progress} />
                <div className="relative z-[1] w-full">
                    {scenes.map((scene, index) => {
                        const {opacity, y} = handOver(progress - index);
                        const isActive = index === active;
                        // The hero clears early: the dive needs the screen, and `handOver` alone
                        // would leave the copy half-lit over the growing core.
                        const lit = index === 0 ? opacity * heroClear(progress) : opacity;
                        return (
                            <div
                                key={index}
                                // `will-change` only on the two scenes actually moving. On all
                                // six it is six permanent composited layers at full viewport size,
                                // for the page's lifetime — which is what the property's own spec
                                // warns against, and four of them are never mid-transition.
                                className={`arp-scene w-full ${
                                    Math.abs(progress - index) < 1
                                        ? "will-change-[opacity,transform]"
                                        : ""
                                } ${
                                    isActive
                                        ? "relative"
                                        : "pointer-events-none absolute inset-x-0 top-0"
                                } ${played.has(index) ? "arp-scene-played" : ""}`}
                                style={{
                                    opacity: lit,
                                    transform: `translate3d(0, ${y.toFixed(1)}px, 0)`,
                                    transitionProperty: "opacity, transform",
                                    transitionDuration: "var(--scene-fade)",
                                    transitionTimingFunction: "var(--ease-out-quart)",
                                }}
                                data-scene={index}
                                // The elements inside a scene start arriving as the Saffron cover
                                // **opens** onto it, not at the midpoint swap, where the cover
                                // still hides them.
                                data-on={isActive && progress - index >= opensAt(index)}
                                // A scene nobody can see is out of the tab order and out of the
                                // accessibility tree; otherwise six screens of links are reachable
                                // at once and a reader has no idea where they are.
                                aria-hidden={isActive ? undefined : true}
                                inert={isActive ? undefined : true}
                            >
                                <SceneContext.Provider
                                    value={{pinned: true, isActive, progress, index}}
                                >
                                    {scene}
                                </SceneContext.Provider>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}

/**
 * The deck as an ordinary document.
 *
 * Not a degraded mode: `prefers-reduced-motion`, a short viewport, a narrow viewport and a page
 * whose JavaScript has not run all land here, which between them is a large share of readers. Each
 * scene still reveals its blocks on first intersection, because that is the one scale that works
 * without pinning anything.
 */
function StackedScenes({scenes}: {scenes: readonly ReactNode[]}) {
    /**
     * Which scenes have been seen — **and every one of them when nothing can observe**.
     *
     * Chosen at first render rather than corrected in an effect. An environment with no
     * `IntersectionObserver` never hides anything in the first place, so there is no frame in which
     * the page is blank, and nothing has to cascade a render to undo it. A reveal that can swallow
     * the page is worse than no reveal.
     */
    const [seen, setSeen] = useState<ReadonlySet<number>>(() =>
        typeof IntersectionObserver === "undefined"
            ? new Set(scenes.map((_, index) => index))
            : new Set(),
    );
    const ref = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        const node = ref.current;
        if (node === null) return;
        if (typeof IntersectionObserver === "undefined") return;
        const observer = new IntersectionObserver(
            (entries) => {
                for (const entry of entries) {
                    if (!entry.isIntersecting) continue;
                    const index = Number(entry.target.getAttribute("data-scene"));
                    if (!Number.isInteger(index)) continue;
                    setSeen((before) => (before.has(index) ? before : new Set(before).add(index)));
                    observer.unobserve(entry.target);
                }
            },
            {rootMargin: "0px 0px -12% 0px", threshold: 0.08},
        );
        for (const scene of node.querySelectorAll("[data-scene]")) observer.observe(scene);
        return () => observer.disconnect();
    }, [scenes]);

    return (
        <div ref={ref}>
            {scenes.map((scene, index) => (
                <div
                    key={index}
                    data-scene={index}
                    data-on={seen.has(index)}
                    className="arp-scene relative py-16 first:pt-0"
                >
                    <SceneContext.Provider
                        value={{pinned: false, isActive: true, progress: index, index}}
                    >
                        {scene}
                    </SceneContext.Provider>
                </div>
            ))}
        </div>
    );
}
