import type {
    AgentIdentity,
    AgentPage,
    Capabilities,
    ClaimMarket,
    ProviderClaim,
    ResolvedAgentRef,
    ResolvedListAgentsOptions,
} from "../types.js";

/**
 * One place trust data can come from.
 *
 * Intuition is *a* source, never *the* source. The interface exists so that
 * stays true: every method is keyed by the ERC-8004 identity, no method
 * mentions a graph node, and a client configured without Intuition is a
 * supported configuration rather than a degraded one.
 *
 * `getMarkets` is optional on purpose. A registry read can tell you an agent
 * exists and what it declares; only a staking graph can tell you who has
 * capital behind a claim. A source without that capability says so by not
 * implementing the method, rather than returning an empty array and letting a
 * consumer read "nobody is backing this" into "we cannot see backing".
 *
 * `listAgents` is optional for the same reason and a second one. An ERC-8004
 * registry has no enumeration — you can read token 2340 but you cannot ask it
 * for its population — so a registry source genuinely cannot answer, and an
 * empty page from it would read as "there are no agents". It is also the only
 * method here not keyed by an identity, because a listing is how a caller finds
 * one in the first place.
 */
export type TrustSource = {
    readonly id: string;
    resolveAgent(ref: ResolvedAgentRef): Promise<AgentIdentity | null>;
    getAssessments(ref: ResolvedAgentRef): Promise<ProviderClaim[]>;
    getCapabilities(ref: ResolvedAgentRef): Promise<Capabilities>;
    getMarkets?(ref: ResolvedAgentRef): Promise<ClaimMarket[]>;
    /**
     * One page of the source's agent population. Ordered and paged at the
     * source — a caller must not re-rank across pages, because the order is a
     * property of the whole cohort and a page is a window onto it.
     */
    listAgents?(options: ResolvedListAgentsOptions): Promise<AgentPage>;
};
