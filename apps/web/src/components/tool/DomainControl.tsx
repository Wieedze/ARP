import {useId} from "react";

import type {DomainOption} from "../../services/domain-filter";

/**
 * The domain picker — narrowing the catalogue by what a tool is **for**.
 *
 * A `<select>` rather than a `Segmented`, because there are 17 domains and a segmented control with
 * 17 options is a wall. The same reason the curve control is segmented and this is not: two options
 * against seventeen.
 *
 * A child is prefixed with `·` repeated to its depth, because a flat list cannot show a tree and
 * guessing that `card` sits under `payment` from alphabetical order is not available to the reader.
 *
 * No explanatory sentence beside it (`rules/ui.md`, and the user's standing instruction). What the
 * control does is visible from doing it: pick `payment` and the list shrinks.
 */
export function DomainControl({
    selected,
    options,
    onChange,
    disabled,
}: {
    selected: string | null;
    options: readonly DomainOption[];
    onChange: (next: string | null) => void;
    disabled: boolean;
}) {
    const id = useId();
    return (
        <div className="flex items-center gap-2.5">
            <label
                htmlFor={id}
                className="font-mono text-[length:var(--text-label)] tracking-[0.08em] text-[color:var(--color-steel)] uppercase"
            >
                For
            </label>
            {/* `border-…!` and `bg-…!` carry bangs for the reason `Segmented`'s docstring records:
                `index.css` has an unlayered `button`/`select` block that beats any utility in
                `@layer utilities`, and a control that ignored it rendered unstyled once already. */}
            <select
                id={id}
                value={selected ?? "all"}
                disabled={disabled}
                onChange={(event) =>
                    onChange(event.target.value === "all" ? null : event.target.value)
                }
                className="rounded-[var(--radius-control)] border-[color:var(--color-rule-strong)]! bg-[color:var(--color-bg)]! px-2.5 py-1.5 font-mono text-[length:var(--text-body-sm)] text-[color:var(--color-fg)]! disabled:cursor-not-allowed! disabled:opacity-40"
            >
                <option value="all">anything</option>
                {options.map((option) => (
                    <option key={option.label} value={option.label}>
                        {`${"· ".repeat(Math.max(0, option.depth - 1))}${option.label}`}
                    </option>
                ))}
            </select>
        </div>
    );
}
