import {useEffect, useRef} from "react";

import {CORE_FRACTION, RINGS_GEOMETRY, TILT, clamp, lerp, smooth} from "./source-field-geometry";
import {NAV_HEIGHT} from "./nav-height";

/**
 * The hero's field, and the Saffron that carries every hand-over.
 *
 * ## What it is
 *
 * 22 rings of dots around a warm core, each ring turning at its own rate and alternating direction,
 * the whole thing tilted — the mark, at hero scale, in Canvas 2D and no dependency. It replaces
 * `PulseField`, which drew three rings and one dot per declaration. The geometry is in
 * `source-field-geometry.ts`; this file is the loop over it.
 *
 * **Three.js was asked about and the answer is no** (`docs/18` §6): this is 2D points on a circle,
 * and a WebGL scene graph would add ~600kB to do none of it better.
 *
 * ## Why it owns the veil as well
 *
 * The first hand-over is a **dive into the core**: the field zooms 70×, the dots stream past the
 * edges and thin out, and the core grows until it fills the screen — at which point a hole opens
 * from the centre onto the next scene. The thing covering the screen is the core, continuing. It
 * starts behind the copy and ends in front of it — z-index 0 to 15 — so it is drawn on two
 * canvases, but it is one object and one draw call ordering, which is why it is one component
 * and one `requestAnimationFrame` loop rather than two fighting over the same clock.
 *
 * The four hand-overs after it are **seeds**: each scene already holds a Saffron sphere, half out of
 * frame, in a spot the composition leaves empty. Scrolling grows it into a cover and then opens it
 * from a different point each time. You fly over something that was already there rather than
 * watching a wipe arrive from nowhere.
 *
 * ## The rules it obeys, and the one it breaks
 *
 * - **No mouse reaction** (`rules/ui.md`). Nothing here reads the pointer. The motion is a clock.
 * - **`prefers-reduced-motion` stops it** — one still frame, same composition, and the deck does
 *   not pin at all, so there is no dive and no cover to miss.
 * - **It breaks the one-accent rule, on purpose and with an exception written for it.** ADR `0067`:
 *   Saffron may carry a transition, and the mark's core is warm unconditionally. The three
 *   conditions are in `rules/ui.md`; the one that constrains this file is that nothing is left warm
 *   once the motion settles.
 */

/** Device pixels per CSS pixel, capped — a 3× backing store costs more than it shows here. */
const MAX_DPR = 2;

/** How far the dive zooms in. Exponential, so it starts slow without being eased. */
const ZOOM_MAX = 70;

/** The sticky nav's height (`NavSplit`). The field centres in what is left of the viewport. */
const NAV = NAV_HEIGHT;

/** Dot sizes in `source-field-geometry` are px at this rim, so every size scales from it. */
const TUNED_RIM = 300;

/**
 * Each scene's seed: where its sphere sits (× viewport), how big it starts (× height), and where the
 * cover opens from afterwards. Keyed by the scene the hand-over **leaves**.
 *
 * The positions are not interchangeable — each one is a hole in that scene's own composition, so
 * moving a card moves its seed.
 */
const SEEDS: Readonly<
    Record<number, {ox: number; oy: number; r0: number; hx: number; hy: number}>
> = {
    1: {ox: 0.9, oy: 1.06, r0: 0.17, hx: 0.5, hy: 1.0},
    2: {ox: -0.06, oy: 0.56, r0: 0.13, hx: 0.0, hy: 0.5},
    3: {ox: 1.04, oy: 0.16, r0: 0.14, hx: 0.5, hy: 0.5},
    4: {ox: 0.5, oy: 1.1, r0: 0.16, hx: 0.0, hy: 1.0},
};

/** Paper, and the grey the rim fades to. Literals because a canvas cannot read a Tailwind class. */
const PAPER = [230, 232, 230] as const;
const RIM_GREY = [90, 95, 100] as const;

