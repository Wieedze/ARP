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
