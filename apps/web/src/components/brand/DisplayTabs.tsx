/**
 * Two or more views of one page as words in display type beside its title: the selected one in
 * paper with the Saffron underline, the others dim, each with its count.
 *
 * Buttons with `aria-pressed`, not tabs: the choice switches what the list shows and keeps the
 * reader on the page. Shared by `/tools` (Skills / Repositories) and `/activity` (Yours / Everyone),
 * so the two read as one control (task 46c).
 */
export function DisplayTabs<Id extends string>({
    label,
    options,
    selected,
    onChange,
}: {
    /** The group's accessible name. */
    label: string;
    /** `count` is `null` while it is unknown, shown as "—"; it is never a zero standing in.
     *  Left out, the tab shows no count at all, for a view that is not a list. */
    options: readonly {id: Id; label: string; count?: number | null}[];
    selected: Id;
    onChange: (next: Id) => void;
}) {
    return (
        <div
            role="group"
            aria-label={label}
            className="translate-y-3 flex flex-wrap items-baseline gap-x-8 gap-y-2"
        >
            {options.map((entry) => {
                const isSelected = entry.id === selected;
                return (
                    <button
                        key={entry.id}
                        type="button"
                        aria-pressed={isSelected}
                        onClick={() => onChange(entry.id)}
                        // Banged: `index.css`'s unlayered `button { border; color }` beats any
                        // utility, as `lib/control-class` lists. Its 10px radius curves the
                        // underline's ends; `px-2.5 -mx-2.5` puts the curves just outside the label,
                        // as `SectionTabs` does.
                        className={`-mx-2.5 flex items-baseline gap-2 border-0! border-b-2! bg-transparent px-2.5 pb-1 type-face text-[26px] leading-none ${
                            isSelected
                                ? "border-[color:var(--color-accent)]! text-[color:var(--color-fg)]!"
                                : "border-transparent! text-[color:var(--color-grey)]! hover:text-[color:var(--color-silver)]!"
                        }`}
                    >
                        {entry.label}
                        {entry.count !== undefined && (
                            <span className="font-mono text-[length:var(--text-body-sm)] tabular-nums text-[color:var(--color-steel)]">
                                {entry.count === null ? "—" : entry.count.toLocaleString("en-US")}
                            </span>
                        )}
                    </button>
                );
            })}
        </div>
    );
}