export function SourceField({pinned, progress}: {pinned: boolean; progress: number}) {
    const fieldRef = useRef<HTMLCanvasElement | null>(null);
    const veilRef = useRef<HTMLCanvasElement | null>(null);
    /**
     * The loop reads these rather than closing over them, so a scroll does not tear down and
     * rebuild the animation sixty times a second. `pinned` and `progress` change every frame of a
     * hand-over; the effect below must not depend on them.
     */
    const state = useRef({pinned, progress});
    // Written in an effect, not during render: a ref assignment in a render body is a lint error
    // here and a real hazard under concurrent rendering, where a render that is thrown away would
    // still have published its value. The draw loop reads it on the next frame.
    useEffect(() => {
        state.current = {pinned, progress};
    });
    /**
     * The loop's own `resize`, so a mode flip can reach it.
     *
     * Pinned and stacked give the canvases different sizes through their classNames, and the draw
     * loop deliberately has no dependency on `pinned` — so without this a deck that starts stacked
     * and then pins draws into a bitmap sized for the hero: a quarter-scale field in the corner.
     * Stacked, the veil is `display: none` and measures 0x0.
     */
    const refit = useRef<(() => void) | null>(null);

    useEffect(() => {
        const field = fieldRef.current;
        const veil = veilRef.current;
        if (field === null || veil === null) return;
        const fieldCtx = field.getContext("2d");
        const veilCtx = veil.getContext("2d");
        if (fieldCtx === null || veilCtx === null) return;

        const accent =
            getComputedStyle(document.documentElement).getPropertyValue("--color-accent").trim() ||
            "#ffb020";
        const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

        let width = 0;
        let height = 0;
        let frame = 0;

        function fit(canvas: HTMLCanvasElement, context: CanvasRenderingContext2D): DOMRect {
            const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
            const box = canvas.getBoundingClientRect();
            canvas.width = Math.round(box.width * dpr);
            canvas.height = Math.round(box.height * dpr);
            context.setTransform(dpr, 0, 0, dpr, 0, 0);
            return box;
        }

        function resize() {
            if (field === null || veil === null || fieldCtx === null || veilCtx === null) return;
            const box = fit(field, fieldCtx);
            width = box.width;
            height = box.height;
            fit(veil, veilCtx);
            // **Assigning width or height clears the bitmap**, per spec. Under reduced motion
            // nothing re-arms the loop, so without this a single resize leaves the hero blank
            // permanently — which is exactly the reader this branch exists to serve.
            draw(0);
        }

        /** Where the field is and how far into it we have dived. */
        function geometry() {
            const {pinned: isPinned, progress: p} = state.current;
            if (!isPinned) {
                const wide = width > 900;
                const rim = Math.min(wide ? width * 0.26 : width * 0.44, height * 0.5);
                return {cx: wide ? width * 0.72 : width / 2, cy: height / 2, rim, zoom: 1, dive: 0};
            }
            const room = height - NAV;
            // Big, and still clear of the copy: the hero's text is capped at min(40rem, 44vw).
            const rim = Math.min(room * 0.52, width * 0.25);
            const dive = clamp(p / 0.65);
            return {
                cx: lerp(width * 0.76, width * 0.5, dive),
                cy: lerp(NAV + room / 2, height / 2, dive),
                rim,
                zoom: Math.exp(dive * Math.log(ZOOM_MAX)),
                dive,
            };
        }

        function draw(time: number) {
            if (fieldCtx === null || veilCtx === null) return;
            const {pinned: isPinned} = state.current;
            fieldCtx.clearRect(0, 0, width, height);
            const {cx, cy, rim, zoom, dive} = geometry();
            const px = rim / TUNED_RIM;
            const seconds = still ? 0 : time / 1000;

            // The dots stream past the edges and thin out as the dive goes in. Past a 11.5× zoom
            // they are gone and only the core is left, which is what makes the cover read as one
            // object rather than as a disc appearing over a field.
            const dotsAlpha = 1 - smooth(clamp((zoom - 2.5) / 9));
            if (dotsAlpha > 0.002) {
                const span = Math.hypot(width, height) * 1.2;
                for (const ring of RINGS_GEOMETRY) {
                    const toGrey = smooth(clamp((ring.distance - 0.55) / 0.45));
                    const [r, g, b] = PAPER.map((channel, i) =>
                        Math.round(channel + ((RIM_GREY[i] ?? channel) - channel) * toGrey),
                    );
                    const alpha = (1 - 0.6 * ring.distance) * dotsAlpha;
                    fieldCtx.fillStyle = `rgba(${r},${g},${b},${alpha.toFixed(3)})`;
                    const radius = ring.radius * rim * zoom;
                    if (radius > span) continue;
                    const turn = seconds * ring.speed;
                    const dot = Math.max(ring.size * px * 1.6 * Math.pow(zoom, 0.75), 0.7);
                    for (let i = 0; i < ring.count; i += 1) {
                        const angle = (i / ring.count) * Math.PI * 2 - Math.PI / 2 + turn;
                        fieldCtx.beginPath();
                        fieldCtx.arc(
                            cx + Math.cos(angle) * radius,
                            cy + Math.sin(angle) * radius * TILT,
                            dot,
                            0,
                            Math.PI * 2,
                        );
                        fieldCtx.fill();
                    }
                }
            }

            // The core is on the field until the dive starts, and on the veil after — the handover
            // between the two canvases is what lets it pass in front of the copy.
            const coreRadius = Math.max(rim * CORE_FRACTION, 4) * zoom;
            if (!isPinned || dive < 0.02) {
                fieldCtx.fillStyle = accent;
                fieldCtx.beginPath();
                fieldCtx.arc(cx, cy, coreRadius, 0, Math.PI * 2);
                fieldCtx.fill();
            }

            if (isPinned)
                drawVeil(veilCtx, accent, width, height, state.current.progress, {
                    cx,
                    cy,
                    coreRadius,
                    dive,
                });

            if (!still) frame = requestAnimationFrame(draw);
        }

        refit.current = resize;
        resize();
        frame = requestAnimationFrame(draw);
        window.addEventListener("resize", resize);
        return () => {
            cancelAnimationFrame(frame);
            window.removeEventListener("resize", resize);
            refit.current = null;
        };
    }, []);

    useEffect(() => {
        refit.current?.();
    }, [pinned]);

    // The field is behind everything and the veil is above the scenes and below the nav. Both are
    // explicitly sized: a canvas is a replaced element, so `inset-0` alone leaves it at its
    // intrinsic 300×150 and the field renders tiny in the corner.
    //
    // **Stacked, the canvas carries its own bleed and must be positioned against the hero
    // section** — `50%` in `w-[calc(50%+50vw)]` resolves against the containing block, and the
    // formula is only correct when that block is the content column. Wrapped in a bleed div of
    // its own it overran the viewport's right edge by `(100vw − column)/4` — 162px at 1920, 12px at
    // 390 — with nothing clipping it, so the page scrolled sideways. Those two figures are derived
    // from the formula rather than re-runnable: that wrapper never reached a commit. `w-full` on
    // the wrapper is not the fix; removing the wrapper is.
    //
    // **Below 900px it sits above the copy**, 320px tall, rather than behind it
    // (`MOTION-V2.md` §2.2): paper-coloured dots behind 18px silver body copy is unreadable, and
    // `check:contrast` reads tokens, not canvas pixels. The hero's copy column pads itself down by
    // the same 320px.
    return (
        <>
            <canvas
                ref={fieldRef}
                aria-hidden="true"
                className={
                    pinned
                        ? "pointer-events-none fixed inset-0 z-0 block h-[100svh] w-screen"
                        : "pointer-events-none absolute left-0 top-0 z-0 block h-full w-[calc(50%+50vw)] max-[900px]:h-[320px] max-[900px]:w-full"
                }
            />
            <canvas
                ref={veilRef}
                aria-hidden="true"
                className={`pointer-events-none fixed inset-0 z-[15] h-[100svh] w-screen ${
                    pinned ? "block" : "hidden"
                }`}
            />
        </>
    );
}

