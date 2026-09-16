import type {
    AgentIdentity,
    AgentProfile,
    AssessmentDocument,
    AssessmentFetch,
    ClaimMarket,
    ClaimRelation,
    FreshnessVerdict,
    MarketSide,
    ProviderAssessment,
    ProviderClaim,
    SignatureVerdict,
} from "@arp-protocol/erc8004";
import type {Address} from "viem";

/**
 * Builders for `AgentProfile` shapes, modelled on what the connector actually
 * returns from Intuition mainnet — including the parts that are awkward: a
 * `has trust provider` edge whose "resolver" is the provider's homepage, an
 * assessment edge whose document 404s, and a reviewer count that lives in a
 * provider-specific `method` block rather than anywhere standardised.
 */

export const REGISTRY: Address = "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432";
export const DEEP3_SIGNER: Address = "0x27A6265e6daf8d9935A3031f2E7cDC4bDFbe2Ebe";

export const DEEP3_TRIPLE = `0x${"11".repeat(32)}`;
export const ASTERPAY_TRIPLE = `0x${"22".repeat(32)}`;

function provenance(origin: string | null) {
    return {sourceId: "intuition", kind: "claim" as const, origin};
}

export function marketSide(overrides: Partial<MarketSide> = {}): MarketSide {
    return {
        totalMarketCap: 993_846_395_273_540_461n,
        totalAssets: 988_487_499_998_074_999n,
        marketCap: 987_500_001_000_000n,
        totalShares: 987_500_001_000_000n,
        currentSharePrice: 10n ** 18n,
        positionCount: 1,
        ...overrides,
    };
}

export function claimMarket(
    claimHandle: string,
    overrides: {support?: Partial<MarketSide>; opposition?: Partial<MarketSide>} = {},
): ClaimMarket {
    return {
        claimHandle,
        relation: "has-trust-provider",
        label: "provider",
        support: marketSide(overrides.support),
        opposition: marketSide({
            totalMarketCap: 3_000_000n,
            totalAssets: 3_000_001n,
            marketCap: 1_000_000n,
            totalShares: 1_000_000n,
            positionCount: 0,
            ...overrides.opposition,
        }),
        provenance: provenance(claimHandle),
    };
}

export function providerClaim(params: {
    relation: ClaimRelation;
    handle: string;
    providerName: string;
    label?: string;
    resolverUrl?: string | null;
}): ProviderClaim {
    return {
        relation: params.relation,
        label: params.label ?? params.providerName,
        provider: {
            name: params.providerName,
            description: null,
            image: null,
            url: `https://${params.providerName.toLowerCase().replace(/\s+/g, "")}.example`,
            sourceHandle: `${params.handle}-object`,
        },
        resolverUrl: params.resolverUrl ?? null,
        pinnedUri: null,
        sourceHandle: params.handle,
        provenance: provenance(params.handle),
    };
}

export function assessmentDocument(params: {
    providerName: string;
    providerId: string;
    score: number;
    numReviewers?: number;
    comparative?: number;
    nonComparative?: number;
    dimensions?: Record<string, number>;
}): AssessmentDocument {
    const raw: Record<string, unknown> = {
        agent: {chainId: 8453, registry: REGISTRY, tokenId: "2340"},
        provider: {id: params.providerId, name: params.providerName},
        assessment: {score: params.score, scoreScale: "0-100"},
    };
    if (params.numReviewers !== undefined) {
        raw["method"] = {
            numReviewers: params.numReviewers,
            comparativeReviewers: params.comparative ?? null,
            nonComparativeReviewers: params.nonComparative ?? null,
        };
    }

    return {
        agent: {chainId: 8453, tokenId: "2340", registry: REGISTRY},
        provider: {id: params.providerId, name: params.providerName, url: null},
        score: params.score,
        scoreScale: "0-100",
        riskLevel: null,
        lastUpdated: "2026-09-05T00:43:44.264Z",
        dimensions: params.dimensions ?? {trust: 59.28, quality: 59.29},
        evidence: [],
        freshness: {validUntil: "2026-09-12T09:26:26.384Z", refreshIntervalSeconds: 86_400},
        signature: null,
        raw,
    };
}

export const VERIFIED: SignatureVerdict = {
    status: "verified",
    declaredSigner: DEEP3_SIGNER,
    recovered: DEEP3_SIGNER,
    strategyId: "providerIdCaip19",
    contentHash: `0x${"ab".repeat(32)}`,
};

export const UNVERIFIED: SignatureVerdict = {
    status: "unverified",
    reason: "no signature block at assessment.signature",
    declaredSigner: null,
    attempts: [],
};

export const MISMATCH: SignatureVerdict = {
    status: "mismatch",
    declaredSigner: DEEP3_SIGNER,
    recovered: "0x000000000000000000000000000000000000dEaD",
    strategyId: "providerIdCaip19",
    contentHash: `0x${"cd".repeat(32)}`,
    attempts: [],
};

export const STALE: FreshnessVerdict = {
    status: "stale",
    validUntil: "2026-09-12T09:26:26.384Z",
    lastUpdated: "2026-09-05T00:43:44.264Z",
    ageSeconds: 1_000_000,
    secondsStale: 345_600,
};

