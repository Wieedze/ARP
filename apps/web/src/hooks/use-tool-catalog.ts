import {keepPreviousData, useQuery} from "@tanstack/react-query";
import {
    listRegisteredTools,
    listTools,
    type RegisteredToolsPage,
    type ToolListingOrder,
    type ToolListingPage,
} from "@arp-protocol/core";

import {buildToolCatalogView, type ToolCatalogView} from "../services/tool-catalog";
import {useChainChoice} from "../lib/chain-choice";
import {sponsorAddressFor} from "../lib/sponsor";

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
 *
 * **Two reads, in parallel.** `listTools` gives the tools agents declared using; `listRegisteredTools`
 * gives the tools somebody registered through ARP. They are different populations and the second
 * exists because the first is empty: 0 of mainnet's 185 `uses` edges have an identified agent as
 * their subject, so a catalogue of declarations alone has nothing to show **until agents arrive,
 * through ARP**. A registered tool is an atom, not an edge, so a person can create one without
 * being one.
 *
 * **That zero is our own non-activity, not a property of the graph** (user, 2026-10-27): nobody has run this loop yet, ARP included. It is a reason to show something else today, never a reason to conclude the edge is the wrong one.
 */

export type ToolCatalogFetcher = (
    order: ToolListingOrder,
    curveId: number,
    sponsor: string | null,
) => Promise<ToolListingPage>;

export type RegisteredToolsFetcher = (curveId: number) => Promise<RegisteredToolsPage>;

const fetchToolListing =
    (graphqlUrl: string): ToolCatalogFetcher =>
    (order, curveId, sponsor) =>
        listTools({graphqlUrl, order, curveId, sponsor});

const fetchRegisteredTools =
    (graphqlUrl: string): RegisteredToolsFetcher =>
    (curveId) =>
        listRegisteredTools({graphqlUrl, curveId});

/**
 * The curve is in the key, like the order is.
 *
 * The two curves are two different markets, not two views of one — curve 1 is linear and carries
 * 26.20 TRUST, curve 2 is offset progressive and carries 219.54. Serving one from the other's cache
 * would show a figure from one market beside a count from the other, which is the contradiction
 * `rules/claims.md` §2 is about.
 */
/**
 * The **chain is in the key**, and it is the one that cannot be left out.
 *
 * Without it, switching chains serves the other chain's rows from cache: testnet figures under a
 * mainnet heading, which is `rules/claims.md` §2 rendered as a page. The curve is in for the same
 * reason one paragraph down.
 *
 * **The sponsor is in the key** because it decides which deposits read as proven: a page read
 * without one must not be served once one is configured.
 */
export function toolCatalogQueryKey(
    chainId: number,
    order: ToolListingOrder,
    curveId: number,
    sponsor: string | null = null,
) {
    return ["intuition", chainId, "tool-catalog", order, curveId, sponsor] as const;
}

/**
 * `sponsor` rides with the chain because it belongs to one: ARP's sponsoring service is on testnet
 * only, so the address is a property of where the read goes.
 */
export function toolCatalogQueryOptions(
    chain: {chainId: number; graphqlUrl: string; sponsor?: string | null},
    order: ToolListingOrder,
    curveId: number,
    fetchListing: ToolCatalogFetcher = fetchToolListing(chain.graphqlUrl),
    fetchRegistered: RegisteredToolsFetcher = fetchRegisteredTools(chain.graphqlUrl),
) {
    const sponsor = chain.sponsor ?? null;
    return {
        queryKey: toolCatalogQueryKey(chain.chainId, order, curveId, sponsor),
        queryFn: async (): Promise<ToolCatalogView> => {
            // In parallel: two independent reads of the same endpoint, and neither needs the other.
            const [declared, registered] = await Promise.all([
                fetchListing(order, curveId, sponsor),
                fetchRegistered(curveId),
            ]);
            return buildToolCatalogView(declared, registered);
        },
        // Two graph reads, and both populations move on the order of days at most.
        staleTime: 120_000,
        retry: 1,
        // Switching order keeps the list on screen instead of replacing it with
        // a loading state — the rows are the same rows in a different sequence.
        placeholderData: keepPreviousData,
    };
}

export function useToolCatalog(order: ToolListingOrder, curveId: number) {
    const chain = useChainChoice();
    // Vite types every `import.meta.env` key through an index signature, so the value arrives as
    // `any`; annotating it here keeps that from crossing into a typed parameter.
    const configured: string | undefined = import.meta.env.VITE_ARP_SPONSOR_ADDRESS;
    const sponsor = sponsorAddressFor(chain.chainId, configured);
    return useQuery(toolCatalogQueryOptions({...chain, sponsor}, order, curveId));
}
