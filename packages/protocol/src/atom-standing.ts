import {defaultFetch, DEFAULT_TIMEOUT_MS, type FetchLike} from "./http.js";
import {isRecord, readRecord, readString} from "./json.js";
import {createGraphqlTransport, type GraphqlTransport} from "./sources/intuition/graphql.js";
import {mapMarketSide} from "./sources/intuition/map.js";
import {INTUITION_MAINNET_GRAPHQL} from "./sources/intuition/index.js";
import {provenanceFor} from "./provenance.js";
import type {MarketSide, Provenance} from "./types.js";

/**
 * Everything pointing **at** one atom, whatever the predicate.
 *
 * ## Why this exists
 *
 * `getToolUsage` answers one question — which agents declared `uses` on this atom — and the app had
 * only that. So a tool's atom had a page and a **tag's did not**, a category's did not, a protocol's
 * did not, and `CapabilitySection` rendered those as dead text. The user put it plainly
 * (2026-10-27): _« si les tools existent et les tags aussi et les supports aussi, pourquoi ne pas
 * avoir de page autour de ça ? »_
 *
 * They already exist. In Intuition every object of a triple **is** an atom with its own vault, so a
 * tag already has a market and nobody has to create one — measured on both chains by
 * `scripts/measure/predicate-parity.ts`. What was missing was a reader that does not presume the
 * predicate.
 *
 * ## What it returns, and what it deliberately does not
 *
 * The atom, **its own market**, and the incoming edges grouped by predicate. The atom's vault and
 * its edges' vaults are different markets and are never summed: depositing on `slither` says the
 * tool is worth something, depositing on `(agent, uses, slither)` says that one claim is true. ADR
 * `0056`.
 *
 * It carries **no evidence tier**. `tool-usage-view.ts` grades `uses` edges on `docs/14`'s ladder,
 * which is the right question on an agent's page and the wrong one here: a `has tag` edge is not
 * weak evidence of a tag, it is a declaration whose only cost is what the writer paid. Grading it
 * would invent a scale the data does not carry.
 */

/** The curve the per-vault fields are scoped to. Same copy, and the same caveat, as `tool-usage`. */
const DEFAULT_CURVE_ID = "1";

const VAULT_SIDE = `
    total_market_cap
    total_assets
    vaults(where: {curve_id: {_eq: $curveId}}, limit: 1) {
      market_cap
      total_assets
      total_shares
      current_share_price
      position_count
    }`;

/**
 * Every triple whose **object** is this atom, with both sides of each edge's market.
 *
 * `$curveId` is `numeric`, never `String!` — declaring it `String!` is rejected at validation time
 * and takes the whole query down. That bug broke the trust surface on 2026-09-16 and no fixture
 * could catch it, because a mocked transport proves the variable was passed and not that the query
 * was valid.
 *
 * No `predicate_id` filter, which is the whole point. `order_by` puts the busiest predicates'
 * edges first so a truncated read loses the quiet tail rather than an arbitrary slice.
 */
const ATOM_STANDING_QUERY = `
query AtomStanding($atomId: String!, $curveId: numeric!, $limit: Int!) {
  atom: atoms(where: {term_id: {_eq: $atomId}}, limit: 1) {
    term_id
    label
    data
    type
    term { ${VAULT_SIDE} }
  }
  triples(
    where: {object_id: {_eq: $atomId}}
    order_by: {term: {total_assets: desc}}
    limit: $limit
  ) {
    term_id
    predicate { term_id label }
    subject { term_id label type }
    term { ${VAULT_SIDE} }
    counter_term { ${VAULT_SIDE} }
  }
}`;

/** One edge pointing at the atom, and the market on that one claim. */
export type AtomEdge = {
    /** The triple's term id. Its two vaults are the market on this claim. */
    tripleId: string;
    subject: {atomId: string; label: string | null; type: string | null};
    support: MarketSide;
    /**
     * The counter-triple.
     *
     * It exists for every triple at the same price as agreement and is almost never used — 969 of
     * 285,775 triples chain-wide (`scripts/measure/counter-side-usage.ts`, 1155, 2026-10-21). Read
     * an empty one as "nobody bothered", never as agreement.
     */
    oppose: MarketSide;
};

/** The edges that share one predicate, which is the only grouping the graph itself supports. */
export type AtomEdgeGroup = {
    predicate: {atomId: string; label: string | null};
    edges: AtomEdge[];
    /** Summed over the group. **Never render without `positions`** — ADR `0023`. */
    assets: bigint;
    positions: number;
};

