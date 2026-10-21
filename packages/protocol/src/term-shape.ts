import {createGraphqlTransport, type GraphqlTransport} from "./sources/intuition/graphql.js";
import {defaultFetch, type FetchLike} from "./http.js";
import {isRecord, readString} from "./json.js";

/**
 * What a claim's market looks like, in dimensions rather than in a score.
 *
 * ## Why four numbers and not one
 *
 * A term reporting "34,421 positions" tells a reader nothing. Measured on mainnet 1155 on
 * 2026-10-21, the busiest term on the graph has exactly that — and **its largest single position
 * holds 31.2% of the weight, its top three hold 69.7%**. The count says a crowd; the concentration
 * says three accounts. Both are true and only one is visible from a count.
 *
 * So `listTools`-style counts are not enough, and a composite score is not the answer either: ARP
 * publishes none (ADR `0046`), and the moment a badge exists people optimise for the badge. A sybil
 * costs **0.01 TRUST per address** on this graph — $0.00005 at $0.005/TRUST — so any two metrics
 * that grant a badge are two metrics somebody will manufacture for nothing.
 *
 * What is left is to hand the reader the dimensions and let them filter. Four, each answering a
 * question a reader would actually ask:
 *
 * | question | field |
 * | --- | --- |
 * | a few big holders, or many? | {@link TermShape.largestShare}, {@link TermShape.topThreeShare} |
 * | all at once, or over time? | {@link TermShape.firstDeposit}, {@link TermShape.lastDeposit} |
 * | do its backers exist elsewhere? | {@link TermShape.medianBackerBreadth} |
 * | how many agents actually used it? | not here — that is `getToolUsage`, a different axis |
 *
 * ## What the breadth figure is worth, stated rather than implied
 *
 * It catches the lazy sybil and not the competent one. Airdrop farming is an industry, and a farmer
 * gives each address a deliberate history — a few transactions, a few positions, spread over weeks —
 * because every snapshot checks the naive signals. So "holds no other position" is a floor, not a
 * test.
 *
 * What stays hard to fake is **independence**: a common funding source (not visible through this
 * indexer — it needs chain-level reads), correlated timing, and overlapping holdings. The last of
 * those is the strongest available signal and is **not** computed here: it is pairwise over a term's
 * backers, so its cost grows with the square of their number. `FUTURE.md` carries the reasoning.
 */
export type TermShape = {
    termId: string;
    /** The bonding curve these figures were read at. Never summed across curves. */
    curveId: number;
    /** Every position on this term's vault, from an aggregate — exact. */
    positionCount: number;
    /** Shares summed across them. Exact. */
    totalShares: bigint;
    /**
     * The largest single position, as a fraction of `totalShares`, in basis points.
     *
     * **Exact**, despite the page cap: the largest position comes from an ordered read of one row
     * and the denominator from an aggregate, so neither is sampled.
     *
     * `null` when the term has no positions — a term exists with `minShare` in its vault and nobody
     * behind it (ADR `0042`), and a share-of-nothing is not zero, it is undefined.
     */
    largestShareBps: number | null;
    /** The three largest together, same basis. `null` for the same reason. */
    topThreeShareBps: number | null;
    /** When the first and last deposit landed. Same-hour arrival is the cheapest sybil signature. */
    firstDeposit: string | null;
    lastDeposit: string | null;
    /**
     * The median number of **other** terms this term's backers hold a position on.
     *
     * "Other", not "any": a backer holds at least this one by definition, and an earlier draft of
     * this said "no position" where it meant "no other position".
     *
     * **A sample when `backersRead` is capped.** The indexer returns at most 100 `positions` rows
     * per page — probed; `limit: 250` also returns 100, where `atoms` and `triples` cap at 250. For
     * a term with more backers than that, this is the median over the hundred largest, which skews
     * high. {@link backersRead} and {@link backersSampled} say which case it is.
     */
    medianBackerBreadth: number | null;
    backersRead: number;
    /** True when the page cap was hit, so `medianBackerBreadth` is over a prefix, not the whole set. */
    backersSampled: boolean;
};

/** One bucket of a term's activity over time. */
export type TermActivityBucket = {
    /** The bucket's start, ISO 8601. */
    bucket: string;
    /** Deposits that landed in it. */
    deposits: number;
    /** Their volume, in wei of shares. */
    volume: bigint;
};

export type TermActivityGrain = "hour" | "day" | "week" | "month";

