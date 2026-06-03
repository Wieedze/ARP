import {useMemo} from "react";
import {useReadContract, useReadContracts} from "wagmi";

import {moduleRegistryAbi, type Module} from "../lib/abi/module-registry";
import {deployments} from "../lib/deployments";

const ADDRESS = deployments.arp.moduleRegistry;

/** Read `ModuleRegistry.totalModules()`. */
export function useTotalModules() {
    return useReadContract({
        address: ADDRESS,
        abi: moduleRegistryAbi,
        functionName: "totalModules",
    });
}

/**
 * Fetch every registered module by id in `[1, totalModules]`. Batched via
 * `useReadContracts` so RPC sees a single multicall, then mapped into a
 * typed `Module[]`. Returns an empty array while loading.
 *
 * The MVP scope assumes O(10) modules; if the registry grows to thousands,
 * the right pattern is a Subgraph (out of MVP scope per
 * `docs/00_HACKATHON_PIVOT.md`'s out-of-scope list).
 */
export function useAllModules() {
    const total = useTotalModules();
    const count = total.data ? Number(total.data) : 0;

    const ids = useMemo(() => Array.from({length: count}, (_, i) => BigInt(i + 1)), [count]);

    const contracts = useReadContracts({
        contracts: ids.map((id) => ({
            address: ADDRESS,
            abi: moduleRegistryAbi,
            functionName: "getModule" as const,
            args: [id] as const,
        })),
        query: {enabled: count > 0},
    });

    const modules: Module[] = useMemo(() => {
        if (!contracts.data) return [];
        return contracts.data
            .map((entry) => (entry.status === "success" ? (entry.result as Module) : null))
            .filter((m): m is Module => m !== null);
    }, [contracts.data]);

    return {
        modules,
        isLoading: total.isLoading || contracts.isLoading,
        error: total.error ?? contracts.error,
        refetch: () => {
            total.refetch();
            contracts.refetch();
        },
    };
}

/**
 * Compute the deduplicated set of domains seen across all modules. Used by
 * the filter UI to render chips. Memoized.
 */
export function useDomains(modules: Module[]): string[] {
    return useMemo(() => {
        const seen = new Set<string>();
        for (const m of modules) seen.add(m.domain);
        return Array.from(seen).sort();
    }, [modules]);
}

/**
 * Read a single module by id. Returns `undefined` while loading, `null`
 * if the id doesn't exist on chain (the contract reverts with
 * `ModuleNotFound`), or the typed `Module` on success.
 */
export function useModule(id: bigint | null) {
    return useReadContract({
        address: ADDRESS,
        abi: moduleRegistryAbi,
        functionName: "getModule",
        args: id !== null ? [id] : undefined,
        query: {enabled: id !== null},
    });
}
