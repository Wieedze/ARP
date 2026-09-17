import type {Address, Hex} from "viem";

/**
 * The primary key of this package: an ERC-8004 identity. Never an
 * Intuition atom, never a source-specific handle. Every public function
 * is addressed by one of these.
 *
 * `registry` defaults to `DEFAULT_IDENTITY_REGISTRY` when omitted.
 */
export type AgentRef = {
    chainId: number;
    tokenId: string;
    registry?: Address;
};

/** An `AgentRef` with every field resolved. What sources actually receive. */
export type ResolvedAgentRef = {
    chainId: number;
    tokenId: string;
    registry: Address;
};

/**
 * Which source produced a value, and whether the value was asserted by
 * someone or derived by this package.
 *
 *   - `claim`     — a third party published it; we relayed it unchanged.
 *   - `derived`   — this package computed it from claims (a hash, a verdict, a sum).
 *   - `heuristic` — this package guessed it. Always the weakest grade; say why in `note`.
 */
export type Provenance = {
    sourceId: string;
    kind: "claim" | "derived" | "heuristic";
    /** Where the value physically came from — a graph handle, a URL, a contract read. */
    origin: string | null;
    note?: string;
};

/**
 * Metadata an agent (or an indexer standing in for one) declares about itself.
 *
 * `isFallback` marks metadata the indexer synthesized because the agent
 * declared none — a `name` of `Agent 8453:6649` is not a name the agent chose.
 * It is a heuristic; see `FALLBACK_NAME_PATTERN`.
 */
export type AgentMetadata = {
    name: string | null;
    description: string | null;
    image: string | null;
    url: string | null;
    isFallback: boolean;
};

/**
 * An agent as one source sees it.
 *
 * `sourceHandle` is an opaque, source-scoped identifier — meaningless outside
 * `provenance.sourceId`. Do not parse it, do not compare handles across sources.
 */
export type AgentIdentity = {
    chainId: number;
    tokenId: string;
    registry: Address;
    /** `eip155:{chainId}/erc721:{registry}/{tokenId}` — the cross-source join key. */
    caip19: string;
    sourceHandle: string | null;
    /** ERC-8004 registration file URI, when the source can produce one. Not parsed here. */
    registrationFile: string | null;
    owner: Address | null;
    metadata: AgentMetadata;
    provenance: Provenance;
};

/** Which edge of the trust pattern a claim came from. */
export type ClaimRelation = "has-trust-provider" | "has-trust-assessment";

/** A trust provider, as declared in whatever source carried the claim. */
export type TrustProvider = {
    name: string | null;
    description: string | null;
    image: string | null;
    url: string | null;
    sourceHandle: string | null;
};

/**
 * One provider's claim about one agent.
 *
 * `resolverUrl` is the live document. It is read from the parsed metadata of the
 * claim object, never from the pinned immutable URI — those are different things
 * and confusing them serves a snapshot as if it were current. `pinnedUri` carries
 * the immutable URI separately so a consumer can see both.
 */
export type ProviderClaim = {
    relation: ClaimRelation;
    label: string | null;
    provider: TrustProvider;
    resolverUrl: string | null;
    pinnedUri: string | null;
    sourceHandle: string | null;
    provenance: Provenance;
};

/** One side of a claim's market. All amounts are raw on-chain integers. */
export type MarketSide = {
    totalMarketCap: bigint | null;
    totalAssets: bigint | null;
    marketCap: bigint | null;
    totalShares: bigint | null;
    currentSharePrice: bigint | null;
    positionCount: number | null;
};

/**
 * The live market on one claim: who is backing it, and who is taking the
 * other side. Only a source with a staking layer can produce these.
 */
export type ClaimMarket = {
    /** Ties back to `ProviderClaim.sourceHandle` within the same `sourceId`. */
    claimHandle: string;
    relation: ClaimRelation;
    label: string | null;
    support: MarketSide;
    opposition: MarketSide;
    provenance: Provenance;
};

/** How a capability edge relates the agent to the thing on the other end. */
export type CapabilityRelation =
    | "has-type"
    | "implements"
    | "uses"
    | "compatible-with"
    | "available-on"
    | "has-tag"
    | "has-category";

export type CapabilityRef = {
    relation: CapabilityRelation;
    label: string | null;
    name: string | null;
    url: string | null;
    sourceHandle: string | null;
};

/**
 * What an agent declares it can do, grouped by the kind of the declaration.
 *
 * Every entry is a claim relayed from a source. Nothing here is inferred from a
 * registration file — that is a later phase, and inference would need its own
 * provenance grade to stay honest.
 */
