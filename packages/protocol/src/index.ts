/**
 * `@arp-protocol/core` — a connector for the ERC-8004 agent layer. Never signs, never sends.
 *
 * Give it an ERC-8004 identity and it returns one merged profile: every trust
 * provider's assessment with its EIP-712 signature actually verified and its
 * declared freshness window actually enforced, the agent's capability
 * declarations, and the live market on each provider claim.
 *
 *     import {createErc8004Client, getAgentProfile, listAgents} from "@arp-protocol/core";
 *
 *     const client = createErc8004Client();
 *     const profile = await getAgentProfile(client, {chainId: 8453, tokenId: "2340"});
 *     for (const entry of profile.assessments) {
 *         console.log(entry.claim.provider.name, entry.signature.status, entry.freshness.status);
 *     }
 *
 *     const page = await listAgents(client, {order: "evidence-quantity", limit: 25});
 *     console.log(page.total, page.agents[0]?.metadata.name);
 *
 * Providers publish signed assessments and declare validity windows. Consumers
 * read the number and trust it. This package checks both, and reports what it
 * cannot check rather than rounding up to a pass.
 *
 * **Never signs and never sends.** That was once "read-only throughout, no write path of any
 * kind", and the honest version is narrower: `declare/` prepares the calls an agent needs to
 * declare what it used and deposit on it, and hands them back unsigned. The package still holds no
 * key, builds no wallet client and has no send path — which is what makes "ARP is not a party"
 * (ADR `0035`) an enforceable property rather than a promise. See ADR `0038`.
 */

export {createErc8004Client, type Erc8004Client, type Erc8004ClientConfig} from "./client.js";

export {
    AllSourcesFailedError,
    getAgentProfile,
    getAssessments,
    getCapabilities,
    getMarkets,
    marketCapableSources,
    resolveAgent,
    type GetAgentProfileOptions,
} from "./profile.js";

export {
    DEFAULT_LIST_ORDER,
    DEFAULT_PAGE_SIZE,
    listAgents,
    ListAgentsFailedError,
    listingCapableSources,
    MAX_PAGE_SIZE,
    NoListingSourceError,
    resolveListOptions,
} from "./listing.js";

export {
    fetchAssessment,
    narrowAssessmentDocument,
    type FetchAssessmentOptions,
} from "./assessment.js";

export {
    ABSENT_SIGNATURE_REASON,
    DEFAULT_SIGNATURE_STRATEGIES,
    isConfirmedForProvider,
    providerIdCaip19LowercaseStrategy,
    providerIdCaip19Strategy,
    providerNameCaip19Strategy,
    providerUrlCaip19Strategy,
    verifyAssessmentSignature,
    type SignatureStrategyInput,
    type SignatureValueStrategy,
    type VerifyAssessmentSignatureOptions,
} from "./signature.js";

export {assessFreshness} from "./freshness.js";

export {canonicalBytesRfc8785, canonicalizeRfc8785, CanonicalizationError} from "./canonicalize.js";

export {DEFAULT_IDENTITY_REGISTRY, parseCaip19, resolveRef, toCaip19} from "./caip.js";

export {
    DEFAULT_CURVE_ID,
    DEFAULT_LIST_TIMEOUT_MS,
    INTUITION_MAINNET_GRAPHQL,
    INTUITION_TESTNET_GRAPHQL,
    intuitionSource,
    type IntuitionSourceConfig,
} from "./sources/intuition/index.js";

/**
 * The `same as` predicate's Intuition term id — the canonical ERC-8004 identity
 * edge, identical on mainnet (1155) and testnet (13579).
 *
 * The one term id this package exports, and the exception needs a reason. Every
 * other id is an internal detail of how the reads are filtered, and no public
 * signature mentions one. This one leaks because a *writer* has to name the
 * same predicate this package's preflight filters on: an agent linked with a
 * differently-resolved `same as` atom is not on the edge anything here reads.
 * Two frozen copies of a constant whose whole purpose is to be frozen is the
 * worse failure, so the writer takes this one rather than keeping its own.
 *
 * Exporting it adds no send path. This package still never signs and never sends a transaction;
 * `declare/` prepares calls for the agent's own key (ADR `0038`).
 */