export type AtomStanding = {
    atomId: string;
    label: string | null;
    /** `type` as the indexer resolved it — `Thing`, `Person`, `TextObject`… */
    type: string | null;
    /** The pinned URI, when the atom has one. */
    pinnedUri: string | null;
    /**
     * The atom's **own** vault. Not a sum of its edges, and not comparable to one.
     *
     * `null` when the atom itself is not in the graph, which is different from an atom with an empty
     * market: the first means the id resolves to nothing, the second that nobody has backed it.
     */
    market: MarketSide | null;
    /** Whether the atom exists at all. An id that resolves to nothing is not an error. */
    exists: boolean;
    groups: AtomEdgeGroup[];
    /** Across every group. What a caller may print as "N things point at this". */
    edgeCount: number;
    /**
     * The read hit its limit, so `groups` is a prefix and `edgeCount` is a floor.
     *
     * Said rather than hidden: the indexer caps a page at 250 rows however large `limit` is,
     * silently (`tool-listing.ts`, `INTUITION_MAX_PAGE`). A caller printing `edgeCount` as a total
     * while this is true would state a wrong number with no way to notice.
     */
    truncated: boolean;
    provenance: Provenance;
};

export type AtomStandingConfig = {
    graphqlUrl?: string;
    fetch?: FetchLike;
    timeoutMs?: number;
    /** Stringified for the transport; Hasura coerces it to `numeric`. */
    curveId?: string | number | bigint;
    /** Rows to ask for. Clamped to the indexer's own page cap. */
    limit?: number;
    transport?: GraphqlTransport;
};

/** The indexer returns at most this many rows per query, whatever `limit` says. */
const MAX_PAGE = 250;

const provenance = provenanceFor("intuition");

/**
 * Read one atom and everything that points at it.
 *
 * An atom nobody points at comes back with `groups: []` and `exists: true`, which is the ordinary
 * case and not an error — most atoms are the object of no triple at all. An id that resolves to
 * nothing comes back `exists: false`, so a caller can tell a typo from a quiet atom.
 */
export async function getAtomStanding(
    atomId: string,
    config: AtomStandingConfig = {},
): Promise<AtomStanding> {
    const transport =
        config.transport ??
        createGraphqlTransport({
            url: config.graphqlUrl ?? INTUITION_MAINNET_GRAPHQL,
            fetch: config.fetch ?? defaultFetch(),
            timeoutMs: config.timeoutMs ?? DEFAULT_TIMEOUT_MS,
        });

    const limit = Math.min(config.limit ?? MAX_PAGE, MAX_PAGE);
    const data = await transport.request(ATOM_STANDING_QUERY, {
        atomId,
        curveId: config.curveId === undefined ? DEFAULT_CURVE_ID : String(config.curveId),
        limit,
    });

    const atomRows = Array.isArray(data["atom"]) ? data["atom"] : [];
    const atom = atomRows.length > 0 && isRecord(atomRows[0]) ? atomRows[0] : null;

    const rows = Array.isArray(data["triples"]) ? data["triples"] : [];
    // A Map, so the groups come out in the order the query ranked them rather than alphabetically.
    // The busiest predicate first is the useful order and it is the one the graph just computed.
    const byPredicate = new Map<string, AtomEdgeGroup>();

    for (const row of rows) {
        if (!isRecord(row)) continue;
        const tripleId = readString(row, "term_id");
        const predicate = readRecord(row, "predicate");
        const predicateId = predicate === null ? null : readString(predicate, "term_id");
        const subject = readRecord(row, "subject");
        const subjectId = subject === null ? null : readString(subject, "term_id");
        // A row missing any of the three is dropped rather than guessed at: the subject is who is
        // making the claim and the predicate is what the claim says, so neither has a default.
        if (tripleId === null || predicateId === null || subjectId === null) continue;

        const support = mapMarketSide(row["term"]);
        const edge: AtomEdge = {
            tripleId,
            subject: {
                atomId: subjectId,
                label: readString(subject, "label"),
                type: readString(subject, "type"),
            },
            support,
            oppose: mapMarketSide(row["counter_term"]),
        };

        const existing = byPredicate.get(predicateId);
        if (existing === undefined) {
            byPredicate.set(predicateId, {
                predicate: {atomId: predicateId, label: readString(predicate, "label")},
                edges: [edge],
                assets: support.totalAssets ?? 0n,
                positions: support.positionCount ?? 0,
            });
        } else {
            existing.edges.push(edge);
            existing.assets += support.totalAssets ?? 0n;
            existing.positions += support.positionCount ?? 0;
        }
    }

    const groups = [...byPredicate.values()];
    return {
        atomId,
        label: atom === null ? null : readString(atom, "label"),
        type: atom === null ? null : readString(atom, "type"),
        pinnedUri: atom === null ? null : readString(atom, "data"),
        market: atom === null ? null : mapMarketSide(atom["term"]),
        exists: atom !== null,
        groups,
        edgeCount: groups.reduce((total, group) => total + group.edges.length, 0),
        truncated: rows.length >= limit,
        provenance: provenance("claim", atomId),
    };
}
