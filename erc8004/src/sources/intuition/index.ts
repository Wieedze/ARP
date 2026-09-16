import {toCaip19} from "../../caip.js";
import {defaultFetch, type FetchLike} from "../../http.js";
import {isRecord, readString} from "../../json.js";
import type {
    AgentIdentity,
    Capabilities,
    CapabilityRef,
    ClaimMarket,
    ProviderClaim,
    ResolvedAgentRef,
} from "../../types.js";
import type {TrustSource} from "../source.js";
import {createGraphqlTransport, type GraphqlTransport} from "./graphql.js";
import {
    claimProvenance,
    derivedProvenance,
    INTUITION_SOURCE_ID,
    mapCapabilityRef,
    mapClaimMarket,
    mapMetadata,
    mapProviderClaim,
} from "./map.js";
import {CAPABILITIES_QUERY, RESOLVE_AGENT_QUERY, TRUST_SURFACE_QUERY} from "./queries.js";
import {CAPABILITY_PREDICATE_IDS, SAME_AS, TRUST_PREDICATE_IDS} from "./terms.js";

export const INTUITION_MAINNET_GRAPHQL = "https://mainnet.intuition.sh/v1/graphql";
export const INTUITION_TESTNET_GRAPHQL = "https://testnet.intuition.sh/v1/graphql";

/**
 * The bonding curve market reads are filtered to.
 *
 * `1` is the MultiVault default on mainnet today and that is not a guarantee —
 * it comes from `getBondingCurveConfig()`, which governance can change. A caller
 * that also writes should pass the value it read from chain, so the market it
 * renders and the vault it deposits into are the same one.
 */
export const DEFAULT_CURVE_ID = "1";

export type IntuitionSourceConfig = {
    graphqlUrl?: string;
    fetch?: FetchLike;
    timeoutMs?: number;
    /**
     * Bonding curve for market reads. Defaults to {@link DEFAULT_CURVE_ID}.
     * Accepts bigint so a value read straight from the contract needs no
     * conversion at the call site.
     */
    curveId?: string | number | bigint;
    /** Pre-built transport. Tests inject one here so no network is touched. */
    transport?: GraphqlTransport;
};

/**
 * The resolved subject, plus whether more than one atom claimed the identity.
 *
 * Two subjects on one `same as` edge means the agent's staking surface is split
 * across duplicate atoms. That is worth reporting, so it is carried out of the
 * preflight rather than discarded.
 */
type Subject = {
    handle: string;
    atom: Record<string, unknown>;
    duplicates: string[];
};

async function resolveSubject(
    transport: GraphqlTransport,
    ref: ResolvedAgentRef,
): Promise<Subject | null> {
    const data = await transport.request(RESOLVE_AGENT_QUERY, {
        sameAsPredicateId: SAME_AS,
        caipId: toCaip19(ref),
    });

    const rows = Array.isArray(data["triples"]) ? data["triples"] : [];
    const subjects: {handle: string; atom: Record<string, unknown>}[] = [];
    for (const row of rows) {
        if (!isRecord(row)) continue;
        const atom = row["subject"];
        if (!isRecord(atom)) continue;
        const handle = readString(atom, "term_id");
        if (handle === null) continue;
        subjects.push({handle, atom});
    }

    const first = subjects[0];
    if (first === undefined) return null;
    return {
        handle: first.handle,
        atom: first.atom,
        duplicates: subjects.slice(1).map((entry) => entry.handle),
    };
}

/**
 * The Intuition knowledge graph as a trust source.
 *
 * It is the only source that can answer `getMarkets`: the graph prices every
 * claim, so it can say who has capital behind a provider's opinion and who is
 * taking the other side. It is also the narrowest in coverage — it mirrors Base
 * only, so agents registered on BSC or Ethereum resolve to `null` here and are
 * picked up by the registry source instead.
 *
 * Every method runs its own preflight. That costs a round trip per call and is
 * deliberate: the methods are independently callable, and this package ships no
 * cache (see the README).
 */
