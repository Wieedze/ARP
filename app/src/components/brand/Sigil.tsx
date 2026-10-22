import {
    LARGE_FROM,
    sigilDots,
    trameDots,
    type ModuleState,
    type SigilModule,
} from "./sigil-geometry";

/**
 * An agent's generated glyph. Same agent, same sigil, everywhere.
 *
 * ADR `0057` §5. It encodes what `docs/14` says matters and no interface had shown: a dot per
 * declared module, its **fill** carrying whether anyone confirmed it, its **size** carrying the tier
 * of TRUST behind it. Filled paper is proven, a hollow steel ring is declared only, filled alarm is
 * used but never declared — the one place the alarm appears on a sigil.
 *
 * **No container, no background, no connecting lines.** The user tried all three and rejected them
 * (`HANDOFF.md` §4), and the reference's own link code sat behind a mode flag that was off.
 *
 * The centre is paper, and Saffron only when the connected wallet holds a position on this agent.
 * That is the single warm dot on a sigil, so "mine" is readable in a list without a label.
 *
 * Colours go in presentation attributes as custom-property references rather than in Tailwind
 * classes. A presentation attribute is parsed as a CSS property value, so the reference resolves,
 * and `check:tokens` (ADR `0050`) reads it like any other one in `src` — whereas the
 * `fill-[…]` arbitrary-value form is what `rules/ui.md` records as compiling to nothing without a
 * type hint. The gate is literal about this, which is worth knowing before writing one into a
 * comment: it flagged the example sentence that used to sit here.
 */

const TONE: Record<ModuleState, string> = {
    proven: "var(--color-fg)",
    declared: "var(--color-steel)",
    mismatch: "var(--color-alarm)",
};

export function Sigil({
    agentId,
    modules,
    viewerStaked = false,
    size = 48,
    title,
}: {
    agentId: string;
    modules: readonly SigilModule[];
    /** The connected wallet holds a position on this agent. Turns the core Saffron. */
    viewerStaked?: boolean;
    /** 48 in rows, 104 on a detail. The tier set and the trame weight switch at 64. */
    size?: number;
    /**
     * An accessible name, when the sigil is the only thing identifying the agent.
     *
     * Omitted next to the agent's own name, where the glyph is decorative and a second
     * announcement of the same identity is noise — hence `aria-hidden` in that case rather than a
     * duplicated label.
     */
    title?: string;
}) {
    const dots = sigilDots(agentId, modules, size);
    const trame = trameDots(size);
    const isLarge = size >= LARGE_FROM;
    const labelled = title !== undefined;

    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 60 60"
            className="shrink-0"
            {...(labelled ? {role: "img", "aria-label": title} : {"aria-hidden": true})}
            focusable="false"
        >
            {trame.map((dot) => (
                <circle
                    key={`t${dot.cx}-${dot.cy}`}
                    cx={dot.cx}
                    cy={dot.cy}
                    r={dot.r}
                    fill="var(--color-rule)"
                />
            ))}
            {dots.map((dot) =>
                dot.state === "declared" ? (
                    // Hollow: the ring is the whole signal, so the fill is the page and not
                    // `none` — a transparent centre would show the trame dot through it and read
                    // as a third state.
                    <circle
                        key={`d${dot.cx}-${dot.cy}-${dot.mirrored}`}
                        cx={dot.cx}
                        cy={dot.cy}
                        r={Math.max(1.1, dot.r - 0.5)}
                        fill="var(--color-ground)"
                        stroke="var(--color-steel)"
                        strokeWidth={isLarge ? 1 : 1.6}
                    />
                ) : (
                    <circle
                        key={`d${dot.cx}-${dot.cy}-${dot.mirrored}`}
                        cx={dot.cx}
                        cy={dot.cy}
                        r={dot.r}
                        fill={TONE[dot.state]}
                    />
                ),
            )}
            <circle
                cx={30}
                cy={30}
                r={isLarge ? 3.6 : 4.4}
                fill={viewerStaked ? "var(--color-accent)" : "var(--color-fg)"}
            />
        </svg>
    );
}

export type {SigilModule, ModuleState};
