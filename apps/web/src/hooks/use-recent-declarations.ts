import {useQuery} from "@tanstack/react-query";
import {getRecentDeclarations, type RecentDeclaration} from "@arp-protocol/core";

import {useChainChoice} from "../lib/chain-choice";

/**
 * The newest declarations an identified agent wrote.
 *
 * The chain leads the key, as everywhere else: an edge exists on one chain and not the other, and
 * without it switching serves the other chain's answer under the new label.
 *
 * **Empty is an answer, not a failure.** Measured 2026-10-27: mainnet returns 0 and testnet
 * returns 3. The mainnet zero is ARP's own non-activity — nobody has run this loop yet, ARP
 * included — so a caller says "nothing yet" and never falls back to a sample.
 */

export type RecentFetcher = (config: {
    graphqlUrl: string;
    limit?: number;
}) => Promise<RecentDeclaration[]>;

export function recentQueryKey(chainId: number, limit: number) {
    return ["intuition", chainId, "recent-declarations", limit] as const;
}

export function recentQueryOptions(
    chain: {chainId: number; graphqlUrl: string},
    limit = 8,
    fetchRecent: RecentFetcher = getRecentDeclarations,
) {
    return {
        queryKey: recentQueryKey(chain.chainId, limit),
        queryFn: (): Promise<RecentDeclaration[]> =>
            fetchRecent({graphqlUrl: chain.graphqlUrl, limit}),
        // A minute. The edges change when somebody writes one, which is rare enough that re-asking
        // the indexer on every mount would be the expensive half of a landing page.
        staleTime: 60_000,
        retry: 0,
    };
}

export function useRecentDeclarations(limit = 8) {
    const chain = useChainChoice();
    return useQuery(recentQueryOptions(chain, limit));
}
