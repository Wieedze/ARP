/**
 * The write half of the connector — as a plan, never as a transaction.
 *
 * `docs/12`'s loop, for an agent that already exists: its operator signs one delegation, it runs,
 * it declares what it used, it deposits on those declarations. ARP supplies the rail and is not a
 * party to any of it (ADR `0035`), which is enforceable here rather than merely stated: this
 * package holds no key, builds no wallet client, and has no send path. It returns calls.
 *
 *     const subject = await resolveDeclarationSubject({agent: {chainId: 8453, tokenId: "1380"}});
 *     const reads = multiVaultReads({address: MULTI_VAULT, chainId: 1155, rpcUrl});
 *     const plan = await prepareDeclareUsed({subject, tools: [schemaUri], reads});
 *     // plan.totalValue is what signing it will cost. Sign plan.calls in order, with your own key.
 *
 * No API key anywhere in that: a tool's atom derives from its URI (ADR `0008`) and the agent's
 * identity atom already exists for the mirrored cohort, so nothing is pinned.
 */

export {
    atomDataForUri,
    encodeCreateAtom,
    encodeCreateAtoms,
    encodeCreateTriple,
    encodeCreateTriples,
    encodeDeposit,
    encodeRedeem,
    multiVaultDeclareAbi,
    multiVaultReads,
    type MultiVaultReads,
    type MultiVaultReadsConfig,
} from "./multivault.js";

export {
    BelowMinimumError,
    InsufficientSharesError,
    prepareMarketExit,
    prepareMarketPosition,
    TermNotFoundError,
    type MarketExitPlan,
    type MarketPositionPlan,
} from "./market.js";

export {
    AmbiguousToolAtomError,
    BelowMinDepositError,
    EmptyPlanError,
    NonPositiveAmountError,
    prepareDeclareUsed,
    prepareStakeOnUsed,
    ZeroPositionError,
} from "./plan.js";

export {
    derivesItsOwnAtom,
    intuitionToolAtomLookup,
    type ToolAtomCandidate,
    type ToolAtomLookup,
    type ToolAtomLookupConfig,
} from "./tool-atom.js";

export {
    resolveDeclarationSubject,
    resolveIdentityAtomStrict,
    type StrictIdentityAtom,
} from "./resolve-subject.js";

export {
    SmartAccountsKitMissingError,
    toDelegatedCalls,
    type DelegatedPlan,
    type DelegationLike,
} from "./delegated.js";

export type {DeclarePlan, PlannedStake, PlannedTool, PreparedCall, StakePlan} from "./types.js";

export {
    canonicalAgentThing,
    canonicalCaipThing,
    thingDocument,
    thingUri,
    type AgentThing,
} from "./agent-atom.js";

export {
    InvalidToolUrlError,
    isToolUrl,
    normaliseToolUrl,
    toolAtomUri,
    toolThing,
    toolThingDocument,
    TOOL_THING_DESCRIPTION,
} from "./tool-thing.js";

export {
    IdentityTermHasNoPositionError,
    prepareIdentityAtom,
    type IdentityAtomPlan,
} from "./identity-plan.js";

/**
 * Liveness, the planning half. One shape, two tags — `reachable` for an endpoint we called,
 * `maintained` for a repository whose owner still pushes to it. Which one is `stateAtomId`.
 */
export {
    planReachability,
    readReachabilityState,
    type ReachabilityPlan,
    type ReachabilityState,
    type ReachabilityTerms,
} from "./reachability-plan.js";
