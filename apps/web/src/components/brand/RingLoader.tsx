/**
 * The wait state, built from the logo. ADR `0057` §6.
 *
 * Three rings of the Source in hairline grey; each one's fill runs to Saffron and back, 1.2s, offset
 * by 0 / .18 / .36s so the pulse travels outward from the core. One loader per wait.
 *
 * Not a grey block on a grey background, which `rules/ui.md` names as a template signal. The shape
 * is the mark, so a wait looks like the product rather than like a gap in it.
 *
 * The keyframes and the `prefers-reduced-motion` stop live in `index.css` under `.ring-loader`,
 * because a Tailwind arbitrary value cannot express an `animation-delay` per child and a CSS
 * animation declared inline would not be reachable by the media query.
 */

const RINGS = [
    {radius: 20, dots: 6, r: 5},
    {radius: 36, dots: 12, r: 3.6},
    {radius: 50, dots: 18, r: 2.4},
] as const;

export function RingLoader({
    size = 40,
    label = "Loading",
}: {
    /** 16 inline in a pending button, 40 or more over a table. */
    size?: number;
    /** Announced to a screen reader. The caller's own `aria-busy` region carries the politeness. */
    label?: string;
}) {
    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 108 108"
            className="ring-loader shrink-0"
            role="img"
            aria-label={label}
            focusable="false"
        >
            {RINGS.map((ring, index) => (
                <g key={ring.radius} style={{animationDelay: `${index * 0.18}s`}}>
                    {Array.from({length: ring.dots}, (_, k) => {
                        const angle = (2 * Math.PI * k) / ring.dots - Math.PI / 2;
                        return (
                            <circle
                                key={k}
                                cx={54 + ring.radius * Math.cos(angle)}
                                cy={54 + ring.radius * Math.sin(angle)}
                                r={ring.r}
                            />
                        );
                    })}
                </g>
            ))}
            <circle cx={54} cy={54} r={6} fill="var(--color-accent)" />
        </svg>
    );
}
