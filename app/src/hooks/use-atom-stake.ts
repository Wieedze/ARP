import {useQuery} from "@tanstack/react-query";
import {type Hex} from "viem";

import {publicClient} from "../lib/clients";
import {readVaultState} from "../services/atom-stake";

/**
 * Read total assets + shares staked on an atom vault. Used by the module
 * list / detail surfaces to show per-tool reputation metrics.
 *
 * `null` while loading. Returns `{ totalAssets: 0n, totalShares: 0n }`
 * for atoms with no deposits.
 */
export function useAtomStake(atomId: Hex | undefined) {
    return useQuery({
        queryKey: ["atomStake", atomId],
        queryFn: async () => {
            if (!atomId) return null;
            return readVaultState({atomId, publicClient});
        },
        enabled: Boolean(atomId),
        staleTime: 15_000,
    });
}
