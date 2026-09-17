import {useRef, type KeyboardEvent} from "react";

import type {PanelTab, TabSummary} from "../../services/agent-trust";

import {panelDomId, tabDomId} from "./tab-ids";

/**
 * The tab strip — and the panel's comparison device.
 *
 * Stacking let a reader see one provider's signed assessment beside another's
 * unsigned one at the same time. That comparison is the page's editorial claim,
 * and a strip of bare names would destroy it. So every tab carries, from every
 * tab, the connector's verdict on that provider's document. The score, and what
 * it rests on, stay in the panel: a strip of scores would rank providers by
 * exactly the variable ADR 0018 argues is not the measure.
 *
 * The strip owns no state. The selected tab lives in the URL, so a link to one
 * provider's view is shareable and a refresh keeps the place.
 */

/** The verdict line for the two tabs that are not a provider's claim. */
const STATIC_LINES: Record<"arp" | "agent", string> = {
    arp: "no assessment",
    agent: "capabilities",
};

/**
 * Monochrome, with one exception.
 *
 * The accent is spent on the selected state here, so it cannot also mean
 * "signed" — `verified` is separated from `not verified` by foreground weight
 * instead, the same device `FreshnessLine` uses for stale against fresh.
 * `mismatch` keeps the alarm colour: a document that does not recover to the
 * signer it names has to be unmissable from the tab that hides it, not only
 * from inside the panel (ADR 0018, ADR 0028).
 *
 * Nothing here drops below `--color-fg-60`. At `--text-label` the next step
 * down is 3.66:1, and in this strip the tone is not chrome — it is how the
 * bottom tier is told from the one above it. `absent` and `unverified` land on
 * the same tone as a result; their words differ, and the panel one click away
 * carries the whole verdict.
 */
const SIGNATURE_TONE_CLASS: Record<TabSummary["signature"]["status"], string> = {
    verified: "text-[color:var(--color-fg)]",
    mismatch: "text-[color:var(--color-alarm)]",
    unverified: "text-[color:var(--color-fg-60)]",
    absent: "text-[color:var(--color-fg-60)]",
};

function isMismatch(tab: PanelTab): boolean {
    return tab.kind === "provider" && tab.summary.signature.status === "mismatch";
}

function TabLine({tab}: {tab: PanelTab}) {
    const [text, tone] =
        tab.kind === "provider"
            ? [tab.summary.signature.label, SIGNATURE_TONE_CLASS[tab.summary.signature.status]]
            : [STATIC_LINES[tab.kind], "text-[color:var(--color-fg-60)]"];

    return (
        <span
            className={`mt-1.5 block font-mono uppercase tracking-wider text-[length:var(--text-label)] ${tone}`}
        >
            {text}
        </span>
    );
}

export function TrustPanelTabs({
    tabs,
    selectedSlug,
    baseId,
    onSelect,
}: {
    tabs: PanelTab[];
    selectedSlug: string;
    baseId: string;
    onSelect: (slug: string) => void;
}) {
    const buttons = useRef<(HTMLButtonElement | null)[]>([]);

    /**
     * Automatic activation per the WAI-ARIA tabs pattern: an arrow key moves
     * focus and selects. Both axes are accepted, because the strip wraps onto a
     * second row on a narrow viewport and "right" is then not where the next tab
     * is.
     */
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
        onSelect(tabs[next].slug);
        buttons.current[next]?.focus();
    }

    return (
        <div
            role="tablist"
            aria-label="Assessments by provider, ARP's own position, and the agent's own data"
            className="flex flex-wrap gap-x-5 gap-y-7"
        >
            {tabs.map((tab, index) => {
                const isSelected = tab.slug === selectedSlug;
                const alarmed = isMismatch(tab);
                const ruleColour = alarmed
                    ? "bg-[color:var(--color-alarm)]"
                    : isSelected
                      ? "bg-[color:var(--color-accent)]"
                      : "bg-[color:var(--color-border-strong)]";

                return (
                    <button
                        key={tab.slug}
                        type="button"
                        role="tab"
                        id={tabDomId(baseId, tab.slug)}
                        aria-controls={panelDomId(baseId, tab.slug)}
                        aria-selected={isSelected}
                        tabIndex={isSelected ? 0 : -1}
                        ref={(node) => {
                            buttons.current[index] = node;
                        }}
                        onClick={() => onSelect(tab.slug)}
                        onKeyDown={(event) => handleKeyDown(event, index)}
                        // `border-0!` and not `border-0`: `index.css` gives
                        // every button a hairline box in an *unlayered* rule,
                        // and an unlayered normal declaration beats every
                        // utility regardless of specificity. Only an important
                        // one wins it back. A tab's single rule is the one
                        // above it, not a box around it.
                        //
                        // The basis wraps the strip onto a second row rather
                        // than overflowing at 400px; the cap stops a tab left
                        // alone on that row from stretching the whole width.
                        className="group border-0! p-0 grow basis-[9rem] max-w-[18rem] min-w-0 text-left"
                    >
                        {/* Fixed-height slot so a 1px rule and a 2px rule do not
                            shift the labels beside them off a common baseline. */}
                        <span aria-hidden="true" className="block h-0.5">
                            <span
                                className={`block w-full ${isSelected || alarmed ? "h-0.5" : "h-px"} ${ruleColour}`}
                            />
                        </span>
                        <span
                            className={`mt-3 block text-[length:var(--text-body)] break-words ${
                                isSelected
                                    ? "font-medium text-[color:var(--color-fg)]"
                                    : "text-[color:var(--color-fg-60)] group-hover:text-[color:var(--color-fg)]"
                            }`}
                        >
                            {tab.label}
                        </span>
                        <TabLine tab={tab} />
                    </button>
                );
            })}
        </div>
    );
}