export type TermShapeConfig = {
    graphqlUrl?: string;
    fetch?: FetchLike;
    timeoutMs?: number;
    transport?: GraphqlTransport;
    curveId?: number;
    /** How many backers to read before taking the median. Clamped at the indexer's 100. */
    backerLimit?: number;
};

/**
 * The indexer's hard cap on a `positions` page, which is **lower than `atoms` and `triples`**.
 *
 * Probed on mainnet 2026-10-21: `limit: 100` returns 100, `limit: 250` also returns 100 — silently,
 * no error, no flag. `INTUITION_MAX_PAGE` is 250 and applies to the other tables; using it here
 * would make a `backersSampled` flag computed against it unreachable, which is the shape of defect
 * `tool-listing.ts` already carried once.
 */
export const INTUITION_MAX_POSITIONS_PAGE = 100;

const DEFAULT_CURVE_ID = 1;
const DEFAULT_TIMEOUT_MS = 10_000;
const INTUITION_MAINNET_GRAPHQL = "https://mainnet.intuition.sh/v1/graphql";

const SHAPE_QUERY = `
query TermShape($termId: String!, $curveId: numeric!, $limit: Int!) {
  agg: positions_aggregate(where: {term_id: {_eq: $termId}, curve_id: {_eq: $curveId}}) {
    aggregate { count sum { shares } }
  }
  first: positions(
    where: {term_id: {_eq: $termId}, curve_id: {_eq: $curveId}}
    order_by: {created_at: asc}
    limit: 1
  ) { created_at }
  last: positions(
    where: {term_id: {_eq: $termId}, curve_id: {_eq: $curveId}}
    order_by: {created_at: desc}
    limit: 1
  ) { created_at }
  backers: positions(
    where: {term_id: {_eq: $termId}, curve_id: {_eq: $curveId}}
    order_by: {shares: desc}
    limit: $limit
  ) { account_id shares }
}`;

const ACTIVITY_QUERIES: Record<TermActivityGrain, string> = {
    hour: "signal_stats_hourly",
    day: "signal_stats_daily",
    week: "signal_stats_weekly",
    month: "signal_stats_monthly",
};

function bigintFrom(value: unknown): bigint {
    const text =
        typeof value === "string" ? value : typeof value === "number" ? String(value) : null;
    if (text === null || !/^\d+$/.test(text)) return 0n;
    return BigInt(text);
}

/**
 * A count from the indexer, which sends some of them as **strings**.
 *
 * `signal_stats_*.count` comes back as `"5"`, not `5` — probed on mainnet 2026-10-21 after this
 * function returned 0 for every bucket while `volume` read correctly. Accepting only `number` made
 * a whole column silently zero, which is the same class as the `market.totalAssets` defect
 * `STATE.md` records: a field whose type was assumed rather than read.
 */
function numberFrom(value: unknown): number {
    if (typeof value === "number") return Number.isFinite(value) ? value : 0;
    if (typeof value === "string" && /^\d+$/.test(value)) return Number(value);
    return 0;
}

/** Basis points of `part` in `whole`, or `null` when `whole` is zero. */
function shareBps(part: bigint, whole: bigint): number | null {
    if (whole <= 0n) return null;
    return Number((part * 10_000n) / whole);
}

function median(values: number[]): number | null {
    if (values.length === 0) return null;
    const sorted = [...values].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    // Even length takes the lower of the two middles rather than their mean: these are counts, and
    // "half its backers hold 12.5 other positions" is not a sentence about anything.
    return sorted.length % 2 === 0 ? (sorted[middle - 1] ?? null) : (sorted[middle] ?? null);
}

function buildTransport(config: TermShapeConfig): GraphqlTransport {
    return (
        config.transport ??
        createGraphqlTransport({
            url: config.graphqlUrl ?? INTUITION_MAINNET_GRAPHQL,
            fetch: config.fetch ?? defaultFetch(),
            timeoutMs: config.timeoutMs ?? DEFAULT_TIMEOUT_MS,
        })
    );
}

