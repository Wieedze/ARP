import {useQuery} from "@tanstack/react-query";
import type {Address, Hex, PublicClient} from "viem";

import {useChainChoice} from "../lib/chain-choice";
import {readClaimVaults, type ClaimVaults} from "../services/trust-stake";

/**
 * Live on-chain state for both sides of one `has trust provider` claim.
 *
 * Read on top of the indexer's market numbers rather than instead of them: the
 * indexer supplies position counts, the chain supplies the balances a deposit
 * actually joins, and after a stake lands the chain is correct first. Disabled
 * until there is a triple and a curve id — nothing here fires on mount without
 * both.
 */
export function claimVaultsQueryOptions(
    chain: {chainId: number; client: PublicClient; multiVault: Address},
    params: {tripleId: Hex | null; curveId: bigint | null; account: Address | null},
) {
    const {tripleId, curveId, account} = params;
    return {
        // Chain id first, for the reason spelled out in `use-term-vault`: one term id, two vaults.
        queryKey: [
            "intuition",
            chain.chainId,
            "claim-vaults",
            tripleId,
            curveId?.toString() ?? null,
            account,
        ] as const,
        queryFn: (): Promise<ClaimVaults> => {
            if (tripleId === null || curveId === null) {
                throw new Error("No claim to read.");
            }
            return readClaimVaults(chain.client, {
                tripleId,
                curveId,
                account,
                multiVault: chain.multiVault,
            });
        },
        enabled: tripleId !== null && curveId !== null,
        staleTime: 15_000,
        retry: 1,
    };
}

export function useClaimVaults(params: {
    tripleId: Hex | null;
    curveId: bigint | null;
    account: Address | null;
}) {
    const chain = useChainChoice();
    return useQuery(claimVaultsQueryOptions(chain, params));
}
