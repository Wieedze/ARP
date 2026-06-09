import {useQuery} from "@tanstack/react-query";
import {type Address, type Hex} from "viem";
import {
    getReputation as sdkGetReputation,
    findTopAgents as sdkFindTopAgents,
    type Agent,
    type AgentReputation,
    type AgentWithReputation,
    type FindTopAgentsOptions,
} from "@arp-protocol/sdk";

import {arpClient} from "../lib/arp-sdk";

export type {AgentReputation, AgentWithReputation};

/**
 * Reputation footprint for one agent — read via the SDK's `getReputation`.
 * Thin react-query wrapper for the React surface.
 */
export function useAgentReputation(agent: Agent | null | undefined) {
    return useQuery({
        queryKey: [
            "arp.agentReputation",
            agent?.runtimeWallet.toLowerCase() ?? "",
        ],
        queryFn: async () => {
            if (!agent) {
                const empty: AgentReputation = {
                    totalStaked: 0n,
                    distinctAtomCount: 0,
                    atomStakes: [],
                };
                return empty;
            }
            return sdkGetReputation(arpClient, agent.runtimeWallet);
        },
        enabled: Boolean(agent),
        staleTime: 15_000,
        refetchInterval: 30_000,
    });
}

/**
 * Batched reputation read for a list of agents — used by the hire page
 * to rank agents by their footprint.
 *
 * Dogfoods the SDK's `findTopAgents` with a high limit so we get every
 * agent back (the hire page does its own filtering/sort if needed).
 */
export function useAgentsWithReputation(
    agents: Agent[] | undefined,
    opts: FindTopAgentsOptions = {},
) {
    return useQuery({
        queryKey: [
            "arp.agentsWithReputation",
            agents?.map((a) => a.runtimeWallet.toLowerCase()).join(","),
            opts.domain ?? "",
            opts.minStake?.toString() ?? "",
            opts.limit?.toString() ?? "",
        ],
        queryFn: async (): Promise<AgentWithReputation[]> => {
            if (!agents) return [];
            // The SDK's findTopAgents independently discovers + ranks. For
            // the marketplace page we want the SAME set the caller passed
            // in (the explicit Agent[] order). Pull reputation per-agent
            // in parallel via the SDK's read primitive.
            const reps = await Promise.all(
                agents.map((a) => sdkGetReputation(arpClient, a.runtimeWallet)),
            );
            return agents.map((agent, i) => ({...agent, reputation: reps[i]}));
        },
        enabled: Boolean(agents),
        staleTime: 15_000,
        refetchInterval: 30_000,
    });
}

/**
 * Rank-and-filter agents via the SDK — domain-scoped if `domain` is
 * given. Useful surface for a "find me a specialist" UI.
 */
export function useTopAgents(opts: FindTopAgentsOptions = {}) {
    return useQuery({
        queryKey: [
            "arp.topAgents",
            opts.domain ?? "",
            opts.minStake?.toString() ?? "",
            opts.limit?.toString() ?? "",
        ],
        queryFn: () => sdkFindTopAgents(arpClient, opts),
        staleTime: 15_000,
        refetchInterval: 30_000,
    });
}

/**
 * Helper — given an agent's reputation and the set of modules (with
 * their tool atomIds), derive which domains the agent has staked in.
 * Pure JS, no chain access.
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
 * Format-ready compact "0.005" string from a wei bigint.
 */
export function formatCompactTrust(wei: bigint): string {
    if (wei === 0n) return "0";
    return (Number(wei / 10n ** 10n) / 1e8).toString();
}

// Re-export the SDK's Address type since callers were importing it from
// this module before — keeps the import surface stable.
export type {Address};
