import type {DomainOption} from "../../services/domain-filter";

/**
 * What a tool is **for**, as a list you tick rather than a menu you open.
 *
 * It replaced a `<select>`. Two reasons, and the second is the one that mattered: a menu shows one
 * choice at a time and hides the other twenty, so a reader could not see that `image` holds 46 and
 * `browser` holds 1 without opening each in turn — and **a menu cannot express two choices at
 * once**, which is what a reader narrowing "image or video" is doing.
 *
 * A count sits beside every domain. It is not a measurement on display (the user, 2026-10-29:
 * _« il faut qu'on serve le but de notre app uniquement »_) — it is what tells a reader whether a
 * row is worth clicking, which is the whole job of a navigation rail.
 *
 * Depth is an indent, because here there is room for one: `card` sits under `payment` and a flat
 * list cannot say so. The `<select>` had to spell it with `· ` prefixes.
 */
export function DomainRail({
    options,
    selected,
    counts,
    onToggle,
    onClear,
}: {
    options: readonly DomainOption[];
    selected: ReadonlySet<string>;
    counts: (domain: string) => number;
    onToggle: (domain: string) => void;
    onClear: () => void;
}) {
    return (
        <nav aria-label="Filter by what a tool is for">
            <div className="flex items-baseline justify-between border-b border-[color:var(--color-rule-strong)] pb-2">
                <h2 className="font-mono text-[length:var(--text-label)] tracking-[0.08em] text-[color:var(--color-steel)] uppercase">
                    For
                </h2>
                {/* Only when there is something to clear: a permanently visible "Clear" on an
                    untouched filter is a control that does nothing, which reads as broken. */}
                {selected.size === 0 ? null : (
                    <button
                        type="button"
                        onClick={onClear}
                        className="border-0! bg-transparent! p-0! font-mono text-[length:var(--text-label)] tracking-[0.06em] text-[color:var(--color-accent)]! uppercase hover:underline"
                    >
                        Clear
                    </button>
                )}
            </div>
            <ul className="mt-1">
                {options.map((option) => {
                    const isOn = selected.has(option.label);
                    const count = counts(option.label);
                    return (
                        <li key={option.label}>
                            <button
                                type="button"
                                aria-pressed={isOn}
                                onClick={() => onToggle(option.label)}
                                // `border-0!` and `bg-…!`: `index.css` has an unlayered `button`
                                // block that beats any utility in `@layer utilities`, and a control
                                // that ignored it once rendered with a visible box around every row.
                                className={`flex w-full items-baseline justify-between gap-3 border-0! px-0! py-1.5 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[color:var(--color-accent)] ${
                                    isOn
                                        ? "bg-transparent! text-[color:var(--color-accent)]!"
                                        : "bg-transparent! text-[color:var(--color-silver)]! hover:text-[color:var(--color-fg)]!"
                                }`}
                                style={{paddingLeft: `${(option.depth - 1) * 0.875}rem`}}
                            >
                                <span className="min-w-0 truncate text-[length:var(--text-body-sm)]">
                                    {option.label}
                                </span>
                                <span className="shrink-0 font-mono text-[length:var(--text-label)] tabular-nums text-[color:var(--color-steel)]">
                                    {count === 0 ? "" : count}
                                </span>
                            </button>
                        </li>
                    );
                })}
            </ul>
        </nav>
    );
}
