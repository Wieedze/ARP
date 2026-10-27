import {useId} from "react";

import {TOOL_CURVES} from "../../services/tool-catalog";

/**
 * A segmented choice, shared, with the `!` its selected state requires.
 *
 * ## The bug this file exists to fix
 *
 * `CurveControl` was private to `ToolCatalog` and its selected state was
 * `border-[color:var(--color-accent)] text-[color:var(--color-accent)]` — **unbanged**. `index.css`
 * carries an unlayered `button { border: 1px solid var(--color-rule); color: var(--color-fg) }`,
 * which beats any `@layer utilities` rule, so the selected button rendered **identically to the
 * unselected ones**: the selection was invisible.
 *
 * `rules/ui.md` names this as one of two failure classes no static check sees, and cites this exact
 * symptom — "a utility defeated by an unlayered rule in `index.css` … once made a selected state
 * invisible". It had happened again, in the control that chooses which market a page is reading.
 *
 * Shared because the profile page needs the same control, and three copies of a class string is how
 * `controlClass` stayed broken in two places for weeks.
 */
function Segmented<T>({
    label,
    options,
    selected,
    onChange,
}: {
    label: string;
    options: readonly {id: T; label: string; title?: string}[];
    selected: T;
    onChange: (next: T) => void;
}) {
    // Generated, not hardcoded: two of these on one page would otherwise share one label id, and
    // the profile page renders one beside the catalogue's.
    const labelId = useId();
    return (
        <div className="flex items-baseline gap-3">
            <span
                id={labelId}
                className="font-mono uppercase tracking-wider text-[length:var(--text-label)] text-[color:var(--color-steel)]"
            >
                {label}
            </span>
            <div role="group" aria-labelledby={labelId} className="flex gap-1">
                {options.map((option) => (
                    <button
                        key={String(option.id)}
                        type="button"
                        aria-pressed={option.id === selected}
                        onClick={() => onChange(option.id)}
                        {...(option.title === undefined ? {} : {title: option.title})}
                        className={`px-3 py-1 text-[length:var(--text-body-sm)] ${
                            option.id === selected
                                ? "border-[color:var(--color-accent)]! text-[color:var(--color-accent)]!"
                                : "border-[color:var(--color-rule-strong)]! text-[color:var(--color-steel)]!"
                        }`}
                    >
                        {option.label}
                    </button>
                ))}
            </div>
        </div>
    );
}

/**
 * Which bonding curve a page reads.
 *
 * It was called **"Horizon"**, with the two curves labelled "Long term" and "Short term". The
 * reasoning was that what a position *means* beats its id — curve 1 linear reads as "durably",
 * curve 2 offset-progressive as "about to be noticed". The user could not read any of it
 * (2026-10-27): _« je comprends pas horizon ? Là on a un registre de tool avec de la valeur et tu
 * proposes un horizon, ce n'est pas compréhensible. »_
 *
 * He is right twice. Nothing in a bonding curve is about **time**, so long/short term was an
 * invention; and `curveLabelOf` already argued against exactly this, in writing, one file over:
 * "curve 7 is honest where Long term would be an invention."
 *
 * The contract's own names now — Linear and Progressive — under a control called Curve. What the
 * choice does is real and is why it stays: two markets, never summed. Measured 2026-10-20, curve 1
 * holds 26.20 TRUST across 185 vaults at a share price of 1.000–1.060, curve 2 holds 219.54 across
 * 28 at 3.000–4.181 — so it decides whether you see a tenth of the money or the rest.
 */
export function CurveControl({
    curveId,
    onChange,
}: {
    curveId: number;
    onChange: (next: number) => void;
}) {
    return (
        <Segmented
            label="Curve"
            selected={curveId}
            onChange={onChange}
            options={TOOL_CURVES.map((entry) => ({
                id: entry.id,
                label: entry.label,
                title: entry.curve,
            }))}
        />
    );
}

export {Segmented};
