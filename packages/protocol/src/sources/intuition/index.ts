import {toCaip19} from "../../caip.js";
import {
    AGENT_EDGE_LIMIT,
    CAPABILITIES_QUERY,
    COHORT_ORDER_BY,
    COHORT_QUERY,
    createGraphqlTransport,
    defaultFetch,
    type FetchLike,
    type GraphqlTransport,
    isRecord,
    readNumber,
    readRecord,
    readString,
    RESOLVE_AGENT_QUERY,
    TRUST_SURFACE_QUERY,
} from "@arp-protocol/graphql";
import type {
    AgentIdentity,
    AgentPage,
    Capabilities,
    CapabilityRef,
    ClaimMarket,
    Provenance,
    ProviderClaim,
    ResolvedAgentRef,
    ResolvedListAgentsOptions,
} from "../../types.js";
import type {TrustSource} from "../source.js";
import {
    claimProvenance,
    derivedProvenance,
    INTUITION_SOURCE_ID,
    mapAgentListing,
    mapCapabilityRef,
    mapClaimMarket,
    mapMetadata,
    mapProviderClaim,
} from "./map.js";
import {
    CAPABILITY_PREDICATE_IDS,
    ERC8004,
    IMPLEMENT,
    SAME_AS,
    TRUST_PREDICATE_IDS,
} from "./terms.js";

export const INTUITION_MAINNET_GRAPHQL = "https://mainnet.intuition.sh/v1/graphql";
export const INTUITION_TESTNET_GRAPHQL = "https://testnet.intuition.sh/v1/graphql";

/**
 * The bonding curve market reads are filtered to.
 *
 * `1` is the MultiVault default on mainnet today and that is not a guarantee —
 * it comes from `getBondingCurveConfig()`, which governance can change. A caller
 * that also writes should pass the value it read from chain, so the market it
 * renders and the vault it deposits into are the same one. This is the only
 * copy in the package: every read defaults to it, every write reads the chain
 * (ADR `0115`).
 */
export const DEFAULT_CURVE_ID = "1";

/**
 * Deadline for the cohort listing, separate from every other read.
 *
 * `DEFAULT_TIMEOUT_MS` is 10s, and this endpoint has been measured completing a
 * correct cohort query in 9.1s — so the shared budget truncates reads that were
 * going to succeed. Three independent measurement sessions against mainnet on
 * 2026-09-16, `limit: 25`:
 *
 *   | session | evidence-quantity      | economic-conviction               |
 *   | ------- | ---------------------- | --------------------------------- |
 *   | A       | 0.78, 0.78, 0.83       | 0.82, 8.3, cut at 25, cut at 25   |
 *   | B       | 0.64 – 3.4 (ad hoc)    | 0.82 – 9.1 (ad hoc)               |
 *   | C       | 2.21 – 2.62 (n=10)     | 2.10 – 2.32 (n=10), no failures   |
 *
 * The orders are not separable: in session C the "expensive" aggregate sort was
 * marginally *faster* than the cheap one, and the order that timed out twice in
 * session A ran clean twenty times in session C. What moves is the endpoint,
 * not the query — so a budget picked per order would be fitting noise.
 *
 * 30s, because: it is over three times the slowest completed read anyone has
 * observed (9.1s); it is above 25s, the ceiling at which the only two
 * non-completions were cut, so a read that would have landed just past there
 * still gets to; and with the one retry the UI performs it caps a hung list at
 * 60s, which is already the outer edge of what a list view should make somebody
 * wait. Override with `listTimeoutMs` if your endpoint is better behaved.
 */
export const DEFAULT_LIST_TIMEOUT_MS = 30_000;

