import {keepPreviousData, useQuery} from "@tanstack/react-query";
import {listTools, type ToolListingOrder, type ToolListingPage} from "@arp-protocol/core";

import {buildToolCatalogView, type ToolCatalogView} from "../services/tool-catalog";
import {ERC8004_GRAPHQL_URL} from "../services/erc8004-connector";

/**
 * The tool catalogue's read.
 *
 * Lifecycle here, work in the services: the hook fetches and hands the page to
 * `buildToolCatalogView`. The options are exported separately so the key and
 * the mapping are testable without a DOM.
 *
 * It reads the **same graph the agent directory reads** — mainnet, where the
 * mirrored cohort is. That is deliberate: a page about what agents use, served
 * from a chain the agents are not on, would be a different question answered
 * under the same heading.
 */

export type ToolCatalogFetcher = (
    order: ToolListingOrder,
    curveId: number,
) => Promise<ToolListingPage>;

const fetchToolListing: ToolCatalogFetcher = (order, curveId) =>
    listTools({graphqlUrl: ERC8004_GRAPHQL_URL, order, curveId});

/**
 * The curve is in the key, like the order is.
 *
 * The two curves are two different markets, not two views of one — curve 1 is linear and carries
 * 26.20 TRUST, curve 2 is offset progressive and carries 219.54. Serving one from the other's cache
 * would show a figure from one market beside a count from the other, which is the contradiction
 * `rules/claims.md` §2 is about.
 */
export function toolCatalogQueryKey(order: ToolListingOrder, curveId: number) {
    return ["intuition", "tool-catalog", order, curveId] as const;
}

export function toolCatalogQueryOptions(
    order: ToolListingOrder,
    curveId: number,
    fetchListing: ToolCatalogFetcher = fetchToolListing,
) {
    return {
        queryKey: toolCatalogQueryKey(order, curveId),
        queryFn: async (): Promise<ToolCatalogView> =>
            buildToolCatalogView(await fetchListing(order, curveId)),
        // One graph read, and the `uses` edge count moves on the order of weeks.
        staleTime: 120_000,
        retry: 1,
        // Switching order keeps the list on screen instead of replacing it with
        // a loading state — the rows are the same rows in a different sequence.
        placeholderData: keepPreviousData,
    };
}

export function useToolCatalog(order: ToolListingOrder, curveId: number) {
    return useQuery(toolCatalogQueryOptions(order, curveId));
}
