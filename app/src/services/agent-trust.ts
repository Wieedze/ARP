import type {
    AgentProfile,
    AssessmentFetchError,
    CapabilityRef,
    CapabilityRelation,
    ClaimMarket,
    ProviderAssessment,
} from "@arp-protocol/erc8004";
import type {Hex} from "viem";

/**
 * Turns one `AgentProfile` into the shape the panel renders.
 *
 * Pure: no network, no React, no clock. Everything it knows comes from the
 * profile the connector returned, and everything it cannot establish stays
 * `null` rather than being filled in with a plausible default — the panel's
 * whole argument is that an unchecked signal and a checked one must not look
 * alike, and that starts here.
 */

/**
 * How many reviewers a score rests on.
 *
 * Deep3 publishes this at `method.numReviewers`; AsterPay's rule-based KYA
 * publishes no reviewer count at all, which is `not-published` and **not**
 * zero. The distinction matters: zero reviewers would be a damning fact about
 * a review-based score, while a rule-based score legitimately has none.
 */
export type ReviewerBasis =
    | {
          kind: "reviewers";
          total: number;
          comparative: number | null;
          nonComparative: number | null;
      }
    | {kind: "not-published"};

/**
 * The editorial axis of the panel: how much a score's number is worth.
 *
 * Drives type size and colour in `AssessmentRow`, so a 64.36 on 1,445
 * reviewers and a 59.95 on 2 cannot read the same at a glance.
 */
export type EvidenceWeight =
    | "unknown"
    | "none"
    | "single"
    | "thin"
    | "moderate"
    | "substantial"
    | "deep";

/** How an assessment document was tied back to a provider edge in the graph. */
export type ProviderMatch = "document" | "label-prefix" | "none";

export type ScoreDimension = {name: string; value: number};

/**
 * One provider's row: the graph edge whose vault the market prices, and the
 * document that edge's provider published, joined.
 *
 * Both halves are nullable and for different reasons. `providerClaim === null`
 * means an assessment exists with no `has trust provider` edge behind it —
 * nothing to stake on. `assessment === null` means a provider is declared but
 * published no assessment edge — a market with no document under it.
 */
export type TrustRow = {
    id: string;
    providerName: string;
    providerUrl: string | null;
    providerDescription: string | null;
    providerImage: string | null;
    providerMatch: ProviderMatch;
    providerClaim: ProviderAssessment | null;
    assessment: ProviderAssessment | null;
    /** The `has trust provider` triple's term id — the vault a stake goes into. */
    tripleId: Hex | null;
    market: ClaimMarket | null;
    score: number | null;
    scoreScale: string | null;
    riskLevel: string | null;
    dimensions: ScoreDimension[];
    reviewers: ReviewerBasis;
    weight: EvidenceWeight;
    /** The live document URL, so a reader can check the raw source themselves. */
    documentUrl: string | null;
    /** Why the document could not be read, when it could not. */
    documentError: AssessmentFetchError | null;
};

export type CapabilityGroup = {
    relation: CapabilityRelation;
    label: string;
    entries: CapabilityRef[];
};

export type TrustPanelView = {
    caip19: string;
    chainId: number;
    tokenId: string;
    registry: Hex;
    /** `false` when no source could produce an identity — "not there", not "failed". */
    found: boolean;
    name: string | null;
    description: string | null;
    image: string | null;
    /** True when the name is the indexer's `Agent 8453:6649` stand-in, not a chosen one. */
    isFallbackMetadata: boolean;
    /** The agent's own declared URL, or the 8004scan stand-in when metadata is fallback. */
    url: string | null;
    owner: string | null;
    registrationFile: string | null;
    /** The Intuition atom the agent resolves to. `null` when the graph does not have it. */
    atomTermId: string | null;
    rows: TrustRow[];
    capabilities: CapabilityGroup[];
    capabilityCount: number;
    sourceErrors: AgentProfile["sourceErrors"];
    conflicts: AgentProfile["conflicts"];
    sourcesConsulted: string[];
    marketCapableSources: string[];
};

const CAPABILITY_GROUP_ORDER: {relation: CapabilityRelation; label: string}[] = [
    {relation: "uses", label: "Uses"},
    {relation: "has-type", label: "Type"},
    {relation: "implements", label: "Implements"},
    {relation: "has-category", label: "Category"},
    {relation: "has-tag", label: "Tags"},
    {relation: "compatible-with", label: "Compatible with"},
    {relation: "available-on", label: "Available on"},
];

