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

export type AgentProfileFetcher = (ref: AgentRef, curveId?: bigint) => Promise<AgentProfile>;

/**
 * The curve is part of the key.
 *
 * Market numbers are read for one bonding curve and a stake is deposited into
 * the curve `getBondingCurveConfig()` names. Keying on it means that if the two
 * ever diverge the profile refetches instead of rendering a market that belongs
 * to a different vault. On mainnet today the chain reports `1`, which is also
 * the package default, so the key is unchanged and nothing refetches.
 */
export function agentProfileQueryKey(ref: AgentRef | null, curveId?: bigint) {
    return [
        "erc8004",
        "agent-profile",
        ref?.chainId ?? null,
        ref?.tokenId ?? null,
        curveId === undefined ? "default" : curveId.toString(),
    ] as const;
}

export function agentProfileQueryOptions(
    ref: AgentRef | null,
    curveId?: bigint,
    fetchProfile: AgentProfileFetcher = fetchAgentProfile,
) {
    return {
        queryKey: agentProfileQueryKey(ref, curveId),
        queryFn: async (): Promise<TrustPanelView> => {
            if (ref === null) {
                throw new Error("No agent reference to resolve.");
            }
            return buildTrustPanel(await fetchProfile(ref, curveId));
        },
        enabled: ref !== null,
        // Several resolver round trips per read; re-running them on every
        // remount would hammer providers' endpoints for no new information.
        staleTime: 60_000,
        retry: 0,
    };
}

export function useAgentProfile(ref: AgentRef | null, curveId?: bigint) {
    return useQuery(agentProfileQueryOptions(ref, curveId));
}
