import type {Address, Hex} from "viem";

/**
 * A registered ARP module — the tool catalog entry. Mirrors the
 * `Module` struct on `ModuleRegistry`.
 */
export type Module = {
    id: bigint;
    name: string;
    domain: string;
    schemaURI: string;
    description: string;
    creator: Address;
    createdAt: bigint;
};

/**
 * A module annotated with reputation metrics aggregated from the
 * Intuition vault for its tool atom.
 */
export type ModuleWithMetrics = Module & {
    atomId: Hex;
    /** Cumulative tTRUST staked on the atom's vault (wei). */
    totalStaked: bigint;
    /** Distinct receivers that have ever deposited on this atom. */
    stakerCount: number;
};

/**
 * An ARP agent discovered via the ERC-8004 IdentityRegistry.
 *
 *   - `agentId`         The NFT id.
 *   - `owner`           The address that minted the NFT (== operator).
 *   - `runtimeWallet`   The runtime wallet currently bound to the NFT
 *                       via `setAgentWallet`. Zero address if never
 *                       designated.
 */
export type Agent = {
    agentId: bigint;
    owner: Address;
    runtimeWallet: Address;
};

/**
 * Reputation profile for one agent — derived from Deposited events on
 * MultiVault, filtered by `receiver = agent.runtimeWallet`.
 *
 *   - `totalStaked`         Sum of `assets` across every deposit.
 *   - `distinctAtomCount`   Distinct atoms the agent has positioned on.
 *   - `atomStakes`          Per-atom contribution, sorted by amount desc.
 */
export type AgentReputation = {
    totalStaked: bigint;
    distinctAtomCount: number;
    atomStakes: {atomId: Hex; staked: bigint}[];
};

/**
 * An agent paired with its current reputation footprint.
 */
export type AgentWithReputation = Agent & {reputation: AgentReputation};

/**
 * Options accepted by `findTopAgents` — filter + sort + limit.
 */
export type FindTopAgentsOptions = {
    /** Filter to a domain (matches agents that staked on at least one
     *  module in that domain). Omit for global ranking. */
    domain?: string;
    /** Drop agents whose total staked is below this floor (wei).
     *  Default: 1 wei (any positive stake). */
    minStake?: bigint;
    /** Truncate to this many results after sorting. Default: 20. */
    limit?: number;
};