export type IntuitionSourceConfig = {
    graphqlUrl: string;
    fetch?: FetchLike;
    timeoutMs?: number;
    /**
     * Bonding curve for market reads. Defaults to {@link DEFAULT_CURVE_ID}.
     * Accepts bigint so a value read straight from the contract needs no
     * conversion at the call site.
     */
    curveId?: string | number | bigint;
    /**
     * Deadline for `listAgents` only. Defaults to {@link DEFAULT_LIST_TIMEOUT_MS}.
     *
     * Separate from `timeoutMs` because ordering the whole cohort by an
     * aggregate is a different kind of read from resolving one agent, and one
     * budget for both either cuts off a cohort read that was going to succeed
     * or lets a hung point lookup sit for the cohort's budget.
     */
    listTimeoutMs?: number;
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
 * taking the other side. It is also the only one that can answer `listAgents`,
 * because a registry contract has no enumeration. It is at the same time the
 * narrowest in coverage — it mirrors Base only, so agents registered on BSC or
 * Ethereum resolve to `null` here and are picked up by the registry source
 * instead. The cohort it can list is therefore the Base mirror, not every
 * ERC-8004 agent that exists.
 *
 * Every method runs its own preflight. That costs a round trip per call and is
 * deliberate: the methods are independently callable, and this package ships no
 * cache (see the README).
 */
export function intuitionSource(config: IntuitionSourceConfig): TrustSource {
    // `curve_id` is a Hasura `numeric`, which accepts a JSON string for the
    // variable's value. Stringifying here means a bigint read straight from
    // getBondingCurveConfig() needs no conversion at the call site.
    const curveId = config.curveId === undefined ? DEFAULT_CURVE_ID : String(config.curveId);

    const listTimeoutMs = config.listTimeoutMs ?? DEFAULT_LIST_TIMEOUT_MS;

    const transport =
        config.transport ??
        createGraphqlTransport({
            url: config.graphqlUrl,
            fetch: config.fetch ?? defaultFetch(),
            ...(config.timeoutMs === undefined ? {} : {timeoutMs: config.timeoutMs}),
        });

    async function surfaceRows(
        ref: ResolvedAgentRef,
    ): Promise<{rows: unknown[]; truncated: boolean}> {
        const subject = await resolveSubject(transport, ref);
        if (subject === null) return {rows: [], truncated: false};
        const data = await transport.request(TRUST_SURFACE_QUERY, {
            subjectId: subject.handle,
            predicateIds: TRUST_PREDICATE_IDS,
            curveId,
            limit: AGENT_EDGE_LIMIT,
        });
        const rows = Array.isArray(data["triples"]) ? data["triples"] : [];
        return {rows, truncated: rows.length >= AGENT_EDGE_LIMIT};
    }

    function marked<T extends {provenance: Provenance}>(value: T, truncated: boolean): T {
        return truncated ? {...value, provenance: {...value.provenance, truncated: true}} : value;
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
            const {rows, truncated} = await surfaceRows(ref);
            return rows.flatMap((row) => {
                const claim = mapProviderClaim(row);
                return claim === null ? [] : [marked(claim, truncated)];
            });
        },

        async getCapabilities(ref: ResolvedAgentRef): Promise<Capabilities> {
            const subject = await resolveSubject(transport, ref);
            const empty: Capabilities = {
                types: [],
                protocols: [],
                tools: [],
                chains: [],
                tags: [],
                categories: [],
                provenance: claimProvenance(subject?.handle ?? null),
            };
            if (subject === null) return empty;

            const data = await transport.request(CAPABILITIES_QUERY, {
                subjectId: subject.handle,
                predicateIds: CAPABILITY_PREDICATE_IDS,
                limit: AGENT_EDGE_LIMIT,
            });
            const rows = Array.isArray(data["triples"]) ? data["triples"] : [];

            const capabilities: Capabilities = {
                ...empty,
                provenance: marked(
                    {provenance: claimProvenance(subject.handle)},
                    rows.length >= AGENT_EDGE_LIMIT,
                ).provenance,
            };
            for (const row of rows) {
                const capability = mapCapabilityRef(row);
                if (capability === null) continue;
                bucketFor(capabilities, capability).push(capability);
            }
            return capabilities;
        },

        async getMarkets(ref: ResolvedAgentRef): Promise<ClaimMarket[]> {
            const {rows, truncated} = await surfaceRows(ref);
            return rows.flatMap((row) => {
                const market = mapClaimMarket(row);
                return market === null ? [] : [marked(market, truncated)];
            });
        },

        /**
         * One page of the mirrored ERC-8004 cohort.
         *
         * The only method here that does not start from an identity, and the
         * only one that can answer at all: the graph is the sole source that
         * knows the population exists. Membership, the order and the total all
         * come from the same `implement` → `ERC-8004` filter, so the count the
         * caller renders is the count of the thing it is paging through.
         *
         * The page is ordered by the indexer and returned untouched. Sorting it
         * again here would produce a page ordered against itself — correct
         * within the window, wrong about the cohort.
         */
        async listAgents(options: ResolvedListAgentsOptions): Promise<AgentPage> {
            const data = await transport.request(
                COHORT_QUERY,
                {
                    where: cohortWhere(options.name),
                    sameAsPredicateId: SAME_AS,
                    // The same set `getCapabilities` reads, not a second list beside it: a row's
                    // glyph and the agent's own capability section must be drawn from one
                    // vocabulary or they disagree about what the agent declared.
                    capabilityPredicateIds: [...CAPABILITY_PREDICATE_IDS],
                    orderBy: COHORT_ORDER_BY[options.order],
                    limit: options.limit,
                    offset: options.offset,
                },
                {timeoutMs: listTimeoutMs},
            );

            const rows = Array.isArray(data["triples"]) ? data["triples"] : [];
            return {
                sourceId: INTUITION_SOURCE_ID,
                order: options.order,
                limit: options.limit,
                offset: options.offset,
                total: readNumber(readRecord(data["total"], "aggregate"), "count"),
                agents: rows.flatMap((row) => {
                    const listing = mapAgentListing(row);
                    return listing === null ? [] : [listing];
                }),
            };
        },
    };
}

function bucketFor(capabilities: Capabilities, capability: CapabilityRef): CapabilityRef[] {
    switch (capability.relation) {
        case "has-type":
            return capabilities.types;
        case "implements":
        case "supports-protocol":
        case "compatible-with":
            return capabilities.protocols;
        case "uses-tool":
            return capabilities.tools;
        case "available-on":
            return capabilities.chains;
        case "has-tag":
            return capabilities.tags;
        case "has-category":
            return capabilities.categories;
    }
}

/**
 * The cohort filter: membership by term id on both ends, always, and a name match only when one
 * was asked for. The name is looked for in the atom's label **or** in the name its pinned Thing
 * publishes, because the list shows the second when there is one (`mapMetadata`): a search on the
 * label alone would find an agent by a name the reader never sees. The name's own `%`, `_` and backslash are escaped, so a search for `50%` matches those
 * three characters and not everything starting with 50.
 */
export function cohortWhere(name: string | null): Record<string, unknown> {
    const membership = {predicate_id: {_eq: IMPLEMENT}, object_id: {_eq: ERC8004}};
    if (name === null) return membership;
    const escaped = name.replace(/[\\%_]/g, (match) => `\\${match}`);
    const pattern = `%${escaped}%`;
    return {
        ...membership,
        subject: {_or: [{label: {_ilike: pattern}}, {value: {thing: {name: {_ilike: pattern}}}}]},
    };
}