export {
    CAPABILITY_PREDICATE_IDS as INTUITION_CAPABILITY_PREDICATE_IDS,
    SAME_AS as INTUITION_SAME_AS_TERM_ID,
    USE as INTUITION_USE_TERM_ID,
    USES as INTUITION_USES_TERM_ID,
} from "./sources/intuition/terms.js";

export {
    erc8004RegistrySource,
    ERC8004_REGISTRY_SOURCE_ID,
    SUPPORTED_CHAINS,
    type Erc8004RegistrySourceConfig,
} from "./sources/erc8004-registry/index.js";

export type {TrustSource} from "./sources/source.js";

export {DEFAULT_TIMEOUT_MS, HttpError, isTimeoutError, type FetchLike} from "./http.js";

export type {
    AgentAtomMarket,
    AgentIdentity,
    AgentListing,
    AgentListOrder,
    AgentMetadata,
    AgentPage,
    AgentProfile,
    AgentRef,
    AssessmentDocument,
    AssessmentEvidence,
    AssessmentFetch,
    AssessmentFetchError,
    AssessmentFreshnessWindow,
    AssessmentSignature,
    Capabilities,
    CapabilityRef,
    CapabilityRelation,
    ClaimMarket,
    ClaimRelation,
    FreshnessVerdict,
    ListAgentsOptions,
    MarketSide,
    ProfileConflict,
    Provenance,
    ProviderAssessment,
    ProviderClaim,
    ResolvedAgentRef,
    ResolvedListAgentsOptions,
    SignatureAttempt,
    SignatureVerdict,
    SourceError,
    TrustProvider,
} from "./types.js";

/**
 * The external verifier — reads what an agent published about itself and checks whether it holds up.
 *
 * Needs no cooperation from the agent being checked. `readDeclaredEndpoints` and `classifyEndpoint`
 * are pure functions of a registration document: no network, no clock, no configuration.
 *
 * The one thing a consumer must get right: `not-checkable` is **not** a failure. 82% of declared
 * endpoints in the cohort land there, so rendering it beside a confirmed defect would mass-slander
 * the cohort. `partitionByCheckability` exists so that split does not get re-implemented per caller.
 */
export {
    classifyEndpoint,
    partitionByCheckability,
    readDeclaredEndpoints,
} from "./verify/declaration.js";

export {
    DEFAULT_PROBE_TIMEOUT_MS,
    DEFAULT_USER_AGENT,
    MCP_PROTOCOL_VERSION,
    probeEndpoint,
} from "./verify/probe.js";
export type {ProbeOptions} from "./verify/probe.js";

export {HostLimiter, hostOf} from "./verify/host-limiter.js";

export {asAgentIdentityAtom, NoAgentIdentityError} from "./verify/subject.js";
export type {AgentIdentityAtom} from "./verify/subject.js";
export type {HostLimiterOptions} from "./verify/host-limiter.js";

export type {
    DeclarationSpelling,
    DeclaredEndpoint,
    DocumentOutcome,
    EndpointClassification,
    KnownProtocol,
    NotCheckableCode,
    ProbedEndpoint,
    ProbeOutcome,
    ProbeRequest,
} from "./verify/types.js";

/**
 * A tool's standing, as the sum of what agents put behind using it.
 *
 * The read half of `docs/12`'s mechanism — an agent stakes on the modules it used, which builds
 * reputation for the tool as well as the agent. Until this existed the `uses` edges were a write
 * path with no reader.
 *
 * Keyed by atom id rather than `AgentRef`, because a tool is not always an agent. Where it is (the
 * common case in ERC-8004 plus MCP, `docs/14`), resolve its atom through the identity path first.
 *
 * **Never render `totals.supportAssets` without `totals.supportPositions`.** Live on 2026-10-16,
 * GitHub shows 22.59 TRUST across 6 positions of which one is 22.44: the figure alone reads as a
 * market when it is one account's conviction. ADR 0023.
 */
