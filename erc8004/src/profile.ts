import {fetchAssessment} from "./assessment.js";
import {resolveRef, toCaip19} from "./caip.js";
import type {Erc8004Client} from "./client.js";
import {assessFreshness} from "./freshness.js";
import {verifyAssessmentSignature} from "./signature.js";
import type {TrustSource} from "./sources/source.js";
import type {
    AgentIdentity,
    AgentProfile,
    AgentRef,
    Capabilities,
    ClaimMarket,
    ProfileConflict,
    ProviderAssessment,
    ProviderClaim,
    SourceError,
} from "./types.js";

type Step = SourceError["step"];

type Gathered<T> = {
    entries: {source: TrustSource; value: T}[];
    errors: SourceError[];
};

async function gather<T>(
    client: Erc8004Client,
    step: Step,
    run: (source: TrustSource) => Promise<T> | null,
): Promise<Gathered<T>> {
    const entries: {source: TrustSource; value: T}[] = [];
    const errors: SourceError[] = [];
    for (const source of client.sources) {
        const pending = run(source);
        if (pending === null) continue;
        try {
            entries.push({source, value: await pending});
        } catch (error) {
            errors.push({
                sourceId: source.id,
                step,
                message: error instanceof Error ? error.message : String(error),
            });
        }
    }
    return {entries, errors};
}

/**
 * A step where every consulted source failed produced no information at all.
 * Returning an empty result there would be indistinguishable from "we looked and
 * found nothing", so the first error is rethrown instead.
 */
function throwIfTotalFailure<T>(gathered: Gathered<T>, step: Step): void {
    if (gathered.entries.length === 0 && gathered.errors.length > 0) {
        const first = gathered.errors[0];
        throw new Error(
            `every source failed at ${step}: ${gathered.errors
                .map((entry) => `${entry.sourceId}: ${entry.message}`)
                .join("; ")}`,
            first === undefined ? undefined : {cause: first},
        );
    }
}

/** The ids of sources that can price a claim. */
export function marketCapableSources(client: Erc8004Client): string[] {
    return client.sources
        .filter((source) => typeof source.getMarkets === "function")
        .map((source) => source.id);
}

/**
 * Resolve an ERC-8004 identity through every configured source, in order.
 *
 * Returns the first identity any source produced, or `null` when a source
 * answered cleanly and the agent is simply not there — `null` is a legitimate
 * answer about an agent, not an error. If *every* source failed, that is not an
 * answer and it throws.
 */
export async function resolveAgent(
    client: Erc8004Client,
    ref: AgentRef,
): Promise<AgentIdentity | null> {
    const resolved = resolveRef(ref);
    const gathered = await gather(client, "resolveAgent", (source) =>
        source.resolveAgent(resolved),
    );
    throwIfTotalFailure(gathered, "resolveAgent");
    return gathered.entries.map((entry) => entry.value).find((value) => value !== null) ?? null;
}

/** Every provider claim about this agent, from every source, in source order. */
export async function getAssessments(
    client: Erc8004Client,
    ref: AgentRef,
): Promise<ProviderClaim[]> {
    const resolved = resolveRef(ref);
    const gathered = await gather(client, "getAssessments", (source) =>
        source.getAssessments(resolved),
    );
    throwIfTotalFailure(gathered, "getAssessments");
    return gathered.entries.flatMap((entry) => entry.value);
}

/** One `Capabilities` per source that answered. Kept separate so provenance survives. */
export async function getCapabilities(
    client: Erc8004Client,
    ref: AgentRef,
): Promise<Capabilities[]> {
    const resolved = resolveRef(ref);
    const gathered = await gather(client, "getCapabilities", (source) =>
        source.getCapabilities(resolved),
    );
    throwIfTotalFailure(gathered, "getCapabilities");
    return gathered.entries.map((entry) => entry.value);
}

/**
 * The live market on each claim.
 *
 * Empty when no configured source implements `getMarkets` — check
 * `marketCapableSources(client)` to tell "nobody has staked" from "no source
 * here can see stake".
 */
export async function getMarkets(client: Erc8004Client, ref: AgentRef): Promise<ClaimMarket[]> {
    const resolved = resolveRef(ref);
    const gathered = await gather(client, "getMarkets", (source) =>
        source.getMarkets === undefined ? null : source.getMarkets(resolved),
    );
    throwIfTotalFailure(gathered, "getMarkets");
    return gathered.entries.flatMap((entry) => entry.value);
}

