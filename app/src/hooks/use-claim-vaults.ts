import {useQuery} from "@tanstack/react-query";
import type {Address, Hex, PublicClient} from "viem";

import {intuitionMainnetClient} from "../lib/intuition-mainnet";
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
    params: {tripleId: Hex | null; curveId: bigint | null; account: Address | null},
    client: PublicClient = intuitionMainnetClient,
) {
    const {tripleId, curveId, account} = params;
    return {
        queryKey: [
            "intuition-mainnet",
            "claim-vaults",
            tripleId,
            curveId?.toString() ?? null,
            account,
        ] as const,
        queryFn: (): Promise<ClaimVaults> => {
            if (tripleId === null || curveId === null) {
                throw new Error("No claim to read.");
            }
            return readClaimVaults(client, {tripleId, curveId, account});
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
    return useQuery(claimVaultsQueryOptions(params));
}
