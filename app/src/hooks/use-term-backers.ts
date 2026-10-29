import {useQuery} from "@tanstack/react-query";
import {getTermBackers, type TermBacker} from "@arp-protocol/core";

import {useChainChoice} from "../lib/chain-choice";

/**
 * Who holds a position on a term, largest first.
 *
 * Separate from `useTermShape`, which returns the **aggregates** over the same rows — concentration,
 * breadth, when backers arrived. Those answer "how is this held"; this answers "by whom", and a
 * page can want either without the other.
 *
 * The list is capped at 100 by the indexer, so its length is not a count: `TermShape.positionCount`
 * comes from an aggregate and is the exact one.
 */
export function termBackersQueryKey(chainId: number, termId: string | null, curveId: string) {
    return ["intuition", chainId, "term-backers", termId ?? "none", curveId] as const;
}

export function termBackersQueryOptions(
    chain: {chainId: number; graphqlUrl: string},
    termId: string | null,
    curveId: bigint | undefined,
    read: typeof getTermBackers = getTermBackers,
) {
    return {
        queryKey: termBackersQueryKey(chain.chainId, termId, String(curveId ?? "none")),
        queryFn: async (): Promise<TermBacker[]> => {
            if (termId === null || curveId === undefined) throw new Error("no term");
            return read(termId, curveId, {graphqlUrl: chain.graphqlUrl});
        },
        // Nothing until the curve is known: a term holds a different set per curve.
        enabled: termId !== null && curveId !== undefined,
        staleTime: 120_000,
        retry: 1,
    };
}

export function useTermBackers(termId: string | null, curveId: bigint | undefined) {
    const chain = useChainChoice();
    return useQuery(termBackersQueryOptions(chain, termId, curveId));
}