export {getToolUsage} from "./tool-usage.js";
export type {ToolUsage, ToolUsageConfig, ToolUsageEdge} from "./tool-usage.js";

/**
 * Declaring what an agent used, and putting TRUST behind it — the write half of `docs/12`.
 *
 * Returns **plans**, not transactions: `PreparedCall[]` for the agent's own runtime to sign with
 * its own key. ARP never holds the key and never sends (ADR `0038`), so it cannot spend an
 * operator's TRUST even by mistake — the property ADR `0035` asks for, made structural.
 *
 * A third party needs a funded wallet and an ERC-8004 identity. No API key: a tool's atom derives
 * from its URI (ADR `0008`) and the identity atom already exists for the mirrored cohort.
 *
 * Two modes. **Direct** — sign `plan.calls` as they come; the signer's own TRUST is spent.
 * **Delegated** — pass them through `toDelegatedCalls` with the operator's signed delegation; the
 * delegator's TRUST is spent, bounded by the caveats the operator signed. The guard rail is not
 * the price of entry.
 */
export {
    AmbiguousToolAtomError,
    atomDataForUri,
    BelowMinDepositError,
    derivesItsOwnAtom,
    EmptyPlanError,
    encodeCreateAtom,
    encodeCreateTriple,
    encodeDeposit,
    IdentityTermHasNoPositionError,
    intuitionToolAtomLookup,
    isToolUrl,
    multiVaultDeclareAbi,
    multiVaultReads,
    canonicalAgentThing,
    canonicalCaipThing,
    NonPositiveAmountError,
    normaliseToolUrl,
    prepareDeclareUsed,
    prepareIdentityAtom,
    prepareStakeOnUsed,
    resolveDeclarationSubject,
    SmartAccountsKitMissingError,
    toDelegatedCalls,
    toolAtomUri,
    thingDocument,
    thingUri,
    toolThing,
    toolThingDocument,
    ZeroPositionError,
} from "./declare/index.js";

export type {
    AgentThing,
    DeclarePlan,
    DelegatedPlan,
    DelegationLike,
    IdentityAtomPlan,
    MultiVaultReads,
    MultiVaultReadsConfig,
    PlannedStake,
    PlannedTool,
    PreparedCall,
    StakePlan,
    ToolAtomCandidate,
    ToolAtomLookup,
    ToolAtomLookupConfig,
} from "./declare/index.js";

/**
 * The two Intuition chain definitions, and the only thing left under `arp/`.
 *
 * It exported a client, a `ModuleRegistry` reader and an agent-reputation surface — folded in from
 * `@arp-protocol/sdk` by ADR `0041`. Measured 2026-10-21, every one of those had **zero consumers**
 * outside this package, and all of it was the catalogue ADR `0051` retired. `ModuleRegistry.sol` and
 * `DomainScopeEnforcer.sol` went the same day.
 *
 * What stays is why the namespace exists at all: `rules/portability.md` makes this the one place in
 * the package allowed to name a chain, because an L3 is not in viem's registry.
 */
export {intuitionMainnet, intuitionTestnet} from "./arp/index.js";

export {
    listRegisteredTools,
    type RegisteredTool,
    type RegisteredToolsConfig,
    type RegisteredToolsOrder,
    type RegisteredToolsPage,
} from "./registered-tools.js";

export {
    INTUITION_MAX_PAGE,
    listTools,
    type ToolListing,
    type ToolListingConfig,
    type ToolListingOrder,
    type ToolListingPage,
} from "./tool-listing.js";
