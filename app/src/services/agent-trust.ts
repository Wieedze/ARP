import type {
    AgentProfile,
    AssessmentFetchError,
    CapabilityRef,
    CapabilityRelation,
    ClaimMarket,
    ProviderAssessment,
    SignatureVerdict,
} from "@arp-protocol/core";
import type {Hex} from "viem";

import {asStakeTermId} from "./trust-stake";

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
};

const CAPABILITY_GROUP_ORDER: {relation: CapabilityRelation; label: string}[] = [
    // `uses-tool` first: what an agent depends on is the part a reader is
    // choosing between. `supports-protocol` sits with the other interface
    // claims — what you can call the agent with is a different question from
    // what it runs on. "Supports" rather than "Speaks" because the published
    // object set is ERC-8004, x402, MCP, A2A and OASF: you do not *speak* a
    // schema or a payment scheme, and OASF alone is 16 of 153 edges. ADR 0030.
    //
    // Note this group leads nothing today — zero `uses` edges have a subject
    // the connector can reach — so the ordering is a bet on edges ARP has yet
    // to write, not a current improvement.
    {relation: "uses-tool", label: "Uses"},
    {relation: "has-type", label: "Type"},
    {relation: "implements", label: "Implements"},
    {relation: "supports-protocol", label: "Supports"},
    {relation: "has-category", label: "Category"},
    {relation: "has-tag", label: "Tags"},
    {relation: "compatible-with", label: "Compatible with"},
    {relation: "available-on", label: "Available on"},
];

function asRecord(value: unknown): Record<string, unknown> | null {
    // Safe: the guard on the line above establishes a non-null, non-array
    // object, which is exactly what the target type says and nothing more.
    return typeof value === "object" && value !== null && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : null;
}

/**
 * A `bytes32` term id as the indexer prints it.
 *
 * `sourceHandle` is typed `string` and is source-scoped: the Intuition source
 * emits a term id, the registry source emits `chainId:registry:tokenId`, and a
 * future source could emit anything. This one becomes the `bytes32` a deposit
 * is addressed to, so it is checked rather than asserted — a malformed term id
 * reverts with no message, which is the hardest failure on this surface to
 * diagnose.
 */
const asTermId = asStakeTermId;

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
        providerMatch,
        providerClaim: providerEdge,
        assessment: assessmentEdge,
        tripleId: asTermId(handle),
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
            const target = normalise(name);
            paired =
                assessmentEdges.find((entry) => {
                    if (taken.has(entry)) return false;
                    const declared = providerNameOf(entry);
                    return declared !== null && normalise(declared) === target;
                }) ?? null;
            if (paired !== null) match = "document";

            if (paired === null) {
                paired =
                    assessmentEdges.find(
                        (entry) =>
                            !taken.has(entry) &&
                            (entry.claim.label ?? "").trim().toLowerCase().startsWith(target),
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
        ...entry.tools,
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
    };
}

/* -------------------------------------------------------------------------- */
/* Tabs                                                                        */
/* -------------------------------------------------------------------------- */

/** The agent's own data — capabilities, and the reads that did not land. */
export const AGENT_TAB_SLUG = "agent";

/** ARP's own position on this agent, which today is that it has none. */
export const ARP_TAB_SLUG = "arp";

/**
 * How many providers it takes before a tab strip earns its place.
 *
 * With one provider there is nothing to compare it against, so the strip would
 * be a control with no choice behind it. That is also the common case: one
 * provider covers 99.99% of this cohort, so most agents keep the stacked
 * layout and only the contested ones pay for tabs.
 */
const MIN_PROVIDERS_FOR_TABS = 2;

export function shouldUseTabs(rows: TrustRow[]): boolean {
    return rows.length >= MIN_PROVIDERS_FOR_TABS;
}

/**
 * What a provider tab carries in the strip itself.
 *
 * Stacking let a reader see one provider's signed assessment beside another's
 * unsigned one; tabs take that away, and this is what is put back. Deliberately
 * **no score**: a strip of scores would rank providers by the one variable
 * ADR 0018 argues is not the measure.
 */
export type TabSummary = {
    /**
     * The connector's verdict, relayed. `absent` is the fourth case and not a
     * verdict at all: no assessment edge, so nothing was ever checked.
     */
    signature: {status: SignatureVerdict["status"] | "absent"; label: string};
};

export type PanelTab =
    | {kind: "provider"; slug: string; label: string; row: TrustRow; summary: TabSummary}
    | {kind: "arp"; slug: string; label: string}
    | {kind: "agent"; slug: string; label: string};

export type PanelTabs = {
    tabs: PanelTab[];
    /**
     * The tab a bare URL opens: always the agent's own data.
     *
     * What the agent is for comes before anyone's opinion of it, and it is the
     * one tab that is about the agent rather than about a provider. This
     * replaces the earlier rule — the provider with the most evidence behind it
     * — which opened the page on a stranger's assessment.
     */
    defaultSlug: string;
};

/** The connector's own words, compressed to fit a tab. Nothing is upgraded. */
const SIGNATURE_TAB_LABEL: Record<SignatureVerdict["status"], string> = {
    verified: "verified",
    mismatch: "mismatch",
    unverified: "not verified",
};

function slugify(value: string): string {
    return value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
}

function summarise(row: TrustRow): TabSummary {
    const verdict = row.assessment?.signature ?? null;
    return {
        signature:
            verdict === null
                ? {status: "absent", label: "no document"}
                : {status: verdict.status, label: SIGNATURE_TAB_LABEL[verdict.status]},
    };
}

/**
 * The agent's own data first, then one tab per provider, then ARP.
 *
 * The agent leads because the page is about the agent: what it is for comes
 * before what anyone says about it.
 *
 * ARP gets a tab rather than a footnote because its abstention is a claim about
 * this agent and belongs beside the others: "no assessment" is only legible as
 * a position if it sits where a position would sit.
 *
 * Slugs go in the URL, so they are derived from the provider's name and made
 * unique — two providers named alike, or a provider that happens to be called
 * "Agent", must still address distinct tabs.
 */
export function buildPanelTabs(rows: TrustRow[]): PanelTabs {
    const used = new Set<string>([AGENT_TAB_SLUG, ARP_TAB_SLUG]);

    const providers: PanelTab[] = rows.map((row, index) => {
        const base = slugify(row.providerName) || `provider-${index + 1}`;
        let slug = base;
        for (let suffix = 2; used.has(slug); suffix += 1) slug = `${base}-${suffix}`;
        used.add(slug);
        return {kind: "provider", slug, label: row.providerName, row, summary: summarise(row)};
    });

    return {
        tabs: [
            {kind: "agent", slug: AGENT_TAB_SLUG, label: "Agent"},
            ...providers,
            {kind: "arp", slug: ARP_TAB_SLUG, label: "ARP"},
        ],
        defaultSlug: AGENT_TAB_SLUG,
    };
}

/**
 * The tab the URL asks for, or the default when it asks for one this agent does
 * not have. A stale shared link falls back silently rather than erroring — the
 * provider it named may simply have stopped writing edges.
 */
export function selectPanelTab(model: PanelTabs, requested: string | null): PanelTab {
    const asked = model.tabs.find((tab) => tab.slug === requested);
    if (asked !== undefined) return asked;
    const fallback = model.tabs.find((tab) => tab.slug === model.defaultSlug);
    // `buildPanelTabs` always prepends the agent tab, so this is unreachable.
    return fallback ?? {kind: "agent", slug: AGENT_TAB_SLUG, label: "Agent"};
}
