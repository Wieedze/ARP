import {useQuery} from "@tanstack/react-query";
import {getDeclaredModulesFor} from "@arp-protocol/core";

import {useChainChoice} from "../lib/chain-choice";

/**
 * What each of several agents declared using, for the sigils beside their claims.
 *
 * **One query for the whole page**, not one per agent: a tool's page lists every agent that
 * declared it, and thirty-six round trips to draw thirty-six glyphs is a fan-out nobody asked for.
 *
 * The key is the sorted subject list, so two pages showing the same agents in a different order
 * share one cache entry rather than refetching.
 */
export function declaredModulesQueryKey(chainId: number, subjectIds: readonly string[]) {
    return ["intuition", chainId, "declared-modules", [...subjectIds].sort().join(",")] as const;
}

export function declaredModulesQueryOptions(
    chain: {chainId: number; graphqlUrl: string},
    subjectIds: readonly string[],
    read: typeof getDeclaredModulesFor = getDeclaredModulesFor,
) {
    return {
        queryKey: declaredModulesQueryKey(chain.chainId, subjectIds),
        queryFn: async () => read(subjectIds, {graphqlUrl: chain.graphqlUrl}),
        enabled: subjectIds.length > 0,
        staleTime: 120_000,
        retry: 1,
    };
}

export function useDeclaredModules(subjectIds: readonly string[]) {
    const chain = useChainChoice();
    return useQuery(declaredModulesQueryOptions(chain, subjectIds));
}