export async function getTermShape(
    termId: string,
    config: TermShapeConfig = {},
): Promise<TermShape> {
    const transport = buildTransport(config);
    const curveId = config.curveId ?? DEFAULT_CURVE_ID;
    const limit = Math.min(config.backerLimit ?? INTUITION_MAX_POSITIONS_PAGE, INTUITION_MAX_POSITIONS_PAGE);

    const data = await transport.request(SHAPE_QUERY, {
        termId,
        curveId: String(curveId),
        limit,
    });

    const agg = isRecord(data["agg"]) ? data["agg"] : null;
    const aggregate = agg !== null && isRecord(agg["aggregate"]) ? agg["aggregate"] : null;
    const sum = aggregate !== null && isRecord(aggregate["sum"]) ? aggregate["sum"] : null;
    const positionCount = aggregate === null ? 0 : numberFrom(aggregate["count"]);
    const totalShares = sum === null ? 0n : bigintFrom(sum["shares"]);

    const rowsOf = (key: string) => (Array.isArray(data[key]) ? data[key] : []);
    const firstRow = rowsOf("first")[0];
    const lastRow = rowsOf("last")[0];

    const backers: {accountId: string; shares: bigint}[] = [];
    for (const row of rowsOf("backers")) {
        if (!isRecord(row)) continue;
        const accountId = readString(row, "account_id");
        if (accountId === null) continue;
        backers.push({accountId, shares: bigintFrom(row["shares"])});
    }

    const sortedShares = backers.map((backer) => backer.shares).sort((a, b) => (a < b ? 1 : -1));
    const largest = sortedShares[0] ?? 0n;
    const topThree = sortedShares.slice(0, 3).reduce((total, value) => total + value, 0n);

    const breadth = await backerBreadth(
        transport,
        backers.map((backer) => backer.accountId),
    );

    return {
        termId,
        curveId,
        positionCount,
        totalShares,
        largestShareBps: shareBps(largest, totalShares),
        topThreeShareBps: shareBps(topThree, totalShares),
        firstDeposit: isRecord(firstRow) ? readString(firstRow, "created_at") : null,
        lastDeposit: isRecord(lastRow) ? readString(lastRow, "created_at") : null,
        // Minus one: the position on this term itself, which every backer holds by definition.
        medianBackerBreadth: median(breadth.map((held) => Math.max(0, held - 1))),
        backersRead: backers.length,
        backersSampled: backers.length >= limit,
    };
}

/**
 * How many distinct terms each account holds a position on, in **one** request.
 *
 * Aliased aggregates — `a0:`, `a1:`, … — because Hasura has no `group by` and one request per
 * account took a 429 every few calls. Verified against mainnet: three aliases in one query returned
 * three distinct counts.
 *
 * Chunked, because a query naming 100 aliases is a large document and the endpoint is a third
 * party's.
 */
async function backerBreadth(
    transport: GraphqlTransport,
    accountIds: readonly string[],
): Promise<number[]> {
    const CHUNK = 25;
    const held: number[] = [];
    for (let start = 0; start < accountIds.length; start += CHUNK) {
        const chunk = accountIds.slice(start, start + CHUNK);
        const fields = chunk
            .map(
                (_, index) =>
                    `a${index}: positions_aggregate(where: {account_id: {_eq: $a${index}}}) { aggregate { count(columns: term_id, distinct: true) } }`,
            )
            .join("\n  ");
        const params = chunk.map((_, index) => `$a${index}: String!`).join(", ");
        const variables = Object.fromEntries(chunk.map((id, index) => [`a${index}`, id]));
        const data = await transport.request(`query BackerBreadth(${params}) {\n  ${fields}\n}`, variables);
        for (let index = 0; index < chunk.length; index += 1) {
            const node = data[`a${index}`];
            const aggregate = isRecord(node) && isRecord(node["aggregate"]) ? node["aggregate"] : null;
            held.push(aggregate === null ? 0 : numberFrom(aggregate["count"]));
        }
    }
    return held;
}

/**
 * A term's deposits over time, for a curve a reader can actually see.
 *
 * The indexer ships this **pre-bucketed** — `signal_stats_hourly` through `_monthly` — so this is
 * one query and no client-side aggregation. Each row carries its `curve_id`, which is kept rather
 * than folded: curve 1 is linear and curve 2 is offset progressive, they are two markets, and a
 * combined line would be a figure from one beside a count from the other.
 */
export async function getTermActivity(
    termId: string,
    config: TermShapeConfig & {grain?: TermActivityGrain; buckets?: number} = {},
): Promise<TermActivityBucket[]> {
    const transport = buildTransport(config);
    const table = ACTIVITY_QUERIES[config.grain ?? "day"];
    const data = await transport.request(
        `query TermActivity($termId: String!, $curveId: numeric!, $limit: Int!) {
  rows: ${table}(
    where: {term_id: {_eq: $termId}, curve_id: {_eq: $curveId}}
    order_by: {bucket: desc}
    limit: $limit
  ) { bucket count volume }
}`,
        {
            termId,
            curveId: String(config.curveId ?? DEFAULT_CURVE_ID),
            limit: config.buckets ?? 90,
        },
    );

    const rows = Array.isArray(data["rows"]) ? data["rows"] : [];
    const buckets: TermActivityBucket[] = [];
    for (const row of rows) {
        if (!isRecord(row)) continue;
        const bucket = readString(row, "bucket");
        if (bucket === null) continue;
        buckets.push({
            bucket,
            deposits: numberFrom(row["count"]),
            volume: bigintFrom(row["volume"]),
        });
    }
    // Oldest first, because a curve is read left to right. The query orders descending so the
    // `limit` takes the most recent buckets rather than the first ninety days of history.
    return buckets.reverse();
}

