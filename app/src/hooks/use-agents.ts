import {useQuery} from "@tanstack/react-query";
import {useMemo} from "react";
import {parseAbiItem, type Address} from "viem";

import {identityRegistryAbi} from "../lib/abi/identity-registry";
import {publicClient} from "../lib/clients";
import {deployments} from "../lib/deployments";

const IDENTITY_REGISTRY = deployments.arp.identityRegistry;

const REGISTERED_EVENT = parseAbiItem(
    "event Registered(uint256 indexed agentId, string agentURI, address indexed to)",
);

/**
 * A discovered agent on the ARP identity registry.
 *
 *   - `agentId`        ERC-8004 NFT id, same as the marketplace listing.
 *   - `owner`          The address that minted the NFT — the operator EOA.
 *   - `runtimeWallet`  The address bound via `setAgentWallet`. This is the
 *                      delegate of the agent's signed delegations and the
 *                      receiver of stakes when the agent positions itself
 *                      on tools (ADR 0012). `zeroAddress` if not yet bound.
 */
export type Agent = {
    agentId: bigint;
    owner: Address;
    runtimeWallet: Address;
};

/**
 * Enumerate every agent ever registered on the ARP IdentityRegistry.
 * Uses an event-log scan rather than a per-id getter loop because the
 * registry doesn't expose `tokensOfOwner` and the scan returns more
 * useful metadata (the `to` address = original operator).
 *
 * For each agent, follows up with a `getAgentWallet(id)` read to get
 * the current runtime binding.
 *
 * Returns an empty array while loading. Errors bubble up via the
 * `useQuery` interface so callers can show a retry button.
 */
export function useAgents() {
    return useQuery({
        queryKey: ["arp.agents"],
        queryFn: async (): Promise<Agent[]> => {
            const logs = await publicClient.getLogs({
                address: IDENTITY_REGISTRY,
                event: REGISTERED_EVENT,
                fromBlock: 0n,
                toBlock: "latest",
            });

            const wallets = await Promise.all(
                logs.map(async (log) => {
                    const agentId = log.args.agentId;
                    if (agentId === undefined) return null;
                    const runtime = await publicClient.readContract({
                        address: IDENTITY_REGISTRY,
                        abi: identityRegistryAbi,
                        functionName: "getAgentWallet",
                        args: [agentId],
                    });
                    return {
                        agentId,
                        owner: log.args.to as Address,
                        runtimeWallet: runtime as Address,
                    };
                }),
            );

            return wallets.filter((w): w is Agent => w !== null);
        },
        staleTime: 30_000,
        refetchInterval: 30_000,
    });
}

/**
 * Trim the agent list to those bound to a non-zero runtime wallet. Use
 * when the consumer needs to display only "live" agents (the others
 * have an NFT but no runtime yet).
 */
export function useLiveAgents(): {
    data: Agent[];
    isLoading: boolean;
    error: Error | null;
} {
    const q = useAgents();
    const data = useMemo<Agent[]>(() => {
        if (!q.data) return [];
        const zero = "0x0000000000000000000000000000000000000000".toLowerCase();
        return q.data.filter((a) => a.runtimeWallet.toLowerCase() !== zero);
    }, [q.data]);
    return {data, isLoading: q.isLoading, error: q.error as Error | null};
}
