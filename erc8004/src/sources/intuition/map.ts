import {parseCaip19} from "../../caip.js";
import {isRecord, readArray, readBigInt, readNumber, readRecord, readString} from "../../json.js";
import {provenanceFor} from "../../provenance.js";
import type {
    AgentAtomMarket,
    AgentListing,
    AgentMetadata,
    CapabilityRef,
    CapabilityRelation,
    ClaimMarket,
    ClaimRelation,
    MarketSide,
    Provenance,
    ProviderClaim,
    ResolvedAgentRef,
} from "../../types.js";
import {IDENTITY_SAMPLE_LIMIT} from "./queries.js";
import {
    AVAILABLE_ON,
    COMPATIBLE_WITH,
    HAS_CATEGORY,
    HAS_TAG,
    HAS_TRUST_ASSESSMENT,
    HAS_TRUST_PROVIDER,
    HAS_TYPE,
    IMPLEMENT,
    USE,
    USES,
} from "./terms.js";

export const INTUITION_SOURCE_ID = "intuition";

/**
 * The shape the indexer synthesises for an agent that declared no metadata of
 * its own: `Agent 8453:6649`, described as `ERC-8004 agent 8453:6649`. Half the
 * mainnet cohort looks like this, and presenting it as a self-declared name
 * would overstate what the graph knows.
 *
 * This is a heuristic on a naming convention, so anything derived from it is
 * marked `heuristic` in provenance rather than `claim`.
 */
export const FALLBACK_NAME_PATTERN = /^Agent \d+:\d+$/;

const provenance = provenanceFor(INTUITION_SOURCE_ID);

export function claimProvenance(origin: string | null): Provenance {
    return provenance("claim", origin);
}

export function derivedProvenance(origin: string | null, note?: string): Provenance {
    return provenance("derived", origin, note);
}

function thingOf(atom: unknown): Record<string, unknown> | null {
    const value = readRecord(atom, "value");
    return value === null ? null : readRecord(value, "thing");
}

export function mapMetadata(atom: unknown): AgentMetadata {
    const thing = thingOf(atom);
    const label = readString(atom, "label");
    const name = thing === null ? label : (readString(thing, "name") ?? label);
    return {
        name,
        description: thing === null ? null : readString(thing, "description"),
        image: thing === null ? null : readString(thing, "image"),
        url: thing === null ? null : readString(thing, "url"),
        isFallback: name !== null && FALLBACK_NAME_PATTERN.test(name),
    };
}

const CLAIM_RELATIONS: Record<string, ClaimRelation> = {
    [HAS_TRUST_PROVIDER]: "has-trust-provider",
    [HAS_TRUST_ASSESSMENT]: "has-trust-assessment",
};

const CAPABILITY_RELATIONS: Record<string, CapabilityRelation> = {
    [HAS_TYPE]: "has-type",
    [IMPLEMENT]: "implements",
    [USE]: "uses",
    [USES]: "uses",
    [COMPATIBLE_WITH]: "compatible-with",
    [AVAILABLE_ON]: "available-on",
    [HAS_TAG]: "has-tag",
    [HAS_CATEGORY]: "has-category",
};

/**
 * One row of the trust surface.
 *
 * `resolverUrl` comes from `object.value.thing.url` — the parsed metadata, which
 * is the live document. `object.data` holds the atom's pinned `ipfs://` URI: the
 * snapshot the atom was minted from, not the current assessment. Reading the
 * resolver from `data` would serve a frozen document as if it were live, which
 * is the single most consequential mistake available in this package. They are
 * kept in separate fields so the two can never be confused downstream.
 */
export function mapProviderClaim(row: unknown): ProviderClaim | null {
    if (!isRecord(row)) return null;
    const predicateId = readString(readRecord(row, "predicate"), "term_id");
    if (predicateId === null) return null;
    const relation = CLAIM_RELATIONS[predicateId];
    if (relation === undefined) return null;

    const object = readRecord(row, "object");
    const thing = thingOf(object);
    const handle = readString(row, "term_id");

    return {
        relation,
        label: object === null ? null : readString(object, "label"),
        provider: {
            name: thing === null ? null : readString(thing, "name"),
            description: thing === null ? null : readString(thing, "description"),
            image: thing === null ? null : readString(thing, "image"),
            url: thing === null ? null : readString(thing, "url"),
            sourceHandle: object === null ? null : readString(object, "term_id"),
        },
        resolverUrl: thing === null ? null : readString(thing, "url"),
        pinnedUri: object === null ? null : readString(object, "data"),
        sourceHandle: handle,
        provenance: claimProvenance(handle),
    };
}

function mapMarketSide(side: unknown): MarketSide {
    const vaults = isRecord(side) && Array.isArray(side["vaults"]) ? side["vaults"] : [];
    const vault = vaults.length > 0 ? vaults[0] : null;
    return {
        totalMarketCap: readBigInt(side, "total_market_cap"),
        totalAssets: readBigInt(side, "total_assets"),
        marketCap: readBigInt(vault, "market_cap"),
        totalShares: readBigInt(vault, "total_shares"),
        currentSharePrice: readBigInt(vault, "current_share_price"),
        positionCount: readNumber(vault, "position_count"),
    };
}