export const FRESH: FreshnessVerdict = {
    status: "fresh",
    validUntil: "2026-09-16T08:00:12.686Z",
    lastUpdated: "2026-09-16T07:55:12.684Z",
    ageSeconds: 120,
    secondsRemaining: 180,
};

export function okFetch(url: string, document: AssessmentDocument): AssessmentFetch {
    return {status: "ok", url, httpStatus: 200, document};
}

export function notFoundFetch(url: string): AssessmentFetch {
    return {
        status: "error",
        url,
        error: {kind: "http", status: 404, statusText: "Not Found"},
    };
}

/** A `has trust provider` edge. Its "resolver" is the provider's homepage. */
export function providerEdge(params: {
    handle: string;
    providerName: string;
    market?: ClaimMarket | null;
}): ProviderAssessment {
    return {
        claim: providerClaim({
            relation: "has-trust-provider",
            handle: params.handle,
            providerName: params.providerName,
            resolverUrl: `https://${params.providerName.toLowerCase().replace(/\s+/g, "")}.example`,
        }),
        fetch: {
            status: "error",
            url: `https://${params.providerName.toLowerCase().replace(/\s+/g, "")}.example`,
            error: {kind: "not-json", contentType: "text/html", excerpt: "<!doctype html>"},
        },
        signature: {
            status: "unverified",
            reason: "no document to verify",
            declaredSigner: null,
            attempts: [],
        },
        freshness: {status: "unknown", reason: "no document to check"},
        market: params.market === undefined ? claimMarket(params.handle) : params.market,
    };
}

/** A `has trust assessment` edge. Its resolver is the live document. */
export function assessmentEdge(params: {
    handle: string;
    providerName: string;
    fetch: AssessmentFetch;
    signature?: SignatureVerdict;
    freshness?: FreshnessVerdict;
}): ProviderAssessment {
    return {
        claim: providerClaim({
            relation: "has-trust-assessment",
            handle: params.handle,
            providerName: `${params.providerName} — assessment`,
            label: `${params.providerName} — Clawnch trust assessment`,
            resolverUrl: "https://api.example/assessment.json",
        }),
        fetch: params.fetch,
        signature: params.signature ?? UNVERIFIED,
        freshness: params.freshness ?? {status: "unknown", reason: "no document to check"},
        market: null,
    };
}

export function identity(overrides: Partial<AgentIdentity> = {}): AgentIdentity {
    return {
        chainId: 8453,
        tokenId: "2340",
        registry: REGISTRY,
        caip19: `eip155:8453/erc721:${REGISTRY}/2340`,
        sourceHandle: `0x${"ee".repeat(32)}`,
        registrationFile: null,
        owner: null,
        metadata: {
            name: "Clawnch",
            description: "An agent",
            image: null,
            url: "https://clawn.ch",
            isFallback: false,
        },
        provenance: {sourceId: "intuition", kind: "claim", origin: "0xee"},
        ...overrides,
    };
}

export function profile(overrides: Partial<AgentProfile> = {}): AgentProfile {
    const base = identity();
    return {
        ref: {chainId: 8453, tokenId: "2340", registry: REGISTRY},
        caip19: base.caip19,
        identity: base,
        identities: [base],
        assessments: [],
        capabilities: [],
        markets: [],
        conflicts: [],
        sourceErrors: [],
        sourcesConsulted: ["intuition", "erc8004-registry"],
        marketCapableSources: ["intuition"],
        ...overrides,
    };
}

/** Two providers, both edges each — the shape the rich fixture actually has. */
export function richProfile(): AgentProfile {
    const deep3Market = claimMarket(DEEP3_TRIPLE);
    const asterpayMarket = claimMarket(ASTERPAY_TRIPLE, {support: {positionCount: 2}});

    return profile({
        assessments: [
            providerEdge({
                handle: DEEP3_TRIPLE,
                providerName: "Deep3 Labs",
                market: deep3Market,
            }),
            assessmentEdge({
                handle: `${DEEP3_TRIPLE}-doc`,
                providerName: "Deep3 Labs",
                fetch: okFetch(
                    "https://api.deep3.example/assessment.json",
                    assessmentDocument({
                        providerName: "Deep3 Labs",
                        providerId: "deep3-labs",
                        score: 55.35,
                        numReviewers: 26,
                        comparative: 6,
                        nonComparative: 20,
                    }),
                ),
                signature: VERIFIED,
                freshness: STALE,
            }),
            providerEdge({
                handle: ASTERPAY_TRIPLE,
                providerName: "AsterPay KYA",
                market: asterpayMarket,
            }),
            assessmentEdge({
                handle: `${ASTERPAY_TRIPLE}-doc`,
                providerName: "AsterPay KYA",
                fetch: okFetch(
                    "https://api.asterpay.example/assessment.json",
                    assessmentDocument({
                        providerName: "AsterPay KYA",
                        providerId: "asterpay-kya",
                        score: 59,
                    }),
                ),
                signature: UNVERIFIED,
                freshness: FRESH,
            }),
        ],
        markets: [deep3Market, asterpayMarket],
    });
}