/**
 * The Saffron that covers the screen between two scenes.
 *
 * Scroll-scrubbed throughout, so it reverses: scroll back and the cover opens the way it closed.
 * Everything is fully covered only around the exact midpoint, which is where the deck swaps which
 * scene is active — so the swap is never seen.
 */
function drawVeil(
    context: CanvasRenderingContext2D,
    accent: string,
    width: number,
    height: number,
    progress: number,
    core: {cx: number; cy: number; coreRadius: number; dive: number},
): void {
    context.clearRect(0, 0, width, height);
    context.fillStyle = accent;

    // Hand-over 0 → 1: the core, continuing. It grows past the screen and then a hole opens from
    // the centre, so the reader goes *through* the source rather than past it.
    if (progress < 1) {
        if (core.dive >= 0.02) {
            const hole = smooth(clamp((progress - 0.66) / 0.3)) * Math.hypot(width, height) * 0.62;
            context.beginPath();
            context.arc(core.cx, core.cy, core.coreRadius, 0, Math.PI * 2);
            if (hole > 0) context.arc(width / 2, height / 2, hole, 0, Math.PI * 2, true);
            context.fill("evenodd");
        }
        // The first seed starts at 0.86, so it overlaps the tail of the dive.
        drawSeeds(context, width, height, progress);
        return;
    }

    drawSeeds(context, width, height, progress);
}