export function intuitionSource(config: IntuitionSourceConfig = {}): TrustSource {
    // `curve_id` is a Hasura `numeric`, which accepts a JSON string for the
    // variable's value. Stringifying here means a bigint read straight from
    // getBondingCurveConfig() needs no conversion at the call site.
    const curveId = config.curveId === undefined ? DEFAULT_CURVE_ID : String(config.curveId);

    const transport =
        config.transport ??
        createGraphqlTransport({
            url: config.graphqlUrl ?? INTUITION_MAINNET_GRAPHQL,
            fetch: config.fetch ?? defaultFetch(),
            ...(config.timeoutMs === undefined ? {} : {timeoutMs: config.timeoutMs}),
        });

    async function surfaceRows(ref: ResolvedAgentRef): Promise<unknown[]> {
        const subject = await resolveSubject(transport, ref);
        if (subject === null) return [];
        const data = await transport.request(TRUST_SURFACE_QUERY, {
            subjectId: subject.handle,
            predicateIds: TRUST_PREDICATE_IDS,
            curveId,
        });
        return Array.isArray(data["triples"]) ? data["triples"] : [];
    }

    return {
        id: INTUITION_SOURCE_ID,

        async resolveAgent(ref: ResolvedAgentRef): Promise<AgentIdentity | null> {
            const subject = await resolveSubject(transport, ref);
            if (subject === null) return null;
            const metadata = mapMetadata(subject.atom);
            const note =
                subject.duplicates.length > 0
                    ? `more than one atom claims this identity: ${[subject.handle, ...subject.duplicates].join(", ")}`
                    : undefined;
            return {
                chainId: ref.chainId,
                tokenId: ref.tokenId,
                registry: ref.registry,
                caip19: toCaip19(ref),
                sourceHandle: subject.handle,
                registrationFile: null,
                owner: null,
                metadata,
                provenance:
                    note === undefined
                        ? claimProvenance(subject.handle)
                        : derivedProvenance(subject.handle, note),
            };
        },

        async getAssessments(ref: ResolvedAgentRef): Promise<ProviderClaim[]> {
            const rows = await surfaceRows(ref);
            return rows.flatMap((row) => {
                const claim = mapProviderClaim(row);
                return claim === null ? [] : [claim];
            });
        },

        async getCapabilities(ref: ResolvedAgentRef): Promise<Capabilities> {
            const subject = await resolveSubject(transport, ref);
            const empty: Capabilities = {
                types: [],
                protocols: [],
                chains: [],
                tags: [],
                categories: [],
                provenance: claimProvenance(subject?.handle ?? null),
            };
            if (subject === null) return empty;

            const data = await transport.request(CAPABILITIES_QUERY, {
                subjectId: subject.handle,
                predicateIds: CAPABILITY_PREDICATE_IDS,
            });
            const rows = Array.isArray(data["triples"]) ? data["triples"] : [];

            const capabilities: Capabilities = {
                ...empty,
                provenance: claimProvenance(subject.handle),
            };
            for (const row of rows) {
                const capability = mapCapabilityRef(row);
                if (capability === null) continue;
                bucketFor(capabilities, capability).push(capability);
            }
            return capabilities;
        },

        async getMarkets(ref: ResolvedAgentRef): Promise<ClaimMarket[]> {
            const rows = await surfaceRows(ref);
            return rows.flatMap((row) => {
                const market = mapClaimMarket(row);
                return market === null ? [] : [market];
            });
        },
    };
}

function bucketFor(capabilities: Capabilities, capability: CapabilityRef): CapabilityRef[] {
    switch (capability.relation) {
        case "has-type":
            return capabilities.types;
        case "implements":
        case "uses":
        case "compatible-with":
            return capabilities.protocols;
        case "available-on":
            return capabilities.chains;
        case "has-tag":
            return capabilities.tags;
        case "has-category":
            return capabilities.categories;
    }
}
