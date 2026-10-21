import {formatTrust} from "./trust-format";
import type {ToolListing, ToolListingOrder, ToolListingPage} from "@arp-protocol/core";

/**
 * Turns one `ToolListingPage` into the rows `/tools` renders.
 *
 * Pure: no network, no React. It does no sorting and no filtering of its own. The order is a
 * property of the whole listing, and the filtering that matters — agent declarations only — happens
 * in the query (`listTools`), because prose on a shared predicate is not this protocol's data and
 * should not reach a caller at all.
 */

/**
 * The two orders the page offers, and neither is a quality ranking.
 *
 * There is no order by score and will not be: ARP composes none (ADR `0046`), and one descending
 * score column would undo the argument the whole surface exists to make.
 */
/**
 * The two bonding curves, named for what a position on each one *means* rather than by its id.
 *
 * Read off the curve registry on mainnet 1155, 2026-10-20: there are exactly two — curve 1 "Linear
 * Curve" and curve 2 "Offset Progressive Curve" — and `defaultCurveId` is 1.
 *
 * They carry different information, which is why this is a selector and never a sum:
 *
 * | curve | what it does | what a position says |
 * | --- | --- | --- |
 * | 1, linear | price tracks supply proportionally | "I stand behind this, durably" — the gain follows growth, not timing |
 * | 2, offset progressive | price rises faster than supply | "I think this is about to be noticed" — early entry pays a lot, late entry overpays |
 *
 * Measured the same day over the 185 `uses` edges: curve 1 holds 26.20 TRUST at a share price of
 * 1.000–1.060 across 185 vaults; curve 2 holds 219.54 at 3.000–4.181 across 28. **Two populations,
 * never added** — a lot on the linear curve beside little on the progressive reads as quietly
 * trusted, the reverse reads as hyped, and a total erases both readings.
 */
export const TOOL_CURVES: readonly {id: number; label: string; curve: string}[] = [
    {id: 1, label: "Long term", curve: "Linear Curve"},
    {id: 2, label: "Short term", curve: "Offset Progressive Curve"},
];

export const TOOL_ORDERS: readonly {id: ToolListingOrder; label: string}[] = [
    {id: "priced-edges", label: "Most declarations paid for"},
    {id: "conviction", label: "Most TRUST behind"},
    {id: "declarations", label: "Most declarations"},
];

export type ToolRow = {
    key: string;
    /** The tool's label, or its atom id when the graph holds no label. */
    name: string;
    /** True when `name` is the atom id, so it can be set in mono. */
    isUnnamed: boolean;
    href: string;
    declarations: number;
    /**
     * How many of this tool's declarations carry at least one position.
     *
     * Never a summed position count: positions are counted per vault, and a sum across an atom's
     * edges is a count of nothing a reader recognises (ADR `0023`).
     */
    paidDeclarations: number;
    supportTrust: string;
    /** `null` when nothing stands against the tool, so the cell stays empty rather than showing a zero. */
    opposeTrust: string | null;
};

export type ToolCatalogView = {
    rows: ToolRow[];
    /** True when the read hit its limit, so these rows are a prefix rather than the whole set. */
    truncated: boolean;
    /**
     * The bonding curve the figures were read at.
     *
     * Part of a TRUST sum's population (`rules/claims.md` §2), carried so the list can name it on
     * the figure itself rather than in a line of its own.
     */
    curveId: number;
};

function rowOf(tool: ToolListing): ToolRow {
    const label = tool.label?.trim();
    const named = label !== undefined && label.length > 0;
    return {
        key: tool.atomId,
        name: named ? label : tool.atomId,
        isUnnamed: !named,
        href: `/tool/atom/${tool.atomId}`,
        declarations: tool.edgeCount,
        paidDeclarations: tool.pricedEdges,
        supportTrust: formatTrust(tool.supportAssetsSum),
        opposeTrust: tool.opposeAssetsSum > 0n ? formatTrust(tool.opposeAssetsSum) : null,
    };
}

export function buildToolCatalogView(page: ToolListingPage): ToolCatalogView {
    return {rows: page.tools.map(rowOf), truncated: page.truncated, curveId: page.curveId};
}