/**
 * What one account holds and what it put in, for a profile page.
 *
 * ## Deposits minus redemptions, and that is the whole correctness of it
 *
 * `deposits` alone would show 10 TRUST to somebody who has since taken 8 back out. `redemptions`
 * exists on the indexer with the same shape, so a net figure is one extra query and the alternative
 * is a curve that lies. Nothing else here is subtle; this is.
 *
 * ## Two markets, counted apart
 *
 * `vault_type` on each row says `Atom` or `Triple`, which is exactly the distinction the protocol
 * rests on: a deposit on an **atom** prices the tool, a deposit on a **triple** backs somebody's
 * claim about it (ADR `0039`). A profile that summed them would report "your positions" as one
 * number covering two different things, so they are kept apart.
 */
export type AccountHoldings = {
    account: string;
    curveId: number;
    /** Distinct terms this account holds a position on. */
    termsHeld: number;
    /** Shares across them. Not money — shares; what they are worth is a curve read per vault. */
    totalShares: bigint;
    /** Deposited, after fees, over all time. */
    depositedAssets: bigint;
    /** Taken back out. The difference is what is still committed. */
    redeemedAssets: bigint;
    /** `depositedAssets - redeemedAssets`. What this account is actually standing behind. */
    netAssets: bigint;
    /** Deposits on an **atom's** vault — pricing a tool itself. */
    atomDeposits: number;
    /** Deposits on a **triple's** vault — backing somebody's claim. */
    tripleDeposits: number;
};

/** One bucket of an account's net position over time, oldest first and cumulative. */
export type AccountActivityBucket = {
    /** The day, `YYYY-MM-DD`. */
    day: string;
    /** Deposited that day, after fees. */
    deposited: bigint;
    /** Redeemed that day. */
    redeemed: bigint;
    /** Running total of `deposited - redeemed` up to and including this day. */
    cumulativeNet: bigint;
};

const HOLDINGS_QUERY = `
query AccountHoldings($account: String!, $curveId: numeric!) {
  held: positions_aggregate(where: {account_id: {_eq: $account}, curve_id: {_eq: $curveId}}) {
    aggregate { count(columns: term_id, distinct: true) sum { shares } }
  }
  deposited: deposits_aggregate(where: {receiver_id: {_eq: $account}, curve_id: {_eq: $curveId}}) {
    aggregate { sum { assets_after_fees } }
  }
  redeemed: redemptions_aggregate(where: {receiver_id: {_eq: $account}, curve_id: {_eq: $curveId}}) {
    aggregate { sum { assets } }
  }
  onAtoms: deposits_aggregate(
    where: {receiver_id: {_eq: $account}, curve_id: {_eq: $curveId}, vault_type: {_eq: "Atom"}}
  ) { aggregate { count } }
  onTriples: deposits_aggregate(
    where: {receiver_id: {_eq: $account}, curve_id: {_eq: $curveId}, vault_type: {_eq: "Triple"}}
  ) { aggregate { count } }
}`;

export async function getAccountHoldings(
    account: string,
    config: TermShapeConfig = {},
): Promise<AccountHoldings> {
    const transport = buildTransport(config);
    const curveId = config.curveId ?? DEFAULT_CURVE_ID;
    const data = await transport.request(HOLDINGS_QUERY, {account, curveId: String(curveId)});

    const agg = (key: string): Record<string, unknown> | null => {
        const node = data[key];
        if (!isRecord(node) || !isRecord(node["aggregate"])) return null;
        return node["aggregate"];
    };
    const sumOf = (key: string, field: string): bigint => {
        const aggregate = agg(key);
        const sum = aggregate !== null && isRecord(aggregate["sum"]) ? aggregate["sum"] : null;
        return sum === null ? 0n : bigintFrom(sum[field]);
    };

    const depositedAssets = sumOf("deposited", "assets_after_fees");
    const redeemedAssets = sumOf("redeemed", "assets");

    return {
        account,
        curveId,
        termsHeld: numberFrom(agg("held")?.["count"]),
        totalShares: sumOf("held", "shares"),
        depositedAssets,
        redeemedAssets,
        netAssets: depositedAssets - redeemedAssets,
        atomDeposits: numberFrom(agg("onAtoms")?.["count"]),
        tripleDeposits: numberFrom(agg("onTriples")?.["count"]),
    };
}

