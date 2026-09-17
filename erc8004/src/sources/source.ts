import type {
    AgentIdentity,
    Capabilities,
    ClaimMarket,
    ProviderClaim,
    ResolvedAgentRef,
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
 */
export type TrustSource = {
    readonly id: string;
    resolveAgent(ref: ResolvedAgentRef): Promise<AgentIdentity | null>;
    getAssessments(ref: ResolvedAgentRef): Promise<ProviderClaim[]>;
    getCapabilities(ref: ResolvedAgentRef): Promise<Capabilities>;
    getMarkets?(ref: ResolvedAgentRef): Promise<ClaimMarket[]>;
};