export type Capabilities = {
    types: CapabilityRef[];
    protocols: CapabilityRef[];
    chains: CapabilityRef[];
    tags: CapabilityRef[];
    categories: CapabilityRef[];
    provenance: Provenance;
};

/** A field two sources answered differently. Both answers are kept. */
export type ProfileConflict = {
    field: string;
    entries: {sourceId: string; value: string | null}[];
    note: string;
};

/** A source that failed during a merged read. The profile is still returned. */
export type SourceError = {
    sourceId: string;
    step: "resolveAgent" | "getAssessments" | "getCapabilities" | "getMarkets" | "listAgents";
    message: string;
};

/**
 * How a cohort listing is ordered.
 *
 * Both orders rank by something that cost its author money or effort. There is
 * no order by score, and adding one would contradict the rest of this package:
 * a provider's number is the claim being qualified here, not the ranking key.
 */
export type AgentListOrder = "evidence-quantity" | "economic-conviction";

/**
 * The market on an agent's *own* atom — not on any claim about it.
 *
 * Both figures are read at the same scope, summed across every bonding curve,
 * because a market cap from all curves beside a position count from one reads
 * as a contradiction and is one. The consequence is that `positionCount` here
 * is a count of positions, not of distinct stakers: an account staked on two
 * curves is counted twice. `MarketSide.positionCount`, which is scoped to a
 * single vault, is the one that equals the distinct-staker count.
 */
export type AgentAtomMarket = {
    totalMarketCap: bigint | null;
    positionCount: number | null;
    /** How many curve vaults exist on the atom. `positionCount` sums across all of them. */
    vaultCount: number | null;
};

/**
 * One agent as it appears in a cohort listing.
 *
 * Deliberately thinner than `AgentIdentity`: a listing row is a way into a
 * profile, not a substitute for one. Nothing here is checked — the metadata is
 * whatever the indexer holds and the market is whatever the graph prices.
 */
export type AgentListing = {
    /** Source-scoped handle for the agent — an Intuition atom term id. Do not parse it. */
    sourceHandle: string;
    /**
     * The ERC-8004 identity, when the source could establish exactly one.
     *
     * `null` when the agent declares none this package understands, or when it
     * declares several — see `isIdentityAmbiguous`. It is read from the `same as`
     * edge and never parsed out of a display label.
     */
    ref: ResolvedAgentRef | null;
    /** Every ERC-8004 identity found among the `same as` edges that were read. */
    identities: ResolvedAgentRef[];
    /** How many `same as` edges the agent carries in total, ERC-8004 or not. */
    identityEdgeCount: number | null;
    /**
     * True when the agent claims more than one ERC-8004 identity, or carries more
     * `same as` edges than were read so a second identity may be hiding behind
     * them. Either way there is no single agent to link to, and saying so beats
     * picking one.
     */
    isIdentityAmbiguous: boolean;
    metadata: AgentMetadata;
    /** How many statements the source holds about this agent. The evidence-quantity sort key. */
    statementCount: number | null;
    market: AgentAtomMarket | null;
    provenance: Provenance;
};

/** One page of a cohort listing. Paged at the source; never re-ranked here. */
export type AgentPage = {
    /** Which source produced this page. Pages from different sources are not comparable. */
    sourceId: string;
    order: AgentListOrder;
    limit: number;
    offset: number;
    /** The whole cohort's size, from the source's own aggregate — not `agents.length`. */
    total: number | null;
    agents: AgentListing[];
};

/** What a caller asks a listing for. Every field has a default. */
export type ListAgentsOptions = {
    order?: AgentListOrder;
    limit?: number;
    offset?: number;
};

/** `ListAgentsOptions` with every field filled in. What sources actually receive. */
export type ResolvedListAgentsOptions = {
    order: AgentListOrder;
    limit: number;
    offset: number;
};

export type AssessmentEvidence = {
    type: string | null;
    url: string | null;
    sha256: string | null;
};

export type AssessmentFreshnessWindow = {
    validUntil: string | null;
    refreshIntervalSeconds: number | null;
};

/** The EIP-712 signature block a provider attaches to an assessment document. */
export type AssessmentSignature = {
    alg: string | null;
    signer: Address | null;
    value: Hex | null;
    eip712: {
        domain: Record<string, unknown>;
        types: Record<string, {name: string; type: string}[]>;
        primaryType: string;
    } | null;
    payload: {
        canonicalization: string | null;
        hash: string | null;
        excludes: string[];
    } | null;
};

/**
 * A provider's assessment document, narrowed from untrusted JSON.
 *
 * `raw` is the document exactly as parsed — signature verification must
 * canonicalise the original bytes, not this normalised view.
 */
