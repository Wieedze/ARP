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
    // No curve in the key, and the reason is narrower than "there is no single curve this read
    // belongs to" — which is what this said, and which is false. `getToolUsage` reads
    // `total_assets` off the term (all curves) but `positionCount` off a vault scoped to
    // `config.curveId` (`tool-usage.ts:164`, consumed at `:201`), so half the read IS curve-scoped.
    // The key omits it because `fetchToolUsage` passes no curve and so every read here is the
    // default — a curve in the key would promise a narrowing no caller can currently request. **A
    // caller that did pass one would collide in this cache**, which is a reason to add the curve the
    // day that becomes possible, not a reason the curve does not exist.
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
