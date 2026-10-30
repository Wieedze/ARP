import {useRef, type KeyboardEvent} from "react";

import {panelDomId, tabDomId} from "./tab-ids";

export type SectionTab = {slug: string; label: string; count?: number | null};

/**
 * The page's sections as a tab strip.
 *
 * An agent page carries five answers — what it published, what is claimed about it, what providers
 * rate it, what it can do, what could not be read — and stacking them made a reader scroll past
 * four to reach the fifth. The user's instruction: _« tout ça peut aller dans un onglet […] tous
 * les ratings peuvent aussi être dans un onglet rating et toutes les capabilities aussi »_.
 *
 * **The actions stay above the strip.** Taking a position and declaring a use are things a reader
 * came to *do*; putting them behind a tab would hide the page's only two writes behind a click.
 *
 * ## The duplication, stated rather than hidden
 *
 * `TrustPanelTabs` implements the same WAI-ARIA pattern — automatic activation, both arrow axes,
 * Home and End — for *provider rows*, whose `PanelTab` is a discriminated union carrying a trust
 * row and a summary. This one is generic over `{slug, label}`. **The keyboard handling is therefore
 * written twice**, which is what `lib/control-class.ts` opens by warning about, and the honest
 * reading is that one of them should be a shell around the other. That is a refactor of a working
 * component with its own reason to exist, so it is recorded here rather than done inside a feature.
 *
 * Both arrow axes are accepted for the reason the other one gives: the strip wraps onto a second
 * row on a narrow viewport, and "right" is then not where the next tab is.
 */
export function SectionTabs({
    tabs,
    selectedSlug,
    baseId,
    onSelect,
}: {
    tabs: readonly SectionTab[];
    selectedSlug: string;
    baseId: string;
    onSelect: (slug: string) => void;
}) {
    const buttons = useRef<(HTMLButtonElement | null)[]>([]);

    function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
        const last = tabs.length - 1;
        let next: number;
        switch (event.key) {
            case "ArrowRight":
            case "ArrowDown":
                next = index === last ? 0 : index + 1;
                break;
            case "ArrowLeft":
            case "ArrowUp":
                next = index === 0 ? last : index - 1;
                break;
            case "Home":
                next = 0;
                break;
            case "End":
                next = last;
                break;
            default:
                return;
        }
        event.preventDefault();
        const tab = tabs[next];
        if (tab === undefined) return;
        onSelect(tab.slug);
        buttons.current[next]?.focus();
    }

    return (
        <div
            role="tablist"
            aria-label="Sections"
            className="flex flex-wrap gap-x-8 gap-y-2 border-b border-[color:var(--color-rule-strong)]"
        >
            {tabs.map((tab, index) => {
                const selected = tab.slug === selectedSlug;
                return (
                    <button
                        key={tab.slug}
                        ref={(node) => {
                            buttons.current[index] = node;
                        }}
                        type="button"
                        role="tab"
                        id={tabDomId(baseId, tab.slug)}
                        aria-selected={selected}
                        aria-controls={panelDomId(baseId, tab.slug)}
                        // Only the selected tab is in the tab order; the arrows move within the
                        // strip. That is the pattern, not a preference.
                        tabIndex={selected ? 0 : -1}
                        onClick={() => onSelect(tab.slug)}
                        onKeyDown={(event) => handleKeyDown(event, index)}
                        className={`-mb-px border-0! border-b-2! px-0 py-3 text-[length:var(--text-body-sm)] ${
                            selected
                                ? "border-[color:var(--color-accent)]! text-[color:var(--color-fg)]!"
                                : "border-transparent! text-[color:var(--color-steel)]! hover:text-[color:var(--color-fg)]!"
                        }`}
                    >
                        {tab.label}
                        {/* A count only where there is one to give. An absent count is not zero —
                            `null` means the read has not answered, and `0` is a fact. */}
                        {tab.count === undefined || tab.count === null ? null : (
                            <span className="ml-2 font-mono text-[length:var(--text-label)] text-[color:var(--color-steel)]">
                                {tab.count}
                            </span>
                        )}
                    </button>
                );
            })}
        </div>
    );
}
