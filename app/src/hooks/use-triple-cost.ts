import {useQuery} from "@tanstack/react-query";

import {multiVaultAbi} from "../lib/abi/multi-vault";
import {useChainChoice, type ChainChoice} from "../lib/chain-choice";

/**
 * What one new triple costs on the chain in view, in wei.
 *
 * **Read, never copied.** `rules/portability.md`: the term costs are governance-configurable and
 * the two chains are **100× apart** — `getTripleCost()` is 0.1 TRUST on 1155 against 0.001 tTRUST
 * on 13579. A constant in the source is right on one chain and wrong by two orders of magnitude on
 * the other, which is exactly the shape of `rules/claims.md` §2: one number, one context.
 *
 * It is a **floor**, not a price. A declaration also pays `getAtomCost()` for any of the three
 * atoms that does not exist yet, so a caller that renders this says "from", never "costs".
 */
export function tripleCostQueryKey(chainId: number) {
    return ["intuition", chainId, "triple-cost"] as const;
}

export function tripleCostQueryOptions(chain: ChainChoice) {
    return {
        queryKey: tripleCostQueryKey(chain.chainId),
        queryFn: (): Promise<bigint> =>
            chain.client.readContract({
                address: chain.multiVault,
                abi: multiVaultAbi,
                functionName: "getTripleCost",
            }) as Promise<bigint>,
        // Governance can move it, and nothing else can. An hour is far shorter than that.
        staleTime: 3_600_000,
        retry: 1,
    };
}

export function useTripleCost() {
    return useQuery(tripleCostQueryOptions(useChainChoice()));
}
