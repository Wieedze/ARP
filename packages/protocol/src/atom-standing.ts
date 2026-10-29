import {defaultFetch, DEFAULT_TIMEOUT_MS, type FetchLike} from "./http.js";
import {parseCaip19} from "./caip.js";
import {USES} from "./sources/intuition/terms.js";
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
query AtomStanding($atomId: String!, $curveId: numeric!, $limit: Int!, $attestor: String!) {
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
  claims: triples(
    where: {subject_id: {_eq: $atomId}}
    order_by: {term: {total_assets: desc}}
    limit: $limit
  ) {
    term_id
    predicate { term_id label }
    object { term_id label type }
    term {
      ${VAULT_SIDE}
      vaults(where: {curve_id: {_eq: $curveId}}, limit: 1) {
        positions(where: {account_id: {_eq: $attestor}, shares: {_gt: "0"}}, limit: 1) { shares }
      }
    }
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

/**
 * One edge **from** the atom — what it says about itself, rather than what others say about it.
 *
 * This read had only the incoming side until 2026-10-29, and for a whole population that made the
 * page blank: a skill atom's edges point outward (`source` to its repository, `has tag` to its
 * domain) and nothing points back at it, so a page built to render `triples(object_id)` had
 * nothing to show for 662 atoms whose facts were all on chain.
 *
 * No counter side here. A counter-triple exists for every triple, but the question "does anybody
 * disagree that this skill came from that repository" is not one this page asks — and 969 of
 * 285,775 chain-wide have ever carried a position (`measure/counter-side-usage.ts`).
 */
export type AtomClaim = {
    tripleId: string;
    /**
     * Whether the configured attestor holds a position on this claim.
     *
     * An atom's outgoing edges are where it sits in an ontology, and **an ontology is somebody's**.
     * The graph is permissionless: `design` carries `is a sub-domain of governance` from an
     * unrelated project, and a page that printed both parents the same way said ARP files design
     * under governance. It does not — measured 2026-10-29, ARP holds 1 position on
     * `design → tool` and **0** on `design → governance`.
     *
     * The incoming side is not filtered this way and should not be: who points at an atom is the
     * market, and a venue that hid the claims it did not back would be curating the thing it is
     * supposed to be counting.
     */
    attestorBacked: boolean;
    predicate: {atomId: string; label: string | null};
    object: {atomId: string; label: string | null; type: string | null};
    support: MarketSide;
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
    /** What this atom says about itself — see {@link AtomClaim}. */
    claims: AtomClaim[];
    /** `type` as the indexer resolved it — `Thing`, `Person`, `TextObject`… */
    type: string | null;
    /**
     * The `url` inside the atom's pinned Thing, when it has one — **what this atom points at**.
     *
     * The field that separates a thing from a word, and `type` does not do it: measured on mainnet
     * 1155 on 2026-10-28, the tag `Sanctioned Address` and the skill `docx` are **both** `Thing`,
     * and only the second carries a url (`https://github.com/anthropics/skills`). A tool or an
     * agent points at something that exists somewhere; a tag, a keyword or a person's name does
     * not. ADR `0051`'s framing exactly — ARP points at things.
     *
     * `null` for an atom with no pinned Thing or no url in it. Never inferred from the label.
     */
    url: string | null;
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
    /**
     * Whose positions decide which outgoing claims are ARP's own ontology.
     *
     * **Checksummed, not lowercased.** The indexer returns `positions.account_id` checksummed and a
     * filter in the wrong case matches nothing — which reads as "ARP backs none of this" rather
     * than as a bad query.
     */
    attestor?: string;
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

/** `value.thing.url`, or `null`. An empty string is `null`: the tag atoms carry `""`, not absence. */
function atomUrl(atom: Record<string, unknown> | null): string | null {
    if (atom === null) return null;
    const thing = readRecord(readRecord(atom, "value"), "thing");
    const url = thing === null ? null : readString(thing, "url");
    return url === null || url.trim() === "" ? null : url;
}

/**
 * Read one atom and everything that points at it.
 *
 * An atom nobody points at comes back with `groups: []` and `exists: true`, which is the ordinary
 * case and not an error — most atoms are the object of no triple at all. An id that resolves to
 * nothing comes back `exists: false`, so a caller can tell a typo from a quiet atom.
 */
/** Whether the attestor's filtered `positions` came back non-empty on this term's read curve. */
function heldByAttestor(term: unknown): boolean {
    if (!isRecord(term)) return false;
    const vaults = Array.isArray(term["vaults"]) ? term["vaults"] : [];
    return vaults.some((vault) => {
        if (!isRecord(vault)) return false;
        const positions = vault["positions"];
        return Array.isArray(positions) && positions.length > 0;
    });
}

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
        // An address that cannot hold a position when none is configured: every claim then comes
        // back unbacked, which is the truth rather than a silent pass.
        attestor: config.attestor ?? "0x0000000000000000000000000000000000000000",
    });

    const atomRows = Array.isArray(data["atom"]) ? data["atom"] : [];
    const atom = atomRows.length > 0 && isRecord(atomRows[0]) ? atomRows[0] : null;

    const claimRows = Array.isArray(data["claims"]) ? data["claims"] : [];
    const claims: AtomClaim[] = [];
    for (const row of claimRows) {
        if (!isRecord(row)) continue;
        const tripleId = readString(row, "term_id");
        const predicate = readRecord(row, "predicate");
        const predicateId = predicate === null ? null : readString(predicate, "term_id");
        const object = readRecord(row, "object");
        const objectId = object === null ? null : readString(object, "term_id");
        // Dropped rather than guessed, for the same reason an incoming edge is: the predicate is
        // what the claim says and the object is what it says it about. Neither has a default.
        if (tripleId === null || predicateId === null || objectId === null) continue;
        claims.push({
            tripleId,
            predicate: {atomId: predicateId, label: readString(predicate, "label")},
            object: {
                atomId: objectId,
                label: readString(object, "label"),
                type: readString(object, "type"),
            },
            support: mapMarketSide(row["term"]),
            attestorBacked: heldByAttestor(row["term"]),
        });
    }

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
        claims,
        type: atom === null ? null : readString(atom, "type"),
        pinnedUri: atom === null ? null : readString(atom, "data"),
        url: atomUrl(atom),
        market: atom === null ? null : mapMarketSide(atom["term"]),
        exists: atom !== null,
        groups,
        edgeCount: groups.reduce((total, group) => total + group.edges.length, 0),
        truncated: rows.length >= limit,
        provenance: provenance("claim", atomId),
    };
}

