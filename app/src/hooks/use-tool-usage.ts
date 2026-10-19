import {useQuery} from "@tanstack/react-query";

import {fetchToolUsage} from "../services/erc8004-connector";
import {buildToolUsageView, type ToolUsageView} from "../services/tool-usage-view";

/**
 * A tool's incoming `uses` edges.
 *
 * Same shape as `use-agent-profile`: the lifecycle lives here, the work lives in the services, and
 * the query options are exported separately so the key, the guard and the mapping are unit-testable
 * without a DOM.
 */

export type ToolUsageFetcher = (
    toolAtomId: string,
) => Promise<Parameters<typeof buildToolUsageView>[0]>;

/** `0x` + 32 bytes. Anything else is a bad route param, not a tool nobody has used. */
export function isToolAtomId(value: string | undefined): value is string {
    return typeof value === "string" && /^0x[0-9a-fA-F]{64}$/.test(value);
}

export function toolUsageQueryKey(toolAtomId: string | null) {
    // No curve in the key, unlike the agent profile's. `getToolUsage` reads `total_assets` off the
    // term, which is the all-curve aggregate, so there is no single curve this read belongs to.
    return ["erc8004", "tool-usage", toolAtomId] as const;
}

export function toolUsageQueryOptions(
    toolAtomId: string | null,
    fetchUsage: ToolUsageFetcher = fetchToolUsage,
) {
    return {
        queryKey: toolUsageQueryKey(toolAtomId),
        queryFn: async (): Promise<ToolUsageView> => {
            if (toolAtomId === null) {
                throw new Error("No tool atom to resolve.");
            }
            return buildToolUsageView(await fetchUsage(toolAtomId));
        },
        enabled: toolAtomId !== null,
        // One graph round trip, and the edges change when somebody stakes — which is rare enough
        // that a minute of staleness is cheaper than re-asking the indexer on every remount.
        staleTime: 60_000,
        retry: 0,
    };
}

export function useToolUsage(toolAtomId: string | null) {
    return useQuery(toolUsageQueryOptions(toolAtomId));
}
