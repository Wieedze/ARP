import {parseAbiItem, type Address, type Hex} from "viem";

import {identityRegistryAbi} from "./abi.js";
import type {ArpClient} from "./client.js";
import {getAllModulesWithMetrics} from "./modules.js";
import type {
    Agent,
    AgentReputation,
    AgentWithReputation,
    FindTopAgentsOptions,
} from "./types.js";

const REGISTERED_EVENT = parseAbiItem(
    "event Registered(uint256 indexed agentId, string agentURI, address indexed to)",
);

const DEPOSITED_EVENT = parseAbiItem(
    "event Deposited(address indexed sender, address indexed receiver, bytes32 indexed termId, uint256 curveId, uint256 assets, uint256 assetsAfterFees, uint256 shares, uint256 totalShares, uint8 vaultType)",
);

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000".toLowerCase();

/**
 * Discover every agent ever registered on the ARP IdentityRegistry.
 *
 * The discovery is event-log based — the registry doesn't expose a
 * `tokensOfOwner` enumerator, and the `Registered` event carries the
 * operator address (`to`) which is useful metadata. Each agent's
 * current runtime wallet is read via `getAgentWallet(id)`.
 */
export async function getAgents(arp: ArpClient): Promise<Agent[]> {
    const {publicClient, deployment} = arp;
    const logs = await publicClient.getLogs({
        address: deployment.identityRegistry,
        event: REGISTERED_EVENT,
        fromBlock: 0n,
        toBlock: "latest",
    });

    const results = await Promise.all(
        logs.map(async (log) => {
            const agentId = log.args.agentId;
            if (agentId === undefined) return null;
            const runtimeWallet = await publicClient.readContract({
                address: deployment.identityRegistry,
                abi: identityRegistryAbi,
                functionName: "getAgentWallet",
                args: [agentId],
            });
            return {
                agentId,
                owner: log.args.to as Address,
                runtimeWallet: runtimeWallet as Address,
            };
        }),
    );
    return results.filter((a): a is Agent => a !== null);
}

/**
 * Like `getAgents` but drops agents whose runtime wallet has never been
 * bound. "Live" = ready to be hired / addressed by a consumer.
 */
export async function getLiveAgents(arp: ArpClient): Promise<Agent[]> {
    const all = await getAgents(arp);
    return all.filter((a) => a.runtimeWallet.toLowerCase() !== ZERO_ADDRESS);
}

/**
 * Aggregate the reputation footprint of one agent.
 *
 *   - One `getLogs(Deposited, receiver=runtime)` call. The indexed
 *     receiver filter keeps the response small.
 *   - Sums `assets` and groups by `termId` for the per-atom breakdown.
 *
 * If the agent has never staked, returns the zero shape:
 *   `{ totalStaked: 0n, distinctAtomCount: 0, atomStakes: [] }`.
 */
export async function getReputation(
    arp: ArpClient,
    runtimeWallet: Address,
): Promise<AgentReputation> {
    const {publicClient, deployment} = arp;
    const logs = await publicClient.getLogs({
        address: deployment.multiVault,
        event: DEPOSITED_EVENT,
        args: {receiver: runtimeWallet},
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
}

/**
 * Rank agents by reputation. By default returns the global top 20
 * agents sorted by their total tTRUST staked.
 *
 * When `opts.domain` is provided, the SDK derives the set of tool atoms
 * in that domain (from the marketplace), then filters each agent's
 * stakes to those atoms — yielding a domain-specific reputation. Use
 * this to answer "which agent has the strongest reputation in
 * solidity-audit?".
 */
export async function findTopAgents(
    arp: ArpClient,
    opts: FindTopAgentsOptions = {},
): Promise<AgentWithReputation[]> {
    const limit = opts.limit ?? 20;
    const minStake = opts.minStake ?? 1n;

    const agents = await getLiveAgents(arp);
    if (agents.length === 0) return [];

    // Pull every agent's reputation in parallel.
    const reputations = await Promise.all(
        agents.map((a) => getReputation(arp, a.runtimeWallet)),
    );

    if (!opts.domain) {
        return agents
            .map((agent, i) => ({...agent, reputation: reputations[i]}))
            .filter((a) => a.reputation.totalStaked >= minStake)
            .sort((a, b) =>
                b.reputation.totalStaked > a.reputation.totalStaked ? 1 : -1,
            )
            .slice(0, limit);
    }

    // Domain-scoped: derive the in-domain atomIds first, then narrow.
    const inDomain = await getAllModulesWithMetrics(arp);
    const allowedAtomIds = new Set(
        inDomain.filter((m) => m.domain === opts.domain).map((m) => m.atomId.toLowerCase()),
    );

    return agents
        .map((agent, i) => {
            const repInDomain: AgentReputation = {
                totalStaked: 0n,
                distinctAtomCount: 0,
                atomStakes: [],
            };
            for (const s of reputations[i].atomStakes) {
                if (allowedAtomIds.has(s.atomId.toLowerCase())) {
                    repInDomain.totalStaked += s.staked;
                    repInDomain.distinctAtomCount += 1;
                    repInDomain.atomStakes.push(s);
                }
            }
            return {...agent, reputation: repInDomain};
        })
        .filter((a) => a.reputation.totalStaked >= minStake)
        .sort((a, b) =>
            b.reputation.totalStaked > a.reputation.totalStaked ? 1 : -1,
        )
        .slice(0, limit);
}
