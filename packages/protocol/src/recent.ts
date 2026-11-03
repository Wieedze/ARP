import {
    createGraphqlTransport,
    DEFAULT_TIMEOUT_MS,
    defaultFetch,
    type FetchLike,
    type GraphqlTransport,
    isRecord,
    readBigInt,
    readNumber,
    readRecord,
    readString,
    RECENT_QUERY,
    RECENT_STAKES_QUERY,
} from "@arp-protocol/graphql";
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

export type RecentDeclaration = {
    /** The triple's term id — the claim's own market. */
    tripleId: string;
    /** When the edge was written, ISO 8601 as the indexer reports it. */
    at: string;
    /** The transaction that created the triple, so a reader can open it on the explorer. */
    txHash: string | null;
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
    graphqlUrl: string;
    fetch?: FetchLike;
    timeoutMs?: number;
    transport?: GraphqlTransport;
    /** How many to return. Small by design: this feeds a ticker, not a page. */
    limit?: number;
    /** The curve the position count is scoped to. The amount is all-curve either way. */
    curveId?: number;
};

export async function getRecentDeclarations(config: RecentConfig): Promise<RecentDeclaration[]> {
    const transport =
        config.transport ??
        createGraphqlTransport({
            url: config.graphqlUrl,
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
        const rawVaults = term === null ? null : term["vaults"];
        const vaults = Array.isArray(rawVaults) ? rawVaults : [];
        const positions = readNumber(vaults[0] ?? null, "position_count") ?? 0;

        out.push({
            tripleId,
            at,
            txHash: readString(row, "transaction_hash"),
            subject: {atomId: subjectId, label: readString(subject, "label")},
            object: {atomId: objectId, label: readString(object, "label")},
            assets: positions > 0 ? readBigInt(term, "total_assets") : null,
            positions,
        });
    }
    return out;
}

/** A deposit or a redemption on an identified agent's declaration. */
export type RecentStake = {
    /** The indexer's event id, `<tx>-<log index>`: stable across reads, unlike a position in the list. */
    id: string;
    kind: "deposit" | "redeem";
    /** When it landed, ISO 8601 as the indexer reports it. */
    at: string;
    txHash: string | null;
    /** The declaration it was made on. */
    tripleId: string;
    subject: {atomId: string; label: string | null};
    object: {atomId: string; label: string | null};
    /** Who signed it. */
    account: string | null;
    /**
     * Whose position it is. Not always the signer: ARP's sponsoring service is built to sign a
     * deposit whose position is the agent operator's (ADR `0094`), so "is this mine" asks this field
     * too. The service has not run yet (`.claude/STATE.md`, task 40), so today the two are equal.
     */
    receiver: string | null;
    /** In wei: after fees for a deposit, what came back for a redemption. */
    assets: bigint | null;
};

/**
 * The most recent deposits and redemptions on agent declarations, merged newest first.
 *
 * `limit` bounds each of the two lists, so up to twice that many come back. Empty is an answer,
 * as for `getRecentDeclarations`.
 */
export async function getRecentStakes(
    config: Omit<RecentConfig, "curveId">,
): Promise<RecentStake[]> {
    const transport =
        config.transport ??
        createGraphqlTransport({
            url: config.graphqlUrl,
            fetch: config.fetch ?? defaultFetch(),
            timeoutMs: config.timeoutMs ?? DEFAULT_TIMEOUT_MS,
        });

    const data = await transport.request(RECENT_STAKES_QUERY, {
        uses: USES,
        sameAs: SAME_AS,
        limit: config.limit ?? 20,
    });

    const out: RecentStake[] = [
        ...readStakes(data["deposits"], "deposit", "assets_after_fees"),
        ...readStakes(data["redemptions"], "redeem", "assets"),
    ];
    // ISO 8601 with one offset throughout, so the strings sort as the instants do.
    return out.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
}

function readStakes(rows: unknown, kind: RecentStake["kind"], assetsField: string): RecentStake[] {
    if (!Array.isArray(rows)) return [];
    const out: RecentStake[] = [];
    for (const row of rows) {
        if (!isRecord(row)) continue;
        const id = readString(row, "id");
        const at = readString(row, "created_at");
        const triple = readRecord(readRecord(row, "term"), "triple");
        const tripleId = triple === null ? null : readString(triple, "term_id");
        const subject = readRecord(triple, "subject");
        const object = readRecord(triple, "object");
        const subjectId = subject === null ? null : readString(subject, "term_id");
        const objectId = object === null ? null : readString(object, "term_id");
        if (
            id === null ||
            at === null ||
            tripleId === null ||
            subjectId === null ||
            objectId === null
        )
            continue;
        out.push({
            id,
            kind,
            at,
            txHash: readString(row, "transaction_hash"),
            tripleId,
            subject: {atomId: subjectId, label: readString(subject, "label")},
            object: {atomId: objectId, label: readString(object, "label")},
            account: readString(row, "sender_id"),
            receiver: readString(row, "receiver_id"),
            assets: readBigInt(row, assetsField),
        });
    }
    return out;
}
