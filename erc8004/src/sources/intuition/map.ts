import {isRecord, readBigInt, readNumber, readRecord, readString} from "../../json.js";
import {provenanceFor} from "../../provenance.js";
import type {
    AgentMetadata,
    CapabilityRef,
    CapabilityRelation,
    ClaimMarket,
    ClaimRelation,
    MarketSide,
    Provenance,
    ProviderClaim,
} from "../../types.js";
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