function asRecord(value: unknown): Record<string, unknown> | null {
    return typeof value === "object" && value !== null && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : null;
}

function readCount(source: Record<string, unknown> | null, key: string): number | null {
    if (source === null) return null;
    const value = source[key];
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return null;
    return Math.trunc(value);
}

/**
 * Pull the reviewer count out of a raw assessment document.
 *
 * Read from `raw`, not from the connector's narrowed view, because the count
 * is provider-specific and the connector deliberately narrows only the fields
 * ERC-8004 assessments share. This is a relayed claim — the provider's own
 * number, unverified by anyone, including us.
 */
export function readReviewerBasis(raw: unknown): ReviewerBasis {
    const method = asRecord(asRecord(raw)?.["method"]);
    const total = readCount(method, "numReviewers");
    if (total === null) return {kind: "not-published"};
    return {
        kind: "reviewers",
        total,
        comparative: readCount(method, "comparativeReviewers"),
        nonComparative: readCount(method, "nonComparativeReviewers"),
    };
}

/**
 * Map a reviewer basis onto the panel's weight scale.
 *
 * The bands are log-ish on purpose: the difference between 1 and 2 reviewers
 * matters far more than the difference between 400 and 800.
 */
export function evidenceWeight(basis: ReviewerBasis): EvidenceWeight {
    if (basis.kind === "not-published") return "unknown";
    if (basis.total === 0) return "none";
    if (basis.total === 1) return "single";
    if (basis.total < 10) return "thin";
    if (basis.total < 100) return "moderate";
    if (basis.total < 1000) return "substantial";
    return "deep";
}

function providerNameOf(entry: ProviderAssessment): string | null {
    if (entry.fetch.status !== "ok") return null;
    const declared = entry.fetch.document.provider;
    return declared?.name ?? declared?.id ?? null;
}

function normalise(value: string): string {
    return value.trim().toLowerCase();
}

function dimensionsOf(entry: ProviderAssessment | null): ScoreDimension[] {
    if (entry === null || entry.fetch.status !== "ok") return [];
    const dimensions = entry.fetch.document.dimensions;
    if (dimensions === null) return [];
    return Object.entries(dimensions)
        .filter(([, value]) => typeof value === "number" && Number.isFinite(value))
        .map(([name, value]) => ({name, value}));
}

function documentErrorOf(entry: ProviderAssessment | null): AssessmentFetchError | null {
    if (entry === null) return null;
    return entry.fetch.status === "error" ? entry.fetch.error : null;
}

function rowFrom(
    id: string,
    providerEdge: ProviderAssessment | null,
    assessmentEdge: ProviderAssessment | null,
    providerMatch: ProviderMatch,
    markets: Map<string, ClaimMarket>,
): TrustRow {
    const document = assessmentEdge?.fetch.status === "ok" ? assessmentEdge.fetch.document : null;
    const reviewers = readReviewerBasis(document?.raw ?? null);
    const handle = providerEdge?.claim.sourceHandle ?? null;

    return {
        id,
        providerName:
            providerEdge?.claim.provider.name ??
            (assessmentEdge === null ? null : providerNameOf(assessmentEdge)) ??
            "Unnamed provider",
        // A `has trust provider` object atom's url is the provider's own site;
        // the assessment atom's url is the document. Never interchange them.
        providerUrl: providerEdge?.claim.provider.url ?? document?.provider?.url ?? null,
        providerDescription: providerEdge?.claim.provider.description ?? null,
        providerImage: providerEdge?.claim.provider.image ?? null,
        providerMatch,
        providerClaim: providerEdge,
        assessment: assessmentEdge,
        tripleId: handle === null ? null : (handle as Hex),
        market: handle === null ? null : (markets.get(handle) ?? null),
        score: document?.score ?? null,
        scoreScale: document?.scoreScale ?? null,
        riskLevel: document?.riskLevel ?? null,
        dimensions: dimensionsOf(assessmentEdge),
        reviewers,
        weight: evidenceWeight(reviewers),
        documentUrl: assessmentEdge?.claim.resolverUrl ?? null,
        documentError: documentErrorOf(assessmentEdge),
    };
}

