import {stringToHex, type Hex} from "viem";

import {moduleRegistryAbi, multiVaultAbi} from "./abi.js";
import type {ArpClient} from "./client.js";
import type {Module, ModuleWithMetrics} from "./types.js";

/**
 * Fetch every registered module in `[1, totalModules]`. Issues a single
 * `totalModules()` call then `N` parallel `getModule(i)` reads. For
 * MVP-scale registries (O(10)–O(100) modules) this is plenty efficient.
 */
export async function getAllModules(arp: ArpClient): Promise<Module[]> {
    const {publicClient, deployment} = arp;
    const total = await publicClient.readContract({
        address: deployment.moduleRegistry,
        abi: moduleRegistryAbi,
        functionName: "totalModules",
    });
    const n = Number(total);
    if (n === 0) return [];
    const ids = Array.from({length: n}, (_, i) => BigInt(i + 1));
    const results = await Promise.all(
        ids.map((id) =>
            publicClient.readContract({
                address: deployment.moduleRegistry,
                abi: moduleRegistryAbi,
                functionName: "getModule",
                args: [id],
            }),
        ),
    );
    return results.map((m) => ({
        id: m.id,
        name: m.name,
        domain: m.domain,
        schemaURI: m.schemaURI,
        description: m.description,
        creator: m.creator,
        createdAt: m.createdAt,
    }));
}

/**
 * Return the modules whose `domain` matches. Reads through the
 * `getModulesByDomain(domain) returns uint256[]` indexer on the
 * registry — the contract maintains the per-domain list at write time,
 * so this is a single call regardless of the registry's overall size.
 */
export async function getModulesByDomain(
    arp: ArpClient,
    domain: string,
): Promise<Module[]> {
    const {publicClient, deployment} = arp;
    const ids = await publicClient.readContract({
        address: deployment.moduleRegistry,
        abi: moduleRegistryAbi,
        functionName: "getModulesByDomain",
        args: [domain],
    });
    if (ids.length === 0) return [];
    const results = await Promise.all(
        ids.map((id) =>
            publicClient.readContract({
                address: deployment.moduleRegistry,
                abi: moduleRegistryAbi,
                functionName: "getModule",
                args: [id],
            }),
        ),
    );
    return results.map((m) => ({
        id: m.id,
        name: m.name,
        domain: m.domain,
        schemaURI: m.schemaURI,
        description: m.description,
        creator: m.creator,
        createdAt: m.createdAt,
    }));
}

/**
 * Look up a single module by its canonical IPFS `schemaURI`. Returns
 * `null` if no module has been registered for that URI. Useful for
 * tools that want to check "does ARP already know about my schema?".
 */
export async function findModuleBySchemaURI(
    arp: ArpClient,
    schemaURI: string,
): Promise<Module | null> {
    const {publicClient, deployment} = arp;
    const id = await publicClient.readContract({
        address: deployment.moduleRegistry,
        abi: moduleRegistryAbi,
        functionName: "getModuleIdBySchemaURI",
        args: [schemaURI],
    });
    if (id === 0n) return null;
    const m = await publicClient.readContract({
        address: deployment.moduleRegistry,
        abi: moduleRegistryAbi,
        functionName: "getModule",
        args: [id],
    });
    return {
        id: m.id,
        name: m.name,
        domain: m.domain,
        schemaURI: m.schemaURI,
        description: m.description,
        creator: m.creator,
        createdAt: m.createdAt,
    };
}

/**
 * Enrich every module with its tool atom id + vault metrics (TVL +
 * distinct stakers). For N modules, issues:
 *
 *   - 1 `getBondingCurveConfig()` call
 *   - N `calculateAtomId(stringToHex(schemaURI))` calls (parallel)
 *   - N `getVault(atomId, curveId)` calls (parallel)
 *   - 1 `getLogs(Deposited)` over the whole MultiVault, bucketed by
 *     termId client-side
 *
 * The event scan is one RPC call regardless of N, so this scales nicely
 * for marketplaces with many modules.
 */
export async function getAllModulesWithMetrics(
    arp: ArpClient,
): Promise<ModuleWithMetrics[]> {
    const modules = await getAllModules(arp);
    if (modules.length === 0) return [];
    return enrichModulesWithMetrics(arp, modules);
}

/**
 * Same as `getAllModulesWithMetrics` but scoped to a domain. Cheaper
 * than fetching everything when the consumer only cares about one
 * vertical.
 */
export async function getModulesByDomainWithMetrics(
    arp: ArpClient,
    domain: string,
): Promise<ModuleWithMetrics[]> {
    const modules = await getModulesByDomain(arp, domain);
    if (modules.length === 0) return [];
    return enrichModulesWithMetrics(arp, modules);
}

async function enrichModulesWithMetrics(
    arp: ArpClient,
    modules: Module[],
): Promise<ModuleWithMetrics[]> {
    const {publicClient, deployment} = arp;
    const curveConfig = await publicClient.readContract({
        address: deployment.multiVault,
        abi: multiVaultAbi,
        functionName: "getBondingCurveConfig",
    });
    const curveId = curveConfig.defaultCurveId;

    const atomIds = await Promise.all(
        modules.map((m) =>
            publicClient.readContract({
                address: deployment.multiVault,
                abi: multiVaultAbi,
                functionName: "calculateAtomId",
                args: [stringToHex(m.schemaURI)],
            }),
        ),
    );

    const vaults = await Promise.all(
        atomIds.map((atomId) =>
            publicClient.readContract({
                address: deployment.multiVault,
                abi: multiVaultAbi,
                functionName: "getVault",
                args: [atomId, curveId],
            }),
        ),
    );

    // One getLogs over Deposited, bucketed by termId client-side.
    const depositedEvent = multiVaultAbi.find(
        (e) => e.type === "event" && e.name === "Deposited",
    );
    if (!depositedEvent) {
        throw new Error("Deposited event missing from multiVaultAbi");
    }
    const logs = await publicClient.getLogs({
        address: deployment.multiVault,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        event: depositedEvent as any,
        fromBlock: 0n,
        toBlock: "latest",
    });
    const stakersByAtom = new Map<Hex, Set<string>>();
    for (const log of logs) {
        // viem types getLogs args generically; narrow per event.
        const args = (log as unknown as {args: {termId: Hex; receiver: string}})
            .args;
        if (!args?.termId || !args?.receiver) continue;
        let set = stakersByAtom.get(args.termId);
        if (!set) {
            set = new Set<string>();
            stakersByAtom.set(args.termId, set);
        }
        set.add(args.receiver.toLowerCase());
    }

    return modules.map((m, i) => {
        const atomId = atomIds[i];
        const [totalAssets] = vaults[i];
        const stakerCount = stakersByAtom.get(atomId)?.size ?? 0;
        return {
            ...m,
            atomId,
            totalStaked: totalAssets,
            stakerCount,
        };
    });
}