function drawSeeds(
    context: CanvasRenderingContext2D,
    width: number,
    height: number,
    progress: number,
): void {
    for (const [key, seed] of Object.entries(SEEDS)) {
        const scene = Number(key);
        if (progress < scene - 0.14 || progress >= scene + 0.9) continue;

        const ox = width * seed.ox;
        const oy = height * seed.oy;
        const start = height * seed.r0;

        // The farthest **visible** corner. The nav is `sticky top-0 z-20` with an opaque
        // `--color-ground` background and is `NAV_HEIGHT` tall, so it covers the veil's top band and a
        // disc that reaches the real top corners has already covered more than the reader can see.
        // Getting this wrong the other way left a dark sliver that snapped shut at the end instead
        // of closing — and it was wrong here for a different reason until 2026-10-28, when the nav
        // was static: the premise was false, so the cover fell 16–68px short of a top corner at
        // the exact frame a scene swaps. **If the nav ever stops being sticky, this goes with it.**
        const far =
            Math.max(
                ...(
                    [
                        [0, NAV],
                        [width, NAV],
                        [0, height],
                        [width, height],
                    ] as const
                ).map(([x, y]) => Math.hypot(x - ox, y - oy)),
            ) + 2;

        const appear = smooth(clamp((progress - (scene - 0.14)) / 0.14));
        const w = clamp((progress - (scene + 0.1)) / 0.8);
        // Decelerates hard into the close, so the last of the dark is absorbed at walking pace.
        const covering = 1 - Math.pow(1 - smooth(clamp(w / 0.62)), 1.8);
        const opening = smooth(clamp((w - 0.62) / 0.38));

        if (opening <= 0) {
            const radius = start * appear + (far - start) * covering;
            context.beginPath();
            context.arc(ox, oy, radius, 0, Math.PI * 2);
            context.fill();
            continue;
        }

        // One opening, a circle growing from a point that differs per hand-over. A grid of
        // shrinking dots was tried here and the user read it as coarse; so were stripes, and dots
        // running ahead of the closing edge. None of the three come back.
        const hx = width * seed.hx;
        const hy = height * seed.hy;
        const reach =
            Math.max(
                ...(
                    [
                        [0, 0],
                        [width, 0],
                        [0, height],
                        [width, height],
                    ] as const
                ).map(([x, y]) => Math.hypot(x - hx, y - hy)),
            ) * 1.02;
        context.beginPath();
        context.rect(0, 0, width, height);
        context.arc(hx, hy, Math.max(Math.pow(opening, 1.15) * reach, 0.1), 0, Math.PI * 2, true);
        context.fill("evenodd");
    }
}
