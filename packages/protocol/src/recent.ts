import {defaultFetch, DEFAULT_TIMEOUT_MS, type FetchLike} from "./http.js";
import {isRecord, readBigInt, readNumber, readRecord, readString} from "./json.js";
import {createGraphqlTransport, type GraphqlTransport} from "./sources/intuition/graphql.js";
import {INTUITION_MAINNET_GRAPHQL} from "./sources/intuition/index.js";
import {SAME_AS, USES} from "./sources/intuition/terms.js";

/**
 * The most recent declarations, newest first.
 *
 * ## What it is for
 *
 * A front page that claims a protocol is alive has to show the protocol being alive, with the
 * actual edges and not a sample. The design handoff says so in its own words — _"the ticker and
 * event card read real declarations; if there are none, they say so, never sample data"_ — and
 * that constraint is the reason this read exists rather than a fixture.
 *
 * ## The subject filter, and why the answer is usually zero
 *
 * The `uses` predicate is **shared**. Most of what sits on it is ordinary prose: probed on mainnet
 * 2026-10-27, the five newest edges are `Optimism uses …`, `Arbitrum uses …`, `Cardano uses …`.
 * Those are not this protocol's data, so the subject must carry a `same as` edge — it must be an
 * identified ERC-8004 agent. The filter is in the **query**, not applied afterwards, for the same
 * reason `tool-listing.ts` puts it there: a caller should not be able to forget it.
 *
 * With that filter, **mainnet returns nothing** — measured 2026-10-20, 0 of 185 edges qualify.
 * That zero is **ARP's own non-activity**, not a property of the graph: nobody has run this loop
 * yet, ARP included (the user's own correction, 2026-10-27). Testnet returns the three edges the
 * rig wrote on 2026-10-20, including one agent declaring it used another.
 *
 * A caller renders an empty result as "nothing yet", never as a failure and never as a reason to
 * show something else.
 */

const RECENT_QUERY = `
query RecentDeclarations($uses: String!, $sameAs: String!, $limit: Int!) {
  triples(
    where: {
      predicate_id: {_eq: $uses}
      subject: {as_subject_triples: {predicate_id: {_eq: $sameAs}}}
    }
    order_by: {created_at: desc}
    limit: $limit
  ) {
    term_id
    created_at
    subject { term_id label }
    object { term_id label }
    term {
      total_assets
      vaults(where: {curve_id: {_eq: $curveId}}, limit: 1) { position_count }
    }
  }
}`;

export type RecentDeclaration = {
    /** The triple's term id — the claim's own market. */
    tripleId: string;
    /** When the edge was written, ISO 8601 as the indexer reports it. */
    at: string;
    subject: {atomId: string; label: string | null};
    object: {atomId: string; label: string | null};
    /**
     * What stands behind the claim, in wei, across every curve.
     *
     * Shown only when `positions > 0`. Every term is born holding `minShare`, so an unbacked claim
     * still reports a non-zero figure (ADR `0042`) — the position count is the test, never the
     * amount.
     */
    assets: bigint | null;
    positions: number;
};

export type RecentConfig = {
    graphqlUrl?: string;
    fetch?: FetchLike;
    timeoutMs?: number;
    transport?: GraphqlTransport;
    /** How many to return. Small by design: this feeds a ticker, not a page. */
    limit?: number;
    /** The curve the position count is scoped to. The amount is all-curve either way. */
    curveId?: number;
};

export async function getRecentDeclarations(
    config: RecentConfig = {},
): Promise<RecentDeclaration[]> {
    const transport =
        config.transport ??
        createGraphqlTransport({
            url: config.graphqlUrl ?? INTUITION_MAINNET_GRAPHQL,
            fetch: config.fetch ?? defaultFetch(),
            timeoutMs: config.timeoutMs ?? DEFAULT_TIMEOUT_MS,
        });

    // `$curveId` is declared `numeric`, never `String!`. Declaring it `String!` is rejected at
    // validation time and takes the whole query down — the bug that broke the trust surface on
    // 2026-09-16, which no fixture could catch because a mocked transport proves the variable was
    // passed and not that the query was valid.
    const query = RECENT_QUERY.replace(
        "query RecentDeclarations($uses: String!, $sameAs: String!, $limit: Int!)",
        "query RecentDeclarations($uses: String!, $sameAs: String!, $limit: Int!, $curveId: numeric!)",
    );

    const data = await transport.request(query, {
        uses: USES,
        sameAs: SAME_AS,
        limit: config.limit ?? 8,
        curveId: String(config.curveId ?? 1),
    });

    const rows = Array.isArray(data["triples"]) ? data["triples"] : [];
    const out: RecentDeclaration[] = [];
    for (const row of rows) {
        if (!isRecord(row)) continue;
        const tripleId = readString(row, "term_id");
        const at = readString(row, "created_at");
        const subject = readRecord(row, "subject");
        const object = readRecord(row, "object");
        const subjectId = subject === null ? null : readString(subject, "term_id");
        const objectId = object === null ? null : readString(object, "term_id");
        // A row missing any of the four is dropped rather than guessed at: a declaration without a
        // subject, an object or a date is not a declaration anybody can act on.
        if (tripleId === null || at === null || subjectId === null || objectId === null) continue;

        const term = readRecord(row, "term");
        const vaults = term === null ? [] : ((term["vaults"] as unknown[]) ?? []);
        const positions = readNumber(vaults[0] ?? null, "position_count") ?? 0;

        out.push({
            tripleId,
            at,
            subject: {atomId: subjectId, label: readString(subject, "label")},
            object: {atomId: objectId, label: readString(object, "label")},
            assets: positions > 0 ? readBigInt(term, "total_assets") : null,
            positions,
        });
    }
    return out;
}