/**
 * The ERC-8004 identity an atom stands for, when it is an agent's.
 *
 * ## Why this exists
 *
 * An agent had **two pages**. The directory knows an agent's `chainId/tokenId` and linked to the
 * trust panel; a capability search and the claim field know only its **atom id** and linked to the
 * atom page. Same agent, two destinations, depending on where you clicked — the user's words:
 * _« que ce ne soit plus qu'une seule page qu'on accède dans tous les cas »_.
 *
 * This is the missing direction. `resolveCanonicalAgentAtom` goes ref → atom; nothing went back.
 *
 * ## It works where the agents are, and not where the rig is
 *
 * The mirror writes `(Agent 8453:6649) same as (eip155:8453/erc721:0x8004…/6649)`. Measured
 * 2026-10-28: **30,913** such edges on mainnet 1155 and the shape is exactly this. On testnet 13579
 * there are 882 `same as` edges and they are social handles — ARP's own rig agents have none, which
 * is `tasks/19` step 1b's blocker seen from the other side. So a caller gets `null` for a rig agent
 * and must treat that as "no identity found", never as "not an agent".
 *
 * One query, and it reads the edge in **both** directions: the mirror's own orientation is
 * atom → CAIP-19, but nothing in the canon forbids the reverse and a reader that assumed one would
 * silently return `null` for half the graph if that ever changed.
 */
