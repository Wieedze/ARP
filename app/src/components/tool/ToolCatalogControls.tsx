import {useId} from "react";

import {TOOL_CURVES} from "../../services/tool-catalog";

/**
 * A segmented choice, shared, with the `!` its selected state requires.
 *
 * ## The bug this file exists to fix
 *
 * `CurveControl` was private to `ToolCatalog` and its selected state was
 * `border-[color:var(--color-accent)] text-[color:var(--color-accent)]` — **unbanged**. `index.css`
 * carries an unlayered `button { border: 1px solid var(--color-border); color: var(--color-fg) }`,
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
                className="font-mono uppercase tracking-wider text-[length:var(--text-label)] text-[color:var(--color-fg-60)]"
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
                                : "border-[color:var(--color-border-strong)]! text-[color:var(--color-fg-60)]!"
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
 * Named "Horizon" rather than "Curve" because what a position on each one *means* is the useful
 * distinction, not its id: curve 1 is linear and a position says "I stand behind this, durably";
 * curve 2 is offset progressive and says "I think this is about to be noticed". Two markets, never
 * summed — measured 2026-10-20, curve 1 holds 26.20 TRUST across 185 vaults at a share price of
 * 1.000–1.060, curve 2 holds 219.54 across 28 at 3.000–4.181.
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
            label="Horizon"
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
