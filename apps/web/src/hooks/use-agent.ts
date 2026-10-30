import {useQuery} from "@tanstack/react-query";
import {useAccount} from "wagmi";

import {identityRegistryAbi} from "../lib/abi/identity-registry";
import {publicClient} from "../lib/clients";
import {deployments} from "../lib/deployments";
import {findAgentIdByOwner} from "../services/agent-identity";

const ADDRESS = deployments.arp.identityRegistry;

/**
 * Resolve the connected wallet's ERC-8004 agentId, if any.
 *
 * Returns `{ agentId: bigint | null, isLoading, error }`. `null` after
 * loading means the connected address has not registered yet — the UI
 * should show a "Register as agent" CTA.
 *
 * Implemented as an event-log scan rather than an on-chain reverse-lookup
 * because the ChaosChain reference impl does not maintain an owner →
 * agentId mapping (ERC-721 only carries `balanceOf`).
 */
export function useAgentId() {
    const {address} = useAccount();

    return useQuery({
        queryKey: ["agentId", address],
        queryFn: () => {
            if (!address) return null;
            return findAgentIdByOwner({owner: address, publicClient});
        },
        enabled: Boolean(address),
        staleTime: 60_000,
    });
}

/**
 * Read the runtime wallet bound to an agent NFT via `setAgentWallet`.
 * Returns the zero address if no runtime wallet has been designated yet.
 */
export function useAgentWallet(agentId: bigint | null | undefined) {
    return useQuery({
        queryKey: ["agentWallet", agentId?.toString()],
        queryFn: async () => {
            if (!agentId) return null;
            const result = await publicClient.readContract({
                address: ADDRESS,
                abi: identityRegistryAbi,
                functionName: "getAgentWallet",
                args: [agentId],
            });
            return result;
        },
        enabled: Boolean(agentId),
        staleTime: 30_000,
    });
}

/**
 * Read `totalAgents()` from the IdentityRegistry. Useful for the metrics
 * surface ("N agents registered").
 */
export function useTotalAgents() {
    return useQuery({
        queryKey: ["totalAgents"],
        queryFn: async () => {
            const result = await publicClient.readContract({
                address: ADDRESS,
                abi: identityRegistryAbi,
                functionName: "totalAgents",
            });
            return result;
        },
        staleTime: 30_000,
    });
}
