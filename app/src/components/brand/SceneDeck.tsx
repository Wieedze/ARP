import {Children, useEffect, useRef, useState, type ReactNode} from "react";

import {SceneContext} from "./scene-context";

/**
 * A scroll-driven sequence of full-viewport scenes: one at a time, cross-fading in place.
 *
 * ## What it is
 *
 * The user's ask, 2026-10-27, with two screenshots: _« je veux une page avec ça, puis tout
 * disparaît pour laisser apparaître ça, et ainsi de suite, avec des fondus et une trame d'histoire
 * type storytelling étape par étape. »_ Not sections stacked down a long page — those all coexist,
 * and he wants each step to **own the screen** while it is being read.
 *
 * A tall spacer (one viewport per scene) with a `sticky` stage inside it. The scrollbar behaves
 * normally, `Home`/`End`/`Page Down` work, and nothing hijacks the wheel — `position: sticky` over
 * JS pinning is the consensus recommendation and it is the reason this needs no scroll library.
 *
 * ## Why it cross-fades on progress rather than switching on an index
 *
 * The first version rounded scroll position to the nearest scene and swapped a class, with a 520ms
 * transition. That reads as a **jump followed by a slow fade**, which is the opposite of fluid: the
 * swap is instantaneous at the midpoint and the motion arrives after the decision.
 *
 * This one keeps a continuous `progress` and derives each scene's opacity from its distance to it,
 * so the outgoing and incoming scenes overlap and the fade is **tied to the scroll** rather than
 * racing it. Durations are down to {@link FADE_MS}: practitioner guidance for scroll reveals is
 * 150–250ms with opacity and a small transform, and the 520/620ms this started at is well past
 * where motion stops feeling responsive.
 *
 * ## Where it refuses to run, and why that is the design rather than a fallback
 *
 * A scene that does not fit the viewport would be **cut off with no way to reach the rest** — the
 * stage cannot scroll, which is the whole point of it. So the deck renders as an ordinary stacked
 * document whenever:
 *
 * - `prefers-reduced-motion: reduce` — `rules/ui.md`: reduced means none, not less. Pinning and
 *   scrubbed sequences are exactly what that setting exists to suppress, and the fallback still has
 *   to tell the story.
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
 * holds the id and scrolls to that scene's band instead. A pinned deck that breaks its own links is
 * worse than no deck.
 */

/** Below these the deck stacks. A scene has to fit, and at 640px tall most of them do not. */
const MIN_HEIGHT = 680;
const MIN_WIDTH = 900;

/** Practitioner consensus for a scroll reveal is 150-250ms. This is the upper half of it. */
const FADE_MS = 240;

/**
 * How much of a scene's travel is spent fully opaque, as a fraction of one viewport.
 *
 * At 0.55 a scene holds still for a little over half its band and the hand-over happens in the
 * rest, so the two overlap instead of one waiting for the other to finish.
 */
