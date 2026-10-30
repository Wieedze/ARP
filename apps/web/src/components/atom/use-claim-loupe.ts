import {useCallback, useEffect, useMemo, useRef, useState, type RefObject} from "react";

import {LOUPE, loupeLine, loupeRest, type ClaimDot, type Point} from "./claim-field-geometry";

/** What the card shows: which claim, and whether it is lit (Saffron) or only the nearest one. */
export type LoupeReading = {
    /** Index into the field's flattened claim list, or `null` before the first read. */
    index: number | null;
    /** The whole dot is under the loupe: it is lit, and so is the card's header dot. */
    lit: boolean;
};

/**
 * The tour's next claim: any of `count`, at random, but never `from` again.
 *
 * Random rather than in order, the user's call (2026-10-29): stepping one by one round a ring reads
 * as a clock hand, and the field is a constellation.
 */
export function nextStop(from: number | null, count: number, random = Math.random): number {
    if (count <= 1) return 0;
    if (from === null) return Math.floor(random() * count);
    // Draw from the other `count - 1` and skip over `from`, so a repeat is impossible rather than
    // merely unlikely.
    const pick = Math.floor(random() * (count - 1));
    return pick >= from ? pick + 1 : pick;
}

/**
 * The reading head of the claim field: where it is, what it reads, and how it moves.
 *
 * ## What moves it, in order of precedence
 *
 * 1. **Pointing.** Hover **and** keyboard focus on a dot (ADR `0073`: a reveal answers the
 *    keyboard, or it is a mouse effect). The loupe glides there and rides the dot as its ring turns.
 * 2. **The tour.** With nobody pointing, every `LOUPE.tourMs` it moves on to a claim picked at
 *    random, never the one it is on (`nextStop`). Letting go of a dot resumes the tour **from that
 *    dot**, after a full beat, so it never jumps away from under the reader.
 * 3. **Rest.** Before the first beat, the loupe sits at `LOUPE.restDegrees` on the outer ring and
 *    the card reads the nearest dot. It lights only when the whole dot is inside the loupe.
 *
 * ## Why one rAF loop and refs, not state
 *
 * The loupe moves every frame. Driving it through React would re-render the field sixty times a
 * second, so the loop writes the SVG attributes itself and React only hears about it when the
 * **reading** changes, which is a few times per lap.
 *
 * Positions come from `getBoundingClientRect`, so they are exactly where the turning ring has the
 * dot right now, and stay right when a background tab pauses the animation.
 *
 * ## Reduced motion
 *
 * No tour, and the loupe jumps instead of gliding. Pointing still lights the dot and fills the card.
 */
