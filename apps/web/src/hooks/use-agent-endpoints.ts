import {useQuery} from "@tanstack/react-query";

import {readAgentEndpoints, type EndpointRead} from "../services/agent-endpoints";

/**
 * What an agent published as its way in.
 *
 * Keyed on the registration file rather than the agent, because the document is the thing being
 * read and two agents could in principle publish the same one.
 *
 * `staleTime` is long: a registration document changes only when its owner calls `setAgentURI`, and
 * the URI is on chain.
 */
export function agentEndpointsQueryKey(registrationFile: string | null) {
    return ["agent-endpoints", registrationFile ?? "none"] as const;
}

export function agentEndpointsQueryOptions(
    registrationFile: string | null,
    read: typeof readAgentEndpoints = readAgentEndpoints,
) {
    return {
        queryKey: agentEndpointsQueryKey(registrationFile),
        queryFn: async (): Promise<EndpointRead> => read(registrationFile),
        staleTime: 600_000,
        // One retry only. A CORS refusal is permanent and retrying it three times is three
        // guaranteed failures against someone else's host.
        retry: 1,
    };
}

export function useAgentEndpoints(registrationFile: string | null) {
    return useQuery(agentEndpointsQueryOptions(registrationFile));
}
