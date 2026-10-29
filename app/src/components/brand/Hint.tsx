import {useId, useState} from "react";

/**
 * A one-sentence explanation, on demand. ADR `0057` §5.
 *
 * It exists so a card, a row or a panel can carry **no explanatory sentence at all** — the user's
 * standing instruction, given five times and generalised on 2026-10-21 as _« pas besoin d'expliqué
 * tout nos choix dans l'uix »_. A figure that genuinely needs a caveat gets this instead of a
 * paragraph, and the caveat costs no vertical space until somebody asks for it.
 *
 * **Hover and keyboard focus, not hover alone.** A tooltip reachable only by pointer is not
 * reachable, and `rules/ui.md` requires every interactive element on the keyboard path. It is a
 * real `<button type="button">` for the same reason: a `div` with a mouse handler is not focusable
 * and announces nothing.
 */
export function Hint({
    children,
    label,
    align = "left",
}: {
    /** One sentence. If it needs two, the thing it explains is the problem. */
    children: React.ReactNode;
    /** What the button is for, e.g. "What 'declared' means". Announced before the sentence. */
    label: string;
    /**
     * Which edge the panel grows from. `"right"` for a hint in the right-hand part of a layout.
     *
     * **It is a prop because CSS cannot decide it.** The panel was centred on the button
     * (`left-1/2 -translate-x-1/2`), which clipped at phone width — measured at 390px with the
     * button at left:64, the panel ran from -38 to 182 and `html`'s `overflow-x: clip` cut the
     * first characters of every line. Anchoring it to the button's left edge fixes that and
     * **moves the same bug to the other side**: measured with the anchor hard right at 390px, the
     * panel ran 375 → 595. There is no collision detection in CSS, so neither edge is safe by
     * default and the call site is the only thing that knows. Both current call sites sit left of
     * their container, which is why that is the default.
     */
    align?: "left" | "right";
}) {
    const [open, setOpen] = useState(false);
    const tooltipId = useId();

    return (
        <span className="relative inline-flex align-middle">
            <button
                type="button"
                aria-label={label}
                aria-expanded={open}
                {...(open ? {"aria-describedby": tooltipId} : {})}
                onMouseEnter={() => setOpen(true)}
                onMouseLeave={() => setOpen(false)}
                onFocus={() => setOpen(true)}
                onBlur={() => setOpen(false)}
                // A circle, because `--radius-*` is reserved for rectangles and a 15px round dot is
                // the one exception the design grants besides a sigil. `border-0!` is not needed:
                // the base rule's 1px is the border this wants, only its colour and radius differ.
                className="grid h-[15px] w-[15px] place-items-center rounded-full! border-[color:var(--color-rule-strong)]! p-0 font-mono text-[9px] leading-none text-[color:var(--color-steel)]!"
            >
                ?
            </button>
            {open ? (
                <span
                    id={tooltipId}
                    role="tooltip"
                    // Anchored to one edge of the button and never centred — see `align`. The panel
                    // is 220px, which is already narrower than any phone; the `min()` only engages
                    // below a 252px viewport, so it is a floor rather than the thing that makes it
                    // fit. An earlier version of this comment credited it with the fit.
                    className={`absolute bottom-[calc(100%+6px)] ${align === "right" ? "right-0" : "left-0"} z-10 w-[min(220px,calc(100vw-2rem))] rounded-[var(--radius-control)] border border-[color:var(--color-rule-strong)] bg-[color:var(--color-raised)] px-3 py-2 text-[length:var(--text-body-sm)] leading-[var(--leading-body)] text-[color:var(--color-silver)]`}
                >
                    {children}
                </span>
            ) : null}
        </span>
    );
}