export type AssessmentDocument = {
    agent: {chainId: number | null; tokenId: string | null; registry: string | null} | null;
    provider: {id: string | null; name: string | null; url: string | null} | null;
    score: number | null;
    scoreScale: string | null;
    riskLevel: string | null;
    lastUpdated: string | null;
    dimensions: Record<string, number> | null;
    evidence: AssessmentEvidence[];
    freshness: AssessmentFreshnessWindow | null;
    signature: AssessmentSignature | null;
    raw: unknown;
};

export type AssessmentFetchError =
    | {kind: "no-resolver-url"}
    | {kind: "skipped"}
    | {kind: "network"; message: string}
    | {kind: "timeout"; timeoutMs: number}
    | {kind: "http"; status: number; statusText: string}
    | {kind: "not-json"; contentType: string | null; excerpt: string}
    | {kind: "malformed"; message: string};

/** The outcome of following a claim's resolver URL. Never throws. */
export type AssessmentFetch =
    | {status: "ok"; url: string; httpStatus: number; document: AssessmentDocument}
    | {status: "error"; url: string | null; error: AssessmentFetchError};

/** One reconstruction this package tried, and what it recovered. */
export type SignatureAttempt = {
    strategyId: string;
    /**
     * Whether this strategy had been confirmed against *this document's*
     * provider. Confirmation is per-provider, never universal, and only a
     * confirmed-for-this-provider attempt can produce a `mismatch`.
     */
    confirmedForProvider: boolean;
    /** Null when the strategy could not build a payload at all. */
    recovered: Address | null;
    /** Present when the attempt failed rather than simply not matching. */
    error?: string;
};

/**
 * The honest answer to "does this signature recover to the address the
 * document claims signed it?".
 *
 *   - `verified`   — it does. Recovery matched the declared signer exactly.
 *                    Available to any provider, confirmed or not: vouching for
 *                    a correct signature costs nobody anything.
 *   - `mismatch`   — a reconstruction confirmed against *this provider's own*
 *                    live documents applied cleanly and recovered a *different*
 *                    address. A red flag, and reachable only for a provider
 *                    whose signing scheme has actually been established.
 *   - `unverified` — could not evaluate: no signature, an unsupported algorithm,
 *                    or no strategy confirmed for this provider. Being unable to
 *                    check a stranger is the correct answer about a stranger;
 *                    accusing them is not.
 */
export type SignatureVerdict =
    | {
          status: "verified";
          declaredSigner: Address;
          recovered: Address;
          strategyId: string;
          contentHash: Hex;
      }
    | {
          status: "mismatch";
          declaredSigner: Address;
          recovered: Address;
          strategyId: string;
          contentHash: Hex;
          attempts: SignatureAttempt[];
      }
    | {
          status: "unverified";
          reason: string;
          declaredSigner: Address | null;
          attempts: SignatureAttempt[];
      };

/**
 * Whether a document is still inside the validity window its own publisher
 * declared. A stale document is never silently served as current.
 */
export type FreshnessVerdict =
    | {
          status: "fresh";
          validUntil: string;
          lastUpdated: string | null;
          ageSeconds: number | null;
          secondsRemaining: number;
      }
    | {
          status: "stale";
          validUntil: string;
          lastUpdated: string | null;
          ageSeconds: number | null;
          secondsStale: number;
      }
    | {status: "unknown"; reason: string};

/** A provider claim resolved end to end: document fetched, signature checked, freshness enforced. */
export type ProviderAssessment = {
    claim: ProviderClaim;
    fetch: AssessmentFetch;
    signature: SignatureVerdict;
    freshness: FreshnessVerdict;
    market: ClaimMarket | null;
};

/**
 * One merged view of an agent, assembled from every configured source.
 *
 * Every field carries provenance. Nothing is defaulted silently: a value this
 * package could not establish is `null`, and a source that failed is listed in
 * `sourceErrors` rather than swallowed.
 */
export type AgentProfile = {
    ref: ResolvedAgentRef;
    caip19: string;
    identity: AgentIdentity | null;
    /** Identities from every source that resolved one, in source order. */
    identities: AgentIdentity[];
    assessments: ProviderAssessment[];
    capabilities: Capabilities[];
    markets: ClaimMarket[];
    conflicts: ProfileConflict[];
    sourceErrors: SourceError[];
    /** Which source ids were consulted, in order. */
    sourcesConsulted: string[];
    /**
     * Which of them can price a claim at all. An empty `markets` array means
     * something different depending on this list: with entries, nobody has staked;
     * without, no configured source can see stake.
     */
    marketCapableSources: string[];
};