const HOLD = 0.55;

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

    // Hash navigation, because the browser's own lands on the wrong scene (see the docstring).
    useEffect(() => {
        const node = ref.current;
        if (node === null || !pinned) return;

        function bandOf(hash: string): number | null {
            const id = hash.slice(1);
            if (id === "" || node === null) return null;
            const target = node.querySelector(`[id="${CSS.escape(id)}"]`);
            if (target === null) return null;
            const scene = target.closest("[data-scene]");
            const index = Number(scene?.getAttribute("data-scene") ?? "-1");
            if (!Number.isInteger(index) || index < 0) return null;
            return window.scrollY + node.getBoundingClientRect().top + index * window.innerHeight;
        }

        function go(hash: string): boolean {
            const top = bandOf(hash);
            if (top === null) return false;
            window.scrollTo({top, behavior: "smooth"});
            return true;
        }

        function onClick(event: MouseEvent) {
            if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey) {
                return;
            }
            const anchor = (event.target as Element | null)?.closest?.("a[href^='#']");
            const href = anchor?.getAttribute("href");
            if (href === undefined || href === null) return;
            if (go(href)) {
                event.preventDefault();
                history.replaceState(null, "", href);
            }
        }

        function onHashChange() {
            go(window.location.hash);
        }

        // A deep link that arrives with the page, not only one clicked once it is open.
        if (window.location.hash !== "") requestAnimationFrame(() => go(window.location.hash));

        document.addEventListener("click", onClick);
        window.addEventListener("hashchange", onHashChange);
        return () => {
            document.removeEventListener("click", onClick);
            window.removeEventListener("hashchange", onHashChange);
        };
    }, [pinned]);

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
            const step = window.innerHeight;
            const raw = -box.top / step;
            setProgress(Math.min(Math.max(raw, 0), scenes.length - 1));
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

    if (!pinned) {
        return (
            <SceneContext.Provider value={{pinned: false, isActive: true}}>
                {scenes.map((scene, index) => (
                    <div key={index} className="py-16 first:pt-0">
                        {scene}
                    </div>
                ))}
            </SceneContext.Provider>
        );
    }

    const active = Math.round(progress);

    return (
        <>
            {/* `svh` rather than `vh`: on mobile the dynamic toolbar makes `vh` taller than what is
                actually visible, which clips a pinned scene. Harmless above `MIN_WIDTH`, correct
                below it. */}
            <div ref={ref} style={{height: `${scenes.length * 100}svh`}}>
                <SceneRail count={scenes.length} active={active} />
                <div className="sticky top-0 flex h-[100svh] items-center overflow-hidden">
                    <div className="relative w-full">
                        {scenes.map((scene, index) => {
                            // Distance in scenes. Zero while this one is centred, 1 when the next
                            // is. The fade spans `1 - HOLD`, so neighbours overlap.
                            const distance = Math.abs(progress - index);
                            const fade = Math.min(Math.max((distance - HOLD) / (1 - HOLD), 0), 1);
                            const isActive = index === active;
                            return (
                                <div
                                    key={index}
                                    className={`w-full will-change-[opacity,transform] ${
                                        isActive
                                            ? "relative"
                                            : "pointer-events-none absolute inset-x-0 top-0"
                                    }`}
                                    style={{
                                        opacity: 1 - fade,
                                        // Away from the centre, and in the direction it is going:
                                        // the outgoing scene leaves upward, the incoming arrives
                                        // from below. Small, because a large slide reads as a
                                        // carousel rather than a hand-over.
                                        transform: `translate3d(0, ${(progress - index) * -18}px, 0)`,
                                        transitionProperty: "opacity, transform",
                                        transitionDuration: `${FADE_MS}ms`,
                                        transitionTimingFunction: "var(--ease-out-quart)",
                                    }}
                                    // A scene nobody can see is out of the tab order and out of the
                                    // accessibility tree; otherwise six screens of links are
                                    // reachable at once and a reader has no idea where they are.
                                    data-scene={index}
                                    aria-hidden={isActive ? undefined : true}
                                    inert={isActive ? undefined : true}
                                >
                                    <SceneContext.Provider value={{pinned: true, isActive}}>
                                        {scene}
                                    </SceneContext.Provider>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        </>
    );
}

/**
 * The progress rail: one mark per scene, the active one filled.
 *
 * Without it a pinned deck gives no sense of how long the story is, and a scrollbar that moves
 * while the screen does not is disorienting on its own.
 */
function SceneRail({count, active}: {count: number; active: number}) {
    return (
        <div
            className="pointer-events-none fixed right-6 top-1/2 z-10 hidden -translate-y-1/2 flex-col gap-2 lg:flex"
            aria-hidden="true"
        >
            {Array.from({length: count}, (_, index) => (
                <span
                    key={index}
                    className={`h-[6px] w-[6px] rounded-full transition-colors duration-200 ${
                        index === active
                            ? "bg-[color:var(--color-accent)]"
                            : "bg-[color:var(--color-rule-strong)]"
                    }`}
                />
            ))}
        </div>
    );
}
