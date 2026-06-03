import {useQuery} from "@tanstack/react-query";
import {parseAbiItem, type Hex} from "viem";

import {publicClient} from "../lib/clients";
import {deployments} from "../lib/deployments";
import {type Agent} from "./use-agents";

const MULTI_VAULT = deployments.intuition.multiVault;

const DEPOSITED_EVENT = parseAbiItem(
    "event Deposited(address indexed sender, address indexed receiver, bytes32 indexed termId, uint256 curveId, uint256 assets, uint256 assetsAfterFees, uint256 shares, uint256 totalShares, uint8 vaultType)",
);

/**
 * Aggregated reputation footprint for a single agent.
 *
 *   - `totalStaked`       Sum of `assets` across every Deposit by the
 *                         agent's runtime wallet, across every atom.
 *                         The agent's economic conviction footprint.
 *   - `distinctAtomCount` How many distinct tool atoms the agent has
 *                         positioned itself on. Specialization breadth.
 *   - `atomStakes`        Per-atom contribution. Sorted by amount desc
 *                         so the agent's "top tools" are first.
 */
export type AgentReputation = {
    totalStaked: bigint;
    distinctAtomCount: number;
    atomStakes: {atomId: Hex; staked: bigint}[];
};

/**
 * Read every Deposited event filtered by `receiver = agent.runtimeWallet`,
 * then aggregate per-atom in JS. One RPC call regardless of how many
 * atoms the agent has touched — the indexed `receiver` lets us hit a
 * compact subset of the event log.
 *
 * `null` while loading. Empty reputation `(0, 0, [])` is returned for
 * an agent that has never deposited.
 */
export function useAgentReputation(agent: Agent | null | undefined) {
    return useQuery({
        queryKey: [
            "arp.agentReputation",
            agent?.runtimeWallet.toLowerCase() ?? "",
        ],
        queryFn: async (): Promise<AgentReputation> => {
            if (!agent) {
                return {totalStaked: 0n, distinctAtomCount: 0, atomStakes: []};
            }
            const logs = await publicClient.getLogs({
                address: MULTI_VAULT,
                event: DEPOSITED_EVENT,
                args: {receiver: agent.runtimeWallet},
                fromBlock: 0n,
                toBlock: "latest",
            });
            const perAtom = new Map<Hex, bigint>();
            let total = 0n;
            for (const log of logs) {
                const term = log.args.termId;
                const assets = log.args.assets;
                if (term === undefined || assets === undefined) continue;
                perAtom.set(term, (perAtom.get(term) ?? 0n) + assets);
                total += assets;
            }
            const atomStakes = Array.from(perAtom.entries())
                .map(([atomId, staked]) => ({atomId, staked}))
                .sort((a, b) => (b.staked > a.staked ? 1 : -1));
            return {
                totalStaked: total,
                distinctAtomCount: perAtom.size,
                atomStakes,
            };
        },
        enabled: Boolean(agent),
        staleTime: 15_000,
        refetchInterval: 30_000,
    });
}

/**
 * Batched reputation read for a list of agents — used by the hire page
 * to rank agents by their footprint. One getLogs call per agent (since
 * the indexed filter is per-receiver), aggregated client-side.
 */
export function useAgentsWithReputation(agents: Agent[] | undefined) {
    return useQuery({
        queryKey: [
            "arp.agentsWithReputation",
            agents?.map((a) => a.runtimeWallet.toLowerCase()).join(","),
        ],
        queryFn: async (): Promise<
            Array<Agent & {reputation: AgentReputation}>
        > => {
            if (!agents) return [];
            return Promise.all(
                agents.map(async (agent) => {
                    const logs = await publicClient.getLogs({
                        address: MULTI_VAULT,
                        event: DEPOSITED_EVENT,
                        args: {receiver: agent.runtimeWallet},
                        fromBlock: 0n,
                        toBlock: "latest",
                    });
                    const perAtom = new Map<Hex, bigint>();
                    let total = 0n;
                    for (const log of logs) {
                        const term = log.args.termId;
                        const assets = log.args.assets;
                        if (term === undefined || assets === undefined) continue;
                        perAtom.set(term, (perAtom.get(term) ?? 0n) + assets);
                        total += assets;
                    }
                    const atomStakes = Array.from(perAtom.entries())
                        .map(([atomId, staked]) => ({atomId, staked}))
                        .sort((a, b) => (b.staked > a.staked ? 1 : -1));
                    return {
                        ...agent,
                        reputation: {
                            totalStaked: total,
                            distinctAtomCount: perAtom.size,
                            atomStakes,
                        },
                    };
                }),
            );
        },
        enabled: Boolean(agents),
        staleTime: 15_000,
        refetchInterval: 30_000,
    });
}

/**
 * Helper — given an agent's reputation and the set of modules (with
 * their tool atomIds), derive which domains the agent has staked in
 * and how heavily. Used to surface "this agent specializes in X" in
 * the marketplace.
 */
export function deriveAgentDomains(
    reputation: AgentReputation,
    modules: Array<{schemaURI: string; domain: string; atomId?: Hex}>,
): Array<{domain: string; totalStaked: bigint; toolCount: number}> {
    const byAtom = new Map(
        reputation.atomStakes.map((s) => [s.atomId.toLowerCase(), s.staked]),
    );
    const accum = new Map<string, {totalStaked: bigint; toolCount: number}>();
    for (const m of modules) {
        if (!m.atomId) continue;
        const stake = byAtom.get(m.atomId.toLowerCase());
        if (!stake) continue;
        const prev = accum.get(m.domain) ?? {totalStaked: 0n, toolCount: 0};
        accum.set(m.domain, {
            totalStaked: prev.totalStaked + stake,
            toolCount: prev.toolCount + 1,
        });
    }
    return Array.from(accum.entries())
        .map(([domain, v]) => ({domain, ...v}))
        .sort((a, b) => (b.totalStaked > a.totalStaked ? 1 : -1));
}

/**
 * Format-ready compact "0.005" string from a wei bigint, trimming
 * trailing zeros from `formatEther`.
 */
export function formatCompactTrust(wei: bigint): string {
    if (wei === 0n) return "0";
    const s = (Number(wei / 10n ** 10n) / 1e8).toString();
    return s;
}
