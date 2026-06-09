import {useQuery} from "@tanstack/react-query";

import {arpClient} from "../lib/arp-sdk";
import {getAgents as sdkGetAgents, getLiveAgents as sdkGetLiveAgents, type Agent} from "@arp-protocol/sdk";

export type {Agent};

/**
 * Enumerate every ARP agent ever registered. Implemented as a thin
 * react-query wrapper around `@arp-protocol/sdk`'s `getAgents` — the SDK does
 * the event-log scan + `getAgentWallet` follow-ups under the hood.
 *
 * The hook stays in the app layer purely to provide the React Query
 * lifecycle (stale time, refetch interval, suspense surface). All on-
 * chain logic lives in the SDK so any non-React runtime can call it
 * the same way.
 */
export function useAgents() {
    return useQuery({
        queryKey: ["arp.agents"],
        queryFn: () => sdkGetAgents(arpClient),
        staleTime: 30_000,
        refetchInterval: 30_000,
    });
}

/**
 * Same as `useAgents` but pre-filtered to agents with a designated
 * runtime wallet.
 */
export function useLiveAgents() {
    return useQuery({
        queryKey: ["arp.liveAgents"],
        queryFn: () => sdkGetLiveAgents(arpClient),
        staleTime: 30_000,
        refetchInterval: 30_000,
    });
}