/** The support and opposition markets on one claim edge. */
export function mapClaimMarket(row: unknown): ClaimMarket | null {
    if (!isRecord(row)) return null;
    const claimHandle = readString(row, "term_id");
    const predicateId = readString(readRecord(row, "predicate"), "term_id");
    if (claimHandle === null || predicateId === null) return null;
    const relation = CLAIM_RELATIONS[predicateId];
    if (relation === undefined) return null;

    return {
        claimHandle,
        relation,
        label: readString(readRecord(row, "object"), "label"),
        support: mapMarketSide(row["term"]),
        opposition: mapMarketSide(row["counter_term"]),
        provenance: claimProvenance(claimHandle),
    };
}

/** One capability edge, or null when the predicate is not one this package maps. */
export function mapCapabilityRef(row: unknown): CapabilityRef | null {
    if (!isRecord(row)) return null;
    const predicateId = readString(readRecord(row, "predicate"), "term_id");
    if (predicateId === null) return null;
    const relation = CAPABILITY_RELATIONS[predicateId];
    if (relation === undefined) return null;

    const object = readRecord(row, "object");
    const thing = thingOf(object);
    return {
        relation,
        label: object === null ? null : readString(object, "label"),
        name: thing === null ? null : readString(thing, "name"),
        url: thing === null ? null : readString(thing, "url"),
        sourceHandle: object === null ? null : readString(object, "term_id"),
    };
}

function readAggregateCount(source: unknown, key: string): number | null {
    return readNumber(readRecord(readRecord(source, key), "aggregate"), "count");
}

/**
 * The market on the agent's own atom, read at one consistent scope.
 *
 * `total_market_cap` on a term sums every bonding curve, so the position count
 * beside it is summed the same way. See `AgentAtomMarket` for why that makes it
 * a position count and not a distinct-staker count.
 */
function mapAtomMarket(term: unknown): AgentAtomMarket | null {
    if (!isRecord(term)) return null;
    const aggregate = readRecord(readRecord(term, "vaults_aggregate"), "aggregate");
    return {
        totalMarketCap: readBigInt(term, "total_market_cap"),
        positionCount: readNumber(readRecord(aggregate, "sum"), "position_count"),
        vaultCount: readNumber(aggregate, "count"),
    };
}

/**
 * The ERC-8004 identities an agent atom claims, from its `same as` edges.
 *
 * Read from the edge object's parsed `name`, falling back to its label, and
 * always through `parseCaip19` — an identity is never recovered by picking
 * digits out of a display label. Edges that are not ERC-8004 asset ids are
 * dropped rather than guessed at: Clawnch's second `same as` edge is
 * `did:web:clawn.ch`, which is a true statement about a different namespace.
 */
function mapIdentities(atom: unknown): ResolvedAgentRef[] {
    const refs: ResolvedAgentRef[] = [];
    const seen = new Set<string>();
    for (const edge of readArray(atom, "identity")) {
        const object = readRecord(edge, "object");
        const thing = thingOf(object);
        const value =
            (thing === null ? null : readString(thing, "name")) ?? readString(object, "label");
        if (value === null) continue;
        const ref = parseCaip19(value);
        if (ref === null) continue;
        const key = `${ref.chainId}:${ref.registry}:${ref.tokenId}`;
        if (seen.has(key)) continue;
        seen.add(key);
        refs.push(ref);
    }
    return refs;
}

/**
 * One cohort row: the agent atom, its statement count, its own market, and the
 * identity it resolves to.
 *
 * `ref` is set only when exactly one ERC-8004 identity is established *and*
 * every `same as` edge was read. An atom carrying more edges than were sampled
 * could be hiding a second identity behind them, and one mainnet atom —
 * `Ouro Proof-of-Compute Oracle` — claims sixteen token ids on its own. Picking
 * the first would link a reader to an agent this row may not be about.
 */
export function mapAgentListing(row: unknown): AgentListing | null {
    const atom = readRecord(row, "subject");
    if (atom === null) return null;
    const handle = readString(atom, "term_id");
    if (handle === null) return null;

    const identities = mapIdentities(atom);
    const identityEdgeCount = readAggregateCount(atom, "identityCount");
    const sampleWasComplete =
        identityEdgeCount !== null && identityEdgeCount <= IDENTITY_SAMPLE_LIMIT;
    const isIdentityAmbiguous = identities.length > 1 || !sampleWasComplete;

    return {
        sourceHandle: handle,
        ref: isIdentityAmbiguous ? null : (identities[0] ?? null),
        identities,
        identityEdgeCount,
        isIdentityAmbiguous,
        metadata: mapMetadata(atom),
        statementCount: readAggregateCount(atom, "as_subject_triples_aggregate"),
        market: mapAtomMarket(atom["term"]),
        provenance: claimProvenance(handle),
    };
}
