import {useQuery} from "@tanstack/react-query";
import type {PublicClient} from "viem";

import {intuitionMainnetClient} from "../lib/intuition-mainnet";
import {readStakeSession, type StakeSession} from "../services/trust-stake";

/**
 * The chain-level constants a stake needs: the default bonding curve id and
 * the MultiVault's `minDeposit`.
 *
 * Both are governance-configurable, so both are read rather than assumed — the
 * curve is `1` on mainnet today and that is not a guarantee. Cached for the
 * session because neither moves within one.
 */
export function stakeSessionQueryOptions(client: PublicClient = intuitionMainnetClient) {
    return {
        queryKey: ["intuition-mainnet", "stake-session"] as const,
        queryFn: (): Promise<StakeSession> => readStakeSession(client),
        staleTime: 10 * 60_000,
        retry: 1,
    };
}

export function useStakeSession() {
    return useQuery(stakeSessionQueryOptions());
}
