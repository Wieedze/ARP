import {useQuery} from "@tanstack/react-query";
import type {Address, PublicClient} from "viem";

import {useChainChoice} from "../lib/chain-choice";
import {readStakeSession, type StakeSession} from "../services/trust-stake";

/**
 * The chain-level constants a stake needs: the default bonding curve id and
 * the MultiVault's `minDeposit`.
 *
 * Both are governance-configurable, so both are read rather than assumed — the
 * curve is `1` on mainnet today and that is not a guarantee. Cached for the
 * session because neither moves within one.
 *
 * **Per chain, and the values genuinely differ**: `minDeposit` is 0.001 TRUST on testnet 13579
 * against 0.01 on mainnet 1155 (`rules/portability.md`), so the chain id is in the key. Serving one
 * chain's `minDeposit` under the other's label would put a wrong floor in the amount validator.
 */
export function stakeSessionQueryOptions(
    chainId: number,
    client: PublicClient,
    multiVault: Address,
) {
    return {
        queryKey: ["intuition", chainId, "stake-session"] as const,
        queryFn: (): Promise<StakeSession> => readStakeSession(client, multiVault),
        staleTime: 10 * 60_000,
        retry: 1,
    };
}

export function useStakeSession() {
    const chain = useChainChoice();
    return useQuery(stakeSessionQueryOptions(chain.chainId, chain.client, chain.multiVault));
}