/**
 * Join the two halves of the trust pattern into one row per provider.
 *
 * The graph writes two edges per provider: `has trust provider` (whose object
 * is the provider, and whose vault is the market) and `has trust assessment`
 * (whose object carries the document URL). The panel shows them together, so
 * they have to be matched.
 *
 * Preference order is deliberate. Matching on the **document's own**
 * `provider.name` is a claim by the publisher. Matching on the assessment
 * atom's label prefix — `"AsterPay KYA — Captain Dackie trust assessment"` —
 * is a naming-convention guess, and it is the only thing left when the
 * document is unreachable, which is exactly when a reader most needs the row
 * to render. It is reported as `label-prefix` so the UI can say so.
 */
export function joinProviderRows(assessments: ProviderAssessment[], markets: ClaimMarket[]) {
    const marketByHandle = new Map<string, ClaimMarket>();
    for (const market of markets) marketByHandle.set(market.claimHandle, market);

    const providerEdges = assessments.filter((e) => e.claim.relation === "has-trust-provider");
    const assessmentEdges = assessments.filter((e) => e.claim.relation === "has-trust-assessment");
    const taken = new Set<ProviderAssessment>();
    const rows: TrustRow[] = [];

    providerEdges.forEach((providerEdge, index) => {
        const name = providerEdge.claim.provider.name;
        let match: ProviderMatch = "none";
        let paired: ProviderAssessment | null = null;

        if (name !== null) {
            paired =
                assessmentEdges.find(
                    (entry) =>
                        !taken.has(entry) &&
                        providerNameOf(entry) !== null &&
                        normalise(providerNameOf(entry) as string) === normalise(name),
                ) ?? null;
            if (paired !== null) match = "document";

            if (paired === null) {
                paired =
                    assessmentEdges.find(
                        (entry) =>
                            !taken.has(entry) &&
                            (entry.claim.label ?? "")
                                .trim()
                                .toLowerCase()
                                .startsWith(normalise(name)),
                    ) ?? null;
                if (paired !== null) match = "label-prefix";
            }
        }

        if (paired !== null) taken.add(paired);
        rows.push(
            rowFrom(
                providerEdge.claim.sourceHandle ?? `provider-${index}`,
                providerEdge,
                paired,
                match,
                marketByHandle,
            ),
        );
    });

    assessmentEdges.forEach((entry, index) => {
        if (taken.has(entry)) return;
        rows.push(
            rowFrom(
                entry.claim.sourceHandle ?? `assessment-${index}`,
                null,
                entry,
                "none",
                marketByHandle,
            ),
        );
    });

    return rows;
}

/** Merge every source's capabilities into one ordered, de-duplicated set. */
export function groupCapabilities(profile: AgentProfile): CapabilityGroup[] {
    const all: CapabilityRef[] = profile.capabilities.flatMap((entry) => [
        ...entry.types,
        ...entry.protocols,
        ...entry.chains,
        ...entry.tags,
        ...entry.categories,
    ]);

    return CAPABILITY_GROUP_ORDER.flatMap(({relation, label}) => {
        const seen = new Set<string>();
        const entries = all.filter((ref) => {
            if (ref.relation !== relation) return false;
            const key = ref.sourceHandle ?? ref.name ?? ref.label ?? "";
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
        return entries.length === 0 ? [] : [{relation, label, entries}];
    });
}

/** The one call the hook makes: `AgentProfile` in, everything the panel renders out. */
export function buildTrustPanel(profile: AgentProfile): TrustPanelView {
    const identity = profile.identity;
    const withOwner = profile.identities.find((entry) => entry.owner !== null) ?? null;
    const withRegistrationFile =
        profile.identities.find((entry) => entry.registrationFile !== null) ?? null;
    const capabilities = groupCapabilities(profile);

    return {
        caip19: profile.caip19,
        chainId: profile.ref.chainId,
        tokenId: profile.ref.tokenId,
        registry: profile.ref.registry,
        found: identity !== null,
        name: identity?.metadata.name ?? null,
        description: identity?.metadata.description ?? null,
        image: identity?.metadata.image ?? null,
        isFallbackMetadata: identity?.metadata.isFallback ?? false,
        url: identity?.metadata.url ?? null,
        owner: withOwner?.owner ?? null,
        registrationFile: withRegistrationFile?.registrationFile ?? null,
        atomTermId: identity?.sourceHandle ?? null,
        rows: joinProviderRows(profile.assessments, profile.markets),
        capabilities,
        capabilityCount: capabilities.reduce((total, group) => total + group.entries.length, 0),
        sourceErrors: profile.sourceErrors,
        conflicts: profile.conflicts,
        sourcesConsulted: profile.sourcesConsulted,
        marketCapableSources: profile.marketCapableSources,
    };
}
