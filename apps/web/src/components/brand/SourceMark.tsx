/**
 * The logo: a Saffron core and three rings of paper dots.
 *
 * ADR `0057` §1. The rings are the evidence ladder rendered as distance — proven next to the source,
 * staked around it, asserted at the edge — which is why they drop from the **outside in** as the
 * mark gets smaller. The core never drops: the thing closest to the source is the thing you keep.
 *
 * Generated, never hand-written paths (`HANDOFF.md` §2), so the geometry stays checkable: dot k of a
 * ring of n sits at `2πk/n − π/2`, which puts the first dot at 12 o'clock.
 */

const RINGS = [
    {radius: 18, dots: 6, r: 4.4, fill: "var(--color-fg)"},
    {radius: 33, dots: 12, r: 3.4, fill: "var(--color-fg)"},
    {radius: 47, dots: 18, r: 2.2, fill: "var(--color-steel)"},
] as const;

/** Below this, ring 3 goes. Below the second, only ring 1 and the core remain. */
const DROP_RING_3 = 64;
const DROP_RING_2 = 24;

export function SourceMark({
    size = 56,
    title,
}: {
    size?: number;
    /**
     * An accessible name. Supply it where the mark is the only route home; leave it out beside a
     * wordmark, where it would announce "ARP" twice.
     */
    title?: string;
}) {
    const rings = RINGS.slice(0, size < DROP_RING_2 ? 1 : size < DROP_RING_3 ? 2 : 3);
    const labelled = title !== undefined;

    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 108 108"
            className="shrink-0"
            {...(labelled ? {role: "img", "aria-label": title} : {"aria-hidden": true})}
            focusable="false"
        >
            {rings.map((ring) =>
                Array.from({length: ring.dots}, (_, k) => {
                    const angle = (2 * Math.PI * k) / ring.dots - Math.PI / 2;
                    return (
                        <circle
                            key={`${ring.radius}-${k}`}
                            cx={54 + ring.radius * Math.cos(angle)}
                            cy={54 + ring.radius * Math.sin(angle)}
                            r={ring.r}
                            fill={ring.fill}
                        />
                    );
                }),
            )}
            <circle cx={54} cy={54} r={6} fill="var(--color-accent)" />
        </svg>
    );
}
