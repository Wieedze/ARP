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
}: {
    /** One sentence. If it needs two, the thing it explains is the problem. */
    children: React.ReactNode;
    /** What the button is for, e.g. "What 'declared' means". Announced before the sentence. */
    label: string;
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
                    className="absolute bottom-[calc(100%+6px)] left-1/2 z-10 w-[220px] -translate-x-1/2 rounded-[var(--radius-control)] border border-[color:var(--color-rule-strong)] bg-[color:var(--color-raised)] px-3 py-2 text-[length:var(--text-body-sm)] leading-[var(--leading-body)] text-[color:var(--color-silver)]"
                >
                    {children}
                </span>
            ) : null}
        </span>
    );
}