export function useClaimLoupe({
    fieldRef,
    headRef,
    lineRef,
    dots,
    outerRadius,
    outerRing,
}: {
    fieldRef: RefObject<HTMLDivElement | null>;
    headRef: RefObject<SVGCircleElement | null>;
    lineRef: RefObject<SVGPolylineElement | null>;
    /** The drawn dots, in DOM order. */
    dots: readonly ClaimDot[];
    outerRadius: number;
    outerRing: number;
}) {
    /** The dot elements, by their position in `dots`. Filled by the component's `ref` callbacks. */
    const dotEls = useRef<(HTMLElement | null)[]>([]);
    const pointing = useRef<number | null>(null);
    const touring = useRef<number | null>(null);
    const nextTour = useRef(0);

    const [reading, setReading] = useState<LoupeReading>({index: null, lit: false});
    const shown = useRef<LoupeReading>(reading);

    useEffect(() => {
        const field = fieldRef.current;
        const head = headRef.current;
        const line = lineRef.current;
        if (field === null || head === null || line === null || dots.length === 0) return;

        // `matchMedia` is missing in jsdom; no answer means motion is allowed.
        const motion = window.matchMedia?.("(prefers-reduced-motion: reduce)") ?? {matches: false};
        const rest = loupeRest(outerRadius);
        const cur: Point = {...rest};
        let last = performance.now();
        let pollAt = 0;
        let lockedOn: number | null = null;
        let frame = 0;
        nextTour.current = last + LOUPE.tourMs;
        touring.current = null;

        const centre = (position: number): Point | null => {
            const el = dotEls.current[position];
            if (el === null || el === undefined) return null;
            const f = field.getBoundingClientRect();
            const b = el.getBoundingClientRect();
            if (f.width === 0) return null;
            return {
                x: (b.left + b.width / 2 - f.left) / f.width,
                y: (b.top + b.height / 2 - f.top) / f.height,
            };
        };

        const report = (position: number, lit: boolean) => {
            const index = dots[position]?.index ?? null;
            if (shown.current.index === index && shown.current.lit === lit) return;
            shown.current = {index, lit};
            setReading(shown.current);
        };

        const nearestOnOuterRing = () => {
            let best = -1;
            let distance = Infinity;
            dots.forEach((dot, position) => {
                if (dot.ring !== outerRing) return;
                const c = centre(position);
                if (c === null) return;
                const d = Math.hypot(c.x - cur.x, c.y - cur.y);
                if (d < distance) {
                    distance = d;
                    best = position;
                }
            });
            // A little slack over the strict test, so a dot exactly on the rim still lights.
            return {best, inside: distance <= LOUPE.radius - LOUPE.dotRadius + 0.002};
        };

        const draw = () => {
            head.setAttribute("cx", cur.x.toFixed(4));
            head.setAttribute("cy", cur.y.toFixed(4));
            line.setAttribute("points", loupeLine(cur));
        };

        const tick = (now: number) => {
            const still = motion.matches;
            const dt = Math.min(64, now - last);
            last = now;

            if (pointing.current === null && !still && now >= nextTour.current) {
                touring.current = nextStop(touring.current, dots.length);
                nextTour.current = now + LOUPE.tourMs;
            }
            const held = pointing.current ?? (still ? null : touring.current);
            const target = (held === null ? null : centre(held)) ?? rest;

            // Once arrived, lock onto the dot: an ease alone trails a moving target by about a
            // pixel, which reads as "not centred".
            if (held !== lockedOn) lockedOn = null;
            if (
                lockedOn === null &&
                held !== null &&
                Math.hypot(target.x - cur.x, target.y - cur.y) < LOUPE.lock
            ) {
                lockedOn = held;
            }
            const k =
                still || (held !== null && held === lockedOn)
                    ? 1
                    : 1 - Math.exp(-dt / LOUPE.glideMs);
            cur.x += (target.x - cur.x) * k;
            cur.y += (target.y - cur.y) * k;
            draw();

            if (held !== null) {
                report(held, true);
            } else if (now >= pollAt) {
                pollAt = now + LOUPE.pollMs;
                const {best, inside} = nearestOnOuterRing();
                if (best >= 0) report(best, inside);
            }
            frame = requestAnimationFrame(tick);
        };

        draw();
        frame = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(frame);
    }, [fieldRef, headRef, lineRef, dots, outerRadius, outerRing]);

    /** Hover and focus both call this: same state, same look. */
    const point = useCallback((position: number) => {
        pointing.current = position;
    }, []);

    /** Letting go resumes the tour from the dot you were on, after a full beat. */
    const release = useCallback((position: number) => {
        if (pointing.current !== position) return;
        pointing.current = null;
        touring.current = position;
        nextTour.current = performance.now() + LOUPE.tourMs;
    }, []);

    const dotRef = useCallback(
        (position: number) => (el: HTMLElement | null) => {
            dotEls.current[position] = el;
        },
        [],
    );

    /**
     * What the card reads before the loop's first measurement: the outer-ring dot nearest the
     * resting loupe, from the geometry rather than the DOM. The card is never blank, including on
     * the first paint and where nothing has a layout to measure.
     */
    const atRest = useMemo(() => {
        const rest = loupeRest(outerRadius);
        let best: number | null = null;
        let distance = Infinity;
        for (const dot of dots) {
            if (dot.ring !== outerRing) continue;
            const d = Math.hypot(dot.cx - rest.x, dot.cy - rest.y);
            if (d < distance) {
                distance = d;
                best = dot.index;
            }
        }
        return best;
    }, [dots, outerRadius, outerRing]);

    return {
        reading: reading.index === null ? {index: atRest, lit: false} : reading,
        point,
        release,
        dotRef,
    };
}
