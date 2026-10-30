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
    /**
     * The one per-network choice in Intuition's vocabulary: both `has tag` atoms exist on both
     * chains, and each network's ecosystem **writes** with a different one. Use the function, not
     * the constants, on any write path.
     */
    hasTagForWriting as intuitionHasTagForWriting,
    HAS_TAG as INTUITION_HAS_TAG_MAINNET,
    HAS_TAG_TESTNET as INTUITION_HAS_TAG_TESTNET,
    /** The trust pattern's other two edges. Read-only here; exported so a shell can be checked. */
    PROVIDED_BY as INTUITION_PROVIDED_BY_TERM_ID,
    TRUST_ASSESSMENT_SOURCE as INTUITION_TRUST_ASSESSMENT_SOURCE,
    /**
     * The hierarchy predicate. **Not published by Intuition** — unlike every other term here, it
     * is absent from `docs/07`'s tables, and it carries zero edges on mainnet 1155.
     */
    IS_A_SUB_DOMAIN_OF as INTUITION_IS_A_SUB_DOMAIN_OF,
} from "./sources/intuition/terms.js";

export {
    erc8004RegistrySource,
    ERC8004_REGISTRY_SOURCE_ID,
    SUPPORTED_CHAINS,
    type Erc8004RegistrySourceConfig,
} from "./sources/erc8004-registry/index.js";

export type {TrustSource} from "./sources/source.js";

export {DEFAULT_TIMEOUT_MS, HttpError, isTimeoutError, type FetchLike} from "@arp-protocol/graphql";

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
 * The one thing a consumer must get right: `not-checkable` is **not** a failure. Enough declared
 * endpoints land there that rendering it beside a confirmed defect would mass-slander the cohort —
 * 82% of them in the 2026-10-16 sample and 4% on 2026-10-27, a share that moves with whoever minted
 * most recently, which is why the rule is stated and not the proportion. `partitionByCheckability` exists so that split does not get re-implemented per caller.
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
    // A probe fetches a URL somebody else supplied, from the machine it runs on. Exported because
    // the decision is the caller's: ARP's own rig probes its own endpoints on purpose.
    // The scheme check `privateProbeTarget` assigns to its caller, in one place so both callers
    // get it: one of them did not, and `file:///etc/passwd` reached `fetch`.
    fetchableDocumentUrl,
    IPFS_GATEWAY,
    MAX_DOCUMENT_HOPS,
    nextDocumentHop,
    privateProbeTarget,
    probeEndpoint,
} from "./verify/probe.js";
export type {FetchableUrl} from "./verify/probe.js";
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
 * The predicate-agnostic sibling of `getToolUsage`: one atom, its own market, and every edge
 * pointing at it grouped by predicate. What a tag, a category or a protocol needs and `uses`-only
 * reading could not give them.
 */
/**
 * The ERC-8004 registration file — the document an `agentURI` points at.
 *
 * `register()` with no argument mints an identity whose `tokenURI` is empty, which is legal and
 * says nothing: probed on Base, agents 6649 and 500000 are in exactly that state and are the rows
 * this package already reports as `metadata.isFallback`. Minting with a file is what makes an
 * identity readable.
 */
export {
    buildRegistrationFile,
    registrationUriBytes,
    REGISTRATION_V1_TYPE,
    serialiseRegistrationFile,
    toRegistrationDataUri,
    toRegistrationUrl,
} from "./registration-file.js";
export type {
    RegistrationEntry,
    RegistrationFile,
    RegistrationInput,
    RegistrationService,
} from "./registration-file.js";

/**
 * The newest declarations an identified agent wrote, for a surface that claims the protocol is
 * alive. Empty is the honest answer on mainnet today and must render as "nothing yet".
 */
export {getRecentDeclarations} from "./recent.js";
export type {RecentConfig, RecentDeclaration} from "./recent.js";

export {getAtomStanding} from "./atom-standing.js";
export {
    getDeclaredModulesFor,
    getListedCapabilitiesFor,
    resolveAgentRefForAtom,
} from "./atom-standing.js";
export type {
    AtomClaim,
    AtomEdge,
    AtomEdgeGroup,
    AtomStanding,
    AtomStandingConfig,
} from "./atom-standing.js";

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
    encodeCreateAtoms,
    encodeCreateTriple,
    encodeCreateTriples,
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
    prepareMarketExit,
    prepareMarketPosition,
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
    MarketExitPlan,
    MarketPositionPlan,
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
    getAccountActivity,
    getAccountHoldings,
    getTermActivity,
    getTermBackers,
    getTermShape,
    getTermValueHistory,
    INTUITION_MAX_POSITIONS_PAGE,
    type AccountActivityBucket,
    type AccountHoldings,
    type TermActivityBucket,
    type TermBacker,
    type TermActivityGrain,
    type TermShape,
    type TermShapeConfig,
    type TermValuePoint,
} from "./term-shape.js";

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

