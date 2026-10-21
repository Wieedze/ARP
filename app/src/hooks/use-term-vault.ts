import {useQuery} from "@tanstack/react-query";
import type {Address, Hex, PublicClient} from "viem";

import {intuitionMainnetClient} from "../lib/intuition-mainnet";
import {readVaultPosition, type VaultPosition} from "../services/trust-stake";

/**
 * Live on-chain state for **one** vault.
 *
 * The single-sided sibling of `use-claim-vaults`, for a target that has no other side: an atom
 * carries no assertion, so there is no counter vault to read beside it (ADR `0056`). Reading both
 * through `readClaimVaults` would have meant deriving a counter id for a term that has none.
 *
 * Disabled until there is a term and a curve id — nothing here fires on mount without both.
 */
export function termVaultQueryOptions(
    params: {termId: Hex | null; curveId: bigint | null; account: Address | null},
    client: PublicClient = intuitionMainnetClient,
) {
    const {termId, curveId, account} = params;
    return {
        queryKey: [
            "intuition-mainnet",
            "term-vault",
            termId,
            curveId?.toString() ?? null,
            account,
        ] as const,
        queryFn: (): Promise<VaultPosition> => {
            if (termId === null || curveId === null) {
                throw new Error("No term to read.");
            }
            return readVaultPosition(client, {termId, curveId, account});
        },
        enabled: termId !== null && curveId !== null,
        staleTime: 15_000,
        retry: 1,
    };
}

export function useTermVault(params: {
    termId: Hex | null;
    curveId: bigint | null;
    account: Address | null;
}) {
    return useQuery(termVaultQueryOptions(params));
}