const ACCOUNT_ACTIVITY_QUERY = `
query AccountActivity($account: String!, $curveId: numeric!, $limit: Int!) {
  deposits(
    where: {receiver_id: {_eq: $account}, curve_id: {_eq: $curveId}}
    order_by: {created_at: desc}
    limit: $limit
  ) { created_at assets_after_fees }
  redemptions(
    where: {receiver_id: {_eq: $account}, curve_id: {_eq: $curveId}}
    order_by: {created_at: desc}
    limit: $limit
  ) { created_at assets }
  allDeposited: deposits_aggregate(where: {receiver_id: {_eq: $account}, curve_id: {_eq: $curveId}}) {
    aggregate { sum { assets_after_fees } }
  }
  allRedeemed: redemptions_aggregate(where: {receiver_id: {_eq: $account}, curve_id: {_eq: $curveId}}) {
    aggregate { sum { assets } }
  }
}`;

/**
 * An account's net position over time, bucketed by day and cumulative.
 *
 * Bucketed here rather than by the indexer: `signal_stats_*` is keyed by **term**, not by account,
 * so there is no pre-aggregated per-account series to read. Deposits and redemptions come back as
 * rows and are folded client-side.
 *
 * Both reads are capped at `limit` and the cap is the honest limit of the curve: an account with
 * more than that many deposits gets a curve over its most recent ones, and `truncated` says so.
 * This is why the function returns it rather than only the buckets.
 */
export async function getAccountActivity(
    account: string,
    config: TermShapeConfig & {limit?: number} = {},
): Promise<{
    buckets: AccountActivityBucket[];
    /**
     * What the account was already holding before the first bucket.
     *
     * Non-zero only when the window is truncated, and it is what makes a truncated curve honest: the
     * first draft folded the hundred most recent rows and ran the total from **zero**, so an account
     * with more history than that got a curve that looked like it started at its hundredth-last
     * deposit. Computed as the all-time net minus the window's net, both from aggregates, so the
     * last point equals the account's real net position rather than a partial sum of it.
     */
    openingNet: bigint;
    truncated: boolean;
}> {
    const transport = buildTransport(config);
    const limit = Math.min(config.limit ?? INTUITION_MAX_POSITIONS_PAGE, INTUITION_MAX_POSITIONS_PAGE);
    const data = await transport.request(ACCOUNT_ACTIVITY_QUERY, {
        account,
        curveId: String(config.curveId ?? DEFAULT_CURVE_ID),
        limit,
    });

    const byDay = new Map<string, {deposited: bigint; redeemed: bigint}>();
    const fold = (key: string, field: string, into: "deposited" | "redeemed") => {
        const rows = Array.isArray(data[key]) ? data[key] : [];
        for (const row of rows) {
            if (!isRecord(row)) continue;
            const createdAt = readString(row, "created_at");
            if (createdAt === null) continue;
            const day = createdAt.slice(0, 10);
            const bucket = byDay.get(day) ?? {deposited: 0n, redeemed: 0n};
            bucket[into] += bigintFrom(row[field]);
            byDay.set(day, bucket);
        }
        return rows.length;
    };
    const deposits = fold("deposits", "assets_after_fees", "deposited");
    const redemptions = fold("redemptions", "assets", "redeemed");

    const sumOf = (key: string, field: string): bigint => {
        const node = data[key];
        if (!isRecord(node) || !isRecord(node["aggregate"])) return 0n;
        const aggregate = node["aggregate"];
        const sum = isRecord(aggregate["sum"]) ? aggregate["sum"] : null;
        return sum === null ? 0n : bigintFrom(sum[field]);
    };
    const allTimeNet = sumOf("allDeposited", "assets_after_fees") - sumOf("allRedeemed", "assets");
    const windowNet = [...byDay.values()].reduce(
        (total, {deposited, redeemed}) => total + deposited - redeemed,
        0n,
    );
    const openingNet = allTimeNet - windowNet;

    let running = openingNet;
    const buckets = [...byDay.entries()]
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([day, {deposited, redeemed}]) => {
            running += deposited - redeemed;
            return {day, deposited, redeemed, cumulativeNet: running};
        });

    return {buckets, openingNet, truncated: deposits >= limit || redemptions >= limit};
}
