import type {SectionTab} from "./SectionTabs";

/**
 * The DOM ids tying a tab to its panel.
 *
 * `aria-controls` on the tab and `aria-labelledby` on the panel have to agree,
 * and the two are rendered by different components — the strip and the page. A
 * screen reader that loses that pairing announces a panel with no name, so the
 * ids are built in one place rather than formatted twice.
 *
 * Slugs come from `buildPanelTabs`, which restricts them to `[a-z0-9-]`.
 */

export function tabDomId(baseId: string, slug: string): string {
    return `${baseId}-tab-${slug}`;
}

export function panelDomId(baseId: string, slug: string): string {
    return `${baseId}-panel-${slug}`;
}

/**
 * The tab a page opens on: the one a link names, else the first with rows, else the first.
 *
 * An absent count is not zero (`SectionTabs` says the same where it renders counts), so a tab
 * without one is never picked as having rows. An agent with 35 capabilities and no declarations
 * opened on an empty tab until task 46b.
 */
export function initialSectionOf(
    tabs: readonly SectionTab[],
    requested: string | null,
): string | null {
    return (
        tabs.find((tab) => tab.slug === requested)?.slug ??
        tabs.find((tab) => (tab.count ?? 0) > 0)?.slug ??
        tabs[0]?.slug ??
        null
    );
}
