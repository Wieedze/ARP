import {useQuery} from "@tanstack/react-query";

import {useChainChoice, type ChainChoice} from "../lib/chain-choice";
import {readDeclarationCost, type DeclarationCost} from "../services/declaration-cost";

/**
 * What the cheapest declaration costs on the chain in view.
 *
 * The chain leads the key, as everywhere else: the two MultiVaults charge figures **100× apart**
 * (`rules/portability.md`), so without it switching serves the other chain's number under the new
 * label — `rules/claims.md` §2 in its UI form.
 *
 * The fetcher is injectable for the same reason `use-recent-declarations.ts`'s is: the query
 * options are then testable without a DOM or a chain.
 */
export type CostFetcher = (params: {
    publicClient: ChainChoice["client"];
    multiVault: ChainChoice["multiVault"];
}) => Promise<DeclarationCost>;

export function declarationCostQueryKey(chainId: number) {
    return ["intuition", chainId, "declaration-cost"] as const;
}

export function declarationCostQueryOptions(
    chain: ChainChoice,
    fetchCost: CostFetcher = readDeclarationCost,
) {
    return {
        queryKey: declarationCostQueryKey(chain.chainId),
        queryFn: (): Promise<DeclarationCost> =>
            fetchCost({publicClient: chain.client, multiVault: chain.multiVault}),
        // Governance can move these, and nothing else can. An hour is far shorter than that.
        staleTime: 3_600_000,
        retry: 1,
    };
}

export function useDeclarationCost() {
    return useQuery(declarationCostQueryOptions(useChainChoice()));
}
