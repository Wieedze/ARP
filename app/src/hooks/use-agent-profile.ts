import {useQuery} from "@tanstack/react-query";
import type {AgentProfile, AgentRef} from "@arp-protocol/erc8004";

import {buildTrustPanel, type TrustPanelView} from "../services/agent-trust";
import {fetchAgentProfile} from "../services/erc8004-connector";

/**
 * The trust panel's read.
 *
 * The lifecycle lives here and the work lives in the services: the hook calls
 * the connector and hands the result to `buildTrustPanel`, and no component
 * touches either. The query options are exported separately so their contract
 * — key, guard and the mapping from profile to view — is unit-testable without
 * a DOM, which is what ADR 0011 leaves room for.
 */

export type AgentProfileFetcher = (ref: AgentRef) => Promise<AgentProfile>;

export function agentProfileQueryKey(ref: AgentRef | null) {
    return ["erc8004", "agent-profile", ref?.chainId ?? null, ref?.tokenId ?? null] as const;
}

export function agentProfileQueryOptions(
    ref: AgentRef | null,
    fetchProfile: AgentProfileFetcher = fetchAgentProfile,
) {
    return {
        queryKey: agentProfileQueryKey(ref),
        queryFn: async (): Promise<TrustPanelView> => {
            if (ref === null) {
                throw new Error("No agent reference to resolve.");
            }
            return buildTrustPanel(await fetchProfile(ref));
        },
        enabled: ref !== null,
        // Several resolver round trips per read; re-running them on every
        // remount would hammer providers' endpoints for no new information.
        staleTime: 60_000,
        retry: 0,
    };
}

export function useAgentProfile(ref: AgentRef | null) {
    return useQuery(agentProfileQueryOptions(ref));
}
