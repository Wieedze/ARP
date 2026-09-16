/**
 * `@arp-protocol/erc8004` — a read-only connector for the ERC-8004 agent layer.
 *
 * Give it an ERC-8004 identity and it returns one merged profile: every trust
 * provider's assessment with its EIP-712 signature actually verified and its
 * declared freshness window actually enforced, the agent's capability
 * declarations, and the live market on each provider claim.
 *
 *     import {createErc8004Client, getAgentProfile, listAgents} from "@arp-protocol/erc8004";
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
 * Read-only throughout: no signer, no wallet client, no private key, no write
 * path of any kind.
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