/**
 * The domain tree: searching by **need** rather than by atom id, and the path witness.
 *
 * `listTools` answers "what tools exist". Nothing answered "what tools are for taking a payment",
 * and that gap is what stood between the registry and an agent that can use it.
 */
/**
 * Reachability, the planning half: the calls that move what an address asserts about one endpoint.
 *
 * Plans, never signs (ADR `0038`). The caller signs with its own key, which is what lets an agent
 * record a verdict ARP's attestor did not make — the point rather than a limitation, since the one
 * reproducible claim in this system deserves more than one observer.
 */
export {
    planReachability,
    readReachabilityState,
    type ReachabilityPlan,
    type ReachabilityState,
    type ReachabilityTerms,
} from "./declare/reachability-plan.js";

/**
 * Reachability: from a probe's verdict to what ARP asserts on chain.
 *
 * The only claim in this system a third party can check for the price of one HTTP request, which
 * is why it is the only one recorded as a fact rather than as a declaration.
 */
export {
    decideTransition,
    DOWN_VERDICTS_TO_CONDEMN,
    flipCost,
    verdictOf,
    type FlipCost,
    type RecordedState,
    type Transition,
    type Verdict,
} from "./reachability.js";

export {
    DomainTree,
    readDomainTree,
    readHierarchy,
    toolsInDomain,
    type DomainsConfig,
    type HierarchyTriple,
    type PathResult,
    type TaggedTool,
} from "./domains.js";

/**
 * **Discover** — who is out there, from what agents declared about themselves.
 *
 * Not hiring. The buyer-to-stranger delegation that used to live here is gone (ADR `0060`): it
 * needed the agent's runtime address, which you only have if you already know them, so it was a
 * marketplace primitive answering a question ARP does not ask. What ARP is for is the record —
 * an agent declares what it used and pays to say so — and this is how anyone reads that record.
 */
export {
    CAPABILITY_PREDICATES,
    findAgents,
    type AgentCandidate,
    type FindAgentsConfig,
    type FindAgentsPage,
} from "./discover.js";

/**
 * **Rate** — declaring that you used an agent, with a position behind it.
 *
 * `prepareDeclareUsed` pointed at an agent's existing atom instead of a tool's derived one. The
 * predicate is `uses`, unchanged: ARP does not mint an agent-rating predicate (ADR `0030`).
 */
export {prepareRate, prepareRateStake, type RatePlan} from "./declare/rate.js";

/**
 * **Corroborate** — what a runtime actually invoked, and what a node signs for having served it.
 *
 * The two halves of `docs/tasks/31`. `resolveInvocations` turns a hook's log into the tools ARP can
 * name, and refuses a name several repositories carry rather than picking one. A receipt is the
 * second party's side of the same moment: the node says it served these bytes to this key, and
 * `verifyContentReceipt` plus `receiptMatchesContent` let a stranger check both halves without
 * asking us for anything.
 *
 * Neither signs on its own account. `signContentReceipt` takes a signer the caller supplies, and
 * that key must not be one that can move value (ADR `0038`).
 */
export {
    parseSessionLog,
    refForInvocation,
    resolveInvocations,
    type CataloguedSkill,
    type FetchedRef,
    type Invocation,
    type Resolution,
} from "./session.js";

/**
 * What an agent did, as one ordered stream: the hook's session log, the skill receipts and the
 * signer's log, each line turned into an event. Pure, so the local feed and the browser share it.
 */
export {
    activityFromLine,
    activityFromRecord,
    activityFromWire,
    decodeMultiVaultCall,
    orderActivity,
    type ActivityEvent,
    type ActivitySource,
    type DecodedCall,
    type InvocationOutcome,
} from "./activity.js";

/** What the indexer calls a term — an atom's label or a triple's three — for naming raw ids. */
export {getTermLabels, type TermLabel, type TermLabelsConfig} from "./term-labels.js";

/**
 * Which file inside a repository a tool's atom refers to — read from the repository's own listing,
 * because `scripts/measure/skill-layouts.ts` found 19 layouts across 31 repositories and 8 of them
 * using more than one. A formula would be right most of the time, which is the worst outcome
 * available: the wrong answers would be silent.
 */