export async function resolveAgentRefForAtom(
    atomId: string,
    config: AtomStandingConfig = {},
): Promise<{chainId: number; tokenId: string} | null> {
    const transport =
        config.transport ??
        createGraphqlTransport({
            url: config.graphqlUrl ?? INTUITION_MAINNET_GRAPHQL,
            fetch: config.fetch ?? defaultFetch(),
            timeoutMs: config.timeoutMs ?? DEFAULT_TIMEOUT_MS,
        });

    const data = await transport.request(
        `query AgentRefForAtom($atomId: String!) {
  out: triples(
    where: {subject_id: {_eq: $atomId}, predicate: {label: {_eq: "same as"}}}
    limit: 10
  ) { object { label } }
  back: triples(
    where: {object_id: {_eq: $atomId}, predicate: {label: {_eq: "same as"}}}
    limit: 10
  ) { subject { label } }
}`,
        {atomId},
    );

    const labels: string[] = [];
    for (const [key, side] of [
        ["out", "object"],
        ["back", "subject"],
    ] as const) {
        const rows = Array.isArray(data[key]) ? data[key] : [];
        for (const row of rows) {
            if (!isRecord(row)) continue;
            const other = readRecord(row, side);
            const label = other === null ? null : readString(other, "label");
            if (label !== null) labels.push(label);
        }
    }

    for (const label of labels) {
        const ref = parseCaip19(label);
        if (ref !== null) return {chainId: ref.chainId, tokenId: ref.tokenId};
    }
    return null;
}

/**
 * What each of several subjects declared using, in **one** query.
 *
 * The input a sigil needs, for a page that shows many agents at once. A tool's page lists every
 * agent that declared it, and the user asked for each one's glyph beside its claim — one read per
 * agent would be thirty-six round trips on a busy atom, which is a fan-out nobody asked for.
 *
 * Returns term ids, not names: `agent-sigil.ts`'s `moduleKey` prefers the Intuition term id for the
 * reason it gives — a tool renamed upstream must not re-draw every sigil that includes it.
 *
 * **Only `uses` edges**, matched on ADR `0030`'s frozen predicate id and never on a label. ADR
 * `0057` §5: a sigil cell is a declared tool. `implements`, `has tag` and the rest are different
 * claims, and mixing them in would make the glyph a count of assorted statements.
 *
 * The indexer caps a page at 250 rows, so a caller passing many subjects gets a **prefix**: the
 * agents at the end of the list come back with fewer modules than they have, which draws a sparser
 * glyph rather than a wrong one. Pass the subjects a page actually shows.
 */
export async function getDeclaredModulesFor(
    subjectIds: readonly string[],
    config: AtomStandingConfig & {predicateId?: string} = {},
): Promise<Record<string, string[]>> {
    if (subjectIds.length === 0) return {};

    const transport =
        config.transport ??
        createGraphqlTransport({
            url: config.graphqlUrl ?? INTUITION_MAINNET_GRAPHQL,
            fetch: config.fetch ?? defaultFetch(),
            timeoutMs: config.timeoutMs ?? DEFAULT_TIMEOUT_MS,
        });

    const data = await transport.request(
        `query DeclaredModulesFor($subjects: [String!], $predicate: String!, $limit: Int!) {
  triples(
    where: {subject_id: {_in: $subjects}, predicate_id: {_eq: $predicate}}
    limit: $limit
  ) { subject { term_id } object { term_id } }
}`,
        {
            subjects: [...new Set(subjectIds)],
            predicate: config.predicateId ?? USES,
            limit: 250,
        },
    );

    const rows = Array.isArray(data["triples"]) ? data["triples"] : [];
    const modules: Record<string, string[]> = {};
    for (const row of rows) {
        if (!isRecord(row)) continue;
        const subject = readRecord(row, "subject");
        const object = readRecord(row, "object");
        const subjectId = subject === null ? null : readString(subject, "term_id");
        const objectId = object === null ? null : readString(object, "term_id");
        if (subjectId === null || objectId === null) continue;
        const list = (modules[subjectId] ??= []);
        // A duplicate would claim a second set of cells for one tool, which reads as a busier
        // agent — the same guard `sigilModulesOf` makes for its own input.
        if (!list.includes(objectId)) list.push(objectId);
    }
    return modules;
}
