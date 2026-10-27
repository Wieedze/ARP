import {useEffect, useRef} from "react";

/**
 * The hero field: the mark at the centre, one dot per declaration orbiting it.
 *
 * ## What it is, and what it is not
 *
 * The design handoff's hero is a Three.js field of agents and modules around a staked source, with
 * a click sending a stake wave. This is that idea in **Canvas 2D and no dependency** — about
 * eighty lines against ~600kB, which `rules/ui.md`'s bundle rule is there to ask about. The things
 * it keeps are the things that carry meaning: a dot per real declaration, its distance set by
 * whether anybody paid for it, and a pulse that travels outward.
 *
 * **It is driven by real data or it draws nothing.** `beats` is the count of declarations actually
 * on the chain and `backed` is how many of them carry a position. On mainnet today both are zero
 * — that is ARP's own non-activity, not a property of the graph — and the field renders as the
 * mark alone with nothing orbiting. The handoff's own instruction: never sample data.
 *
 * ## The rules it obeys
 *
 * - **No mouse reaction.** `rules/ui.md`: no parallax, no repulsion, no hover tilt, no cursor
 *   trails — the user rejected all four. Nothing here reads the pointer. The motion is a clock,
 *   not a cursor.
 * - **`prefers-reduced-motion` stops it**, and the still frame is the same composition rather than
 *   a different one, so nothing is hidden from a reader who has it on.
 * - **Saffron is spent on one thing**: the backed dots. The accent means "somebody paid", which is
 *   the same thing it means on every other surface.
 * - No gradient, no glow, no shadow. Hairline strokes and flat fills.
 */

/** Device pixels per CSS pixel, capped — a 3× backing store costs more than it shows here. */
const MAX_DPR = 2;

export function PulseField({beats, backed}: {beats: number; backed: number}) {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (canvas === null) return;
        const context = canvas.getContext("2d");
        if (context === null) return;

        const styles = getComputedStyle(document.documentElement);
        const rule = styles.getPropertyValue("--color-rule-strong").trim() || "#43474b";
        const accent = styles.getPropertyValue("--color-accent").trim() || "#ffb020";
        const fg = styles.getPropertyValue("--color-fg").trim() || "#e6e8e6";

        const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

        /**
         * One dot per declaration, placed by a hash of its index rather than at random, so the
         * composition is the same on every render and a reload does not look like new activity.
         */
        const dots = Array.from({length: Math.min(beats, 48)}, (_, index) => {
            const hash = Math.sin(index * 12.9898) * 43758.5453;
            const spread = hash - Math.floor(hash);
            return {
                angle: spread * Math.PI * 2,
                // Backed claims orbit closer. The one thing the geometry says.
                radius: 0.24 + (index < backed ? 0.14 : 0.38) * spread,
                speed: (0.00006 + spread * 0.00008) * (index % 2 === 0 ? 1 : -1),
                paid: index < backed,
            };
        });

        let frame = 0;
        let width = 0;
        let height = 0;

        function resize() {
            if (canvas === null) return;
            const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
            const box = canvas.getBoundingClientRect();
            width = box.width;
            height = box.height;
            canvas.width = Math.round(width * dpr);
            canvas.height = Math.round(height * dpr);
            context?.setTransform(dpr, 0, 0, dpr, 0, 0);
        }

        function draw(time: number) {
            if (context === null) return;
            context.clearRect(0, 0, width, height);
            // Right of centre, because the copy occupies the left 40rem. Centred, the mark sat
            // behind the headline at every width above a phone.
            const cx = width > 900 ? width * 0.7 : width / 2;
            const cy = height / 2;
            const unit = Math.min(width, height);

            // **Dots, not stroked circles.** The first version drew three hairline rings, and
            // at hero scale behind a 60px headline they read as a target: two concentric arcs
            // crossing every letter. The mark's own geometry is a dot per position on each ring
            // (`RingLoader`), which reads as texture rather than as a shape competing with the
            // type. Same counts as the loader so the two are recognisably one mark.
            context.fillStyle = rule;
            for (const [ring, count] of [
                [0.185, 6],
                [0.33, 12],
                [0.46, 18],
            ] as const) {
                for (let i = 0; i < count; i += 1) {
                    const a = (i / count) * Math.PI * 2 - Math.PI / 2;
                    context.beginPath();
                    context.arc(
                        cx + Math.cos(a) * unit * ring,
                        cy + Math.sin(a) * unit * ring,
                        unit * (0.0095 - ring * 0.012),
                        0,
                        Math.PI * 2,
                    );
                    context.fill();
                }
            }

            // The core. Always warm: it is the subject everything else is about.
            context.fillStyle = accent;
            context.beginPath();
            context.arc(cx, cy, unit * 0.018, 0, Math.PI * 2);
            context.fill();

            for (const dot of dots) {
                const angle = dot.angle + (still ? 0 : time * dot.speed);
                const r = unit * dot.radius;
                context.fillStyle = dot.paid ? accent : rule;
                context.beginPath();
                context.arc(
                    cx + Math.cos(angle) * r,
                    cy + Math.sin(angle) * r,
                    unit * (dot.paid ? 0.0075 : 0.005),
                    0,
                    Math.PI * 2,
                );
                context.fill();
            }

            // The pulse: one ring travelling out, once every four seconds. Only when something is
            // actually on the record — a page with no declarations has no beat to show.
            if (!still && dots.length > 0) {
                const phase = ((time % 4000) / 4000) ** 0.7;
                context.strokeStyle = fg;
                context.lineWidth = 1;
                context.globalAlpha = Math.max(0, 0.22 * (1 - phase));
                context.beginPath();
                context.arc(cx, cy, unit * (0.02 + phase * 0.5), 0, Math.PI * 2);
                context.stroke();
                context.globalAlpha = 1;
            }

            if (!still) frame = requestAnimationFrame(draw);
        }

        resize();
        frame = requestAnimationFrame(draw);
        window.addEventListener("resize", resize);
        return () => {
            cancelAnimationFrame(frame);
            window.removeEventListener("resize", resize);
        };
    }, [beats, backed]);

    return (
        <canvas
            ref={canvasRef}
            role="img"
            aria-label={
                beats === 0
                    ? "No declarations on this chain yet"
                    : `${beats} declarations, ${backed} of them with a position behind them`
            }
            className="absolute inset-0 block h-full w-full"
        />
    );
}