export {
    directoryOf,
    rawContentUrl,
    resolveContentPath,
    skillFilesIn,
    skillRefFromUrl,
    type ContentPathResolution,
    type RepositoryFile,
    type SkillRef,
} from "./content-path.js";

/**
 * Serving a tool's content and signing for having served it. Every piece of IO is injected, so this
 * holds no key and touches no network; `apps/mcp/src/content.ts` is the transport.
 */
export {
    contentIndexOf,
    serveContent,
    type CataloguedAtom,
    type ContentAnswer,
    type ContentServeConfig,
} from "./content-serve.js";

export {
    contentDigest,
    contentReceiptDomain,
    contentRequestDomain,
    contentRequestTypedData,
    corroborationOf,
    contentReceiptTypedData,
    CONTENT_RECEIPT_TYPES,
    CONTENT_REQUEST_TYPES,
    receiptMatchesContent,
    recoverContentRequester,
    signContentReceipt,
    UNAUTHENTICATED,
    verifyContentReceipt,
    type ContentReceipt,
    type Corroboration,
    type ReceiptVerdict,
    type SignedContentReceipt,
    type TypedDataSigner,
} from "./receipt.js";

/**
 * The receipt an agent's node signs when it is hired — EIP-712, the agent named the way ERC-8004
 * names it, the payment as the nonce. `apps/node` signs it, `scripts/demo/demo-hire.ts` verifies it.
 */
export {
    HIRE_RECEIPT_TYPES,
    HIRE_RECEIPT_VERSION,
    hireDigest,
    hireReceiptDomain,
    hireReceiptMatches,
    hireReceiptTypedData,
    signHireReceipt,
    verifyHireReceipt,
    type HireReceipt,
    type HireReceiptSigner,
    type HireReceiptVerdict,
    type SignedHireReceipt,
} from "./hire-receipt.js";

/**
 * ARP's sponsoring service, as plans and checks (ADR `0094` §2-§3, `docs/tasks/40`): the agent's
 * one-time `approve`, the request it signs, the proof that unlocks a sponsored deposit, the limits,
 * and the deposit with the agent as `receiver`. `apps/sponsor` holds the key and sends; nothing here
 * does.
 */
export {
    DEPOSIT_APPROVAL,
    encodeApproveDeposit,
    multiVaultApproveAbi,
    planDepositApproval,
} from "./sponsor/approval.js";
export {
    signSponsorRequest,
    sponsorProofDigest,
    sponsorRequestDomain,
    sponsorRequestTypedData,
    SPONSOR_REQUEST_TYPES,
    SPONSOR_REQUEST_VERSION,
    verifySponsorRequest,
    type SignedSponsorRequest,
    type SponsorRequest,
    type SponsorRequestSigner,
    type SponsorRequestVerdict,
} from "./sponsor/request.js";
export {
    checkSponsorProof,
    type PaymentReads,
    type ProofCheckContext,
    type ProofVerdict,
    type ProvenProof,
    type SponsorProof,
} from "./sponsor/proof.js";
export {
    ADR_0092_LIMITS,
    checkDepositLimits,
    checkGasLimits,
    checkPublishLimits,
    spentOnDay,
    sponsoredPositions,
    utcDay,
    withdrawnBps,
    type LimitDecision,
    type SponsorLimits,
    type SponsorRecord,
} from "./sponsor/limits.js";
export {
    planSponsoredDeposit,
    SPONSORED_MIN_SHARES_BPS,
    SponsoredBelowMinDepositError,
    SponsoredTermMissingError,
    SponsoredZeroSharesError,
    type SponsoredDepositPlan,
} from "./sponsor/plan.js";

/**
 * The delegation register's write side (`docs/tasks/37` 37b): the pinned document, the signature
 * check (EIP-1271 through an injected verifier), and the plan that indexes it the way Hourglass does.
 */
export {
    caip10AccountUri,
    DELEGATION_DOCUMENT_NAME,
    DELEGATION_TYPES,
    delegationDocument,
    delegationHash,
    delegationTypedData,
    parseDelegation,
    planPublishDelegation,
    PredicateMissingError,
    verifyDelegationSignature,
    type DelegationDomain,
    type DelegationJson,
    type DelegationPredicates,
    type PublishDelegationPlan,
    type TypedDataVerifier,
} from "./delegation/register.js";