function conflictsBetween(identities: AgentIdentity[]): ProfileConflict[] {
    const fields: {field: string; read: (identity: AgentIdentity) => string | null}[] = [
        {field: "metadata.name", read: (identity) => identity.metadata.name},
        {field: "metadata.url", read: (identity) => identity.metadata.url},
        {field: "registrationFile", read: (identity) => identity.registrationFile},
        {field: "owner", read: (identity) => identity.owner},
    ];

    const conflicts: ProfileConflict[] = [];
    for (const {field, read} of fields) {
        const answers = identities
            .map((identity) => ({sourceId: identity.provenance.sourceId, value: read(identity)}))
            // A source that did not answer is not disagreeing.
            .filter((entry) => entry.value !== null);
        const distinct = new Set(answers.map((entry) => entry.value));
        if (distinct.size > 1) {
            conflicts.push({
                field,
                entries: answers,
                note: "sources disagree; both answers kept, no winner picked",
            });
        }
    }
    return conflicts;
}

export type GetAgentProfileOptions = {
    /** Clock for the freshness check. Injectable so a recorded fixture stays deterministic. */
    now?: Date;
    /** Skip following resolver URLs. Claims and markets are still returned. */
    skipResolverFetch?: boolean;
};

/**
 * The one-call path: an ERC-8004 identity in, one merged profile out.
 *
 * For every provider claim it follows the live resolver URL, checks that the
 * document's EIP-712 signature recovers to the signer the document names, and
 * holds the document to the validity window the provider declared. A provider
 * that is unreachable, unsigned, mis-signed or stale is reported as such — the
 * profile is still returned, because "we could not check this one" is the
 * result a consumer needs, not an exception.
 *
 * A source that fails does not take the profile with it; it lands in
 * `sourceErrors`. Where two sources disagree, both answers are kept in
 * `conflicts`.
 */
export async function getAgentProfile(
    client: Erc8004Client,
    ref: AgentRef,
    options: GetAgentProfileOptions = {},
): Promise<AgentProfile> {
    const resolved = resolveRef(ref);
    const sourceErrors: SourceError[] = [];

    const identityResults = await gather(client, "resolveAgent", (source) =>
        source.resolveAgent(resolved),
    );
    sourceErrors.push(...identityResults.errors);
    const identities = identityResults.entries.flatMap((entry) =>
        entry.value === null ? [] : [entry.value],
    );

    const claimResults = await gather(client, "getAssessments", (source) =>
        source.getAssessments(resolved),
    );
    sourceErrors.push(...claimResults.errors);
    const claims = claimResults.entries.flatMap((entry) => entry.value);

    const capabilityResults = await gather(client, "getCapabilities", (source) =>
        source.getCapabilities(resolved),
    );
    sourceErrors.push(...capabilityResults.errors);

    const marketResults = await gather(client, "getMarkets", (source) =>
        source.getMarkets === undefined ? null : source.getMarkets(resolved),
    );
    sourceErrors.push(...marketResults.errors);
    const markets = marketResults.entries.flatMap((entry) => entry.value);

    const marketsByHandle = new Map<string, ClaimMarket>();
    for (const market of markets) {
        marketsByHandle.set(`${market.provenance.sourceId}:${market.claimHandle}`, market);
    }

    const assessments: ProviderAssessment[] = [];
    for (const claim of claims) {
        const fetch =
            options.skipResolverFetch === true
                ? ({
                      status: "error",
                      url: claim.resolverUrl,
                      error: {kind: "network", message: "resolver fetch skipped by caller"},
                  } as const)
                : await fetchAssessment(claim, {
                      fetch: client.fetch,
                      timeoutMs: client.timeoutMs,
                  });

        const raw = fetch.status === "ok" ? fetch.document.raw : null;
        assessments.push({
            claim,
            fetch,
            signature:
                raw === null
                    ? {
                          status: "unverified",
                          reason: "no document to verify",
                          declaredSigner: null,
                          attempts: [],
                      }
                    : await verifyAssessmentSignature(raw),
            freshness:
                raw === null
                    ? {status: "unknown", reason: "no document to check"}
                    : assessFreshness(raw, options.now),
            market:
                claim.sourceHandle === null
                    ? null
                    : (marketsByHandle.get(`${claim.provenance.sourceId}:${claim.sourceHandle}`) ??
                      null),
        });
    }

    return {
        ref: resolved,
        caip19: toCaip19(resolved),
        identity: identities[0] ?? null,
        identities,
        assessments,
        capabilities: capabilityResults.entries.map((entry) => entry.value),
        markets,
        conflicts: conflictsBetween(identities),
        sourceErrors,
        sourcesConsulted: client.sources.map((source) => source.id),
        marketCapableSources: marketCapableSources(client),
    };
}
