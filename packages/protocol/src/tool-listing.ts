import {
    createGraphqlTransport,
    defaultFetch,
    type FetchLike,
    type GraphqlTransport,
    isRecord,
    readNumber,
    readString,
    TOOL_LISTING_QUERY,
    TOOL_LISTING_SPONSORED_QUERY,
} from "@arp-protocol/graphql";
import {SAME_AS, USES} from "./sources/intuition/terms.js";

/**
 * The tools agents have declared using, with what stands behind each — the read `/tools` is built on.
 *
 * **It returns agent declarations only.** The `uses` predicate is shared, and most of what sits on it
 * is ordinary prose. **That zero is our own non-activity, not a property of the graph** (user, 2026-10-27): nobody has run this loop yet, ARP included. It is a reason to show something else today, never a reason to conclude the edge is the wrong one.
 *
 * Measured 2026-10-20, **0 of 185** edges on mainnet 1155 and 1 of 144 on testnet
 * 13579 have a subject carrying a `same as` edge, and the rest are sentences like "Tip Jar uses
 * Intuition". Those are not this protocol's data, so the filter is in the **query** — the subject must
 * carry a `same as` edge — rather than a group the caller is left to separate.
 *
 * **Why it groups client-side.** There is no server-side aggregate over a predicate's objects here,
 * so it reads the matching edges and groups them by object. `edgesRead` and `truncated` come back with
 * the page so a caller can tell a complete set from a prefix of one.
 *
 * **What it deliberately does not return.** A summed position count. Positions are counted per vault,
 * and a sum across an atom's edges is not a count of anything a reader would recognise — ADR `0023`
 * predicted that trap in writing and this project then fell into it once. What stands in its place is
 * `pricedEdges`: how many of a tool's edges carry **at least one** position. Assets are additive, so
 * their sum is reported, and it is named as a sum.
 *
 * **Proven and declared are read from events, not positions** (ADR `0094` §2, task 42). A deposit
 * made through ARP's sponsoring service and one made from Intuition's explorer land in the same
 * vault, and a position merges both: a withdrawal does not say which part it takes. The `Deposited`
 * event keeps its `sender`, so a deposit whose sender is the sponsoring address went through the
 * proof gate and every other one did not. The address is config: until a sponsoring service exists
 * there is none, and every deposit is declared.
 */

const DEFAULT_CURVE_ID = "1";
const DEFAULT_TIMEOUT_MS = 10_000;

/**
 * The most rows Intuition's indexer will return for one query, whatever `limit` asks for.
 *
 * Probed 2026-10-21 on both chains, `atoms` and `triples`: `limit: 250` returns 250, and `limit:
 * 500` and `limit: 1000` **also return 250** — no error, no warning, no flag on the response.
 *
 * It is exported because it is the endpoint's property and not this module's, so anything else here
 * that pages has to respect it. `DEFAULT_EDGE_LIMIT` was 500 until this was measured, which made
 * `truncated` — computed as `rows.length >= edgeLimit` — **unreachable**: 250 is never ≥ 500, so a
 * short read reported itself as a complete one. Latent rather than live, because mainnet has 185
 * `uses` edges and testnet fewer, so the cap has never actually been hit; it would have started
 * lying silently at the 251st edge.
 */
export const INTUITION_MAX_PAGE = 250;

const DEFAULT_EDGE_LIMIT = INTUITION_MAX_PAGE;

export type ToolListing = {
    atomId: string;
    label: string | null;
    /** The atom's `data` — an `ipfs://` URI for 78 of the 84 tool atoms on mainnet. */
    uri: string | null;
    /**
     * Where the tool is **hosted** — the pinned Thing's `url`. The pointer, and the whole reason a
     * listing is useful to an agent: discover, go look, decide.
     *
     * `null` for 28 of the **85** distinct tools on mainnet `uses` edges, re-measured 2026-10-28
     * (9 more carry the string `"null"`), and
     * three of the rest carry the literal string `"null"`, which is normalised away here. The ones
     * that do carry a url carry a home page — `https://colony.io`, `https://www.ethereum.org/` —
     * which is what a pointer holds. It is **not** a call target and must not be used as one
     * (ADR `0051`).
     */
    hostedAt: string | null;
    type: string | null;
    /** How many `uses` edges point at this tool. One per declaring agent, per declaration. */
    edgeCount: number;
    /**
     * How many of those edges carry at least one position on the read curve.
     *
     * The honest discriminator, and not a staker count. A term's vaults are seeded with `minShare`
     * when it is created (ADR `0042`), so `assets > 0` means the edge exists; only a position means
     * somebody paid to stand behind it.
     */
    pricedEdges: number;
    /**
     * Deposits on this tool's edges sent by the sponsoring address — each one passed ARP's proof
     * gate. `0` when no sponsoring address is configured, which is true rather than unknown: nothing
     * can have passed a gate that does not exist.
     */
    provenDeposits: number;
    /**
     * Every other deposit on this tool's edges, the creation deposit of each edge included. An
     * agent's own TRUST with no proof, or anybody else backing the claim.
     */
    declaredDeposits: number;
    /** Summed across this tool's edges. Assets are additive; this is named as a sum for that reason. */
    supportAssetsSum: bigint;
    opposeAssetsSum: bigint;
};

export type ToolListingPage = {
    /** The curve the position counts and per-vault assets were read at. */
    curveId: number;
    /** How many `uses` edges this page was computed from. */
    edgesRead: number;
    /** True when the edge limit was hit, so the grouping may be a prefix rather than the whole set. */
    truncated: boolean;
    /** The sponsoring address `provenDeposits` was read against, or `null` when none was given. */
    sponsor: string | null;
    tools: ToolListing[];
};

export type ToolListingOrder = "declarations" | "priced-edges" | "conviction";

export type ToolListingConfig = {
    graphqlUrl?: string;
    fetch?: FetchLike;
    timeoutMs?: number;
    transport?: GraphqlTransport;
    curveId?: number;
    /**
     * How many edges to read before grouping. Defaults to, and is clamped at,
     * {@link INTUITION_MAX_PAGE} — the indexer silently ignores anything larger.
     */
    edgeLimit?: number;
    order?: ToolListingOrder;
    /**
     * The address ARP's sponsoring service deposits from. Its deposits count as proven; omitted or
     * `null`, every deposit counts as declared.
     */
    sponsor?: string | null;
};

const INTUITION_MAINNET_GRAPHQL = "https://mainnet.intuition.sh/v1/graphql";

function bigintFrom(value: unknown): bigint {
    const text =
        typeof value === "string" ? value : typeof value === "number" ? String(value) : null;
    if (text === null || !/^\d+$/.test(text)) return 0n;
    return BigInt(text);
}

/** The Thing's `url`, with the literal string `"null"` treated as absent — three tools carry it. */
function hostedAtFrom(object: Record<string, unknown>): string | null {
    const value = object["value"];
    const thing = isRecord(value) ? value["thing"] : null;
    const url = isRecord(thing) ? readString(thing, "url") : null;
    if (url === null) return null;
    const trimmed = url.trim();
    return trimmed.length === 0 || trimmed === "null" ? null : trimmed;
}

function sideOf(term: unknown): {assets: bigint; positions: number} {
    if (!isRecord(term)) return {assets: 0n, positions: 0};
    const vaults = Array.isArray(term["vaults"]) ? term["vaults"] : [];
    const vault = vaults.length > 0 && isRecord(vaults[0]) ? vaults[0] : null;
    return {
        // Per-vault assets when the curve was found, the term-level total otherwise. The two are
        // different populations and the fallback is stated rather than silent.
        assets: bigintFrom(vault?.["total_assets"] ?? term["total_assets"]),
        positions: vault === null ? 0 : (readNumber(vault, "position_count") ?? 0),
    };
}

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

/**
 * The sponsoring address, checked before it reaches a query.
 *
 * It is matched with `_ilike`, so a `%` or `_` in it would be a wildcard. Forty hex digits carry
 * neither, and anything else is a misconfiguration that must fail loudly rather than count the
 * wrong deposits as proven.
 */
function sponsorFilterOf(sponsor: string | null | undefined): string | null {
    if (sponsor === undefined || sponsor === null) return null;
    const trimmed = sponsor.trim();
    if (!ADDRESS.test(trimmed)) throw new Error(`sponsor is not an address: ${sponsor}`);
    return trimmed;
}

function countOf(term: unknown, key: string): number {
    if (!isRecord(term)) return 0;
    const aggregate = term[key];
    const inner = isRecord(aggregate) ? aggregate["aggregate"] : null;
    return isRecord(inner) ? (readNumber(inner, "count") ?? 0) : 0;
}

/** Proven and declared deposits on one edge's support term. Declared is the rest, never negative. */
function depositsOf(term: unknown): {proven: number; declared: number} {
    const all = countOf(term, "deposits");
    const proven = Math.min(countOf(term, "proven"), all);
    return {proven, declared: all - proven};
}

/** Tools, grouped from the `uses` edges and ordered by a measure the caller picks. */
export async function listTools(config: ToolListingConfig = {}): Promise<ToolListingPage> {
    const transport =
        config.transport ??
        createGraphqlTransport({
            url: config.graphqlUrl ?? INTUITION_MAINNET_GRAPHQL,
            fetch: config.fetch ?? defaultFetch(),
            timeoutMs: config.timeoutMs ?? DEFAULT_TIMEOUT_MS,
        });

    const curveId = config.curveId ?? Number(DEFAULT_CURVE_ID);
    // Clamped, not trusted: a caller asking for 500 gets 250 rows from the endpoint regardless, and
    // comparing the result against the number it asked for is how `truncated` came to be unreachable.
    const edgeLimit = Math.min(config.edgeLimit ?? DEFAULT_EDGE_LIMIT, INTUITION_MAX_PAGE);

    const sponsor = sponsorFilterOf(config.sponsor);
    const base = {uses: USES, sameAs: SAME_AS, curveId: String(curveId), limit: edgeLimit};
    const data =
        sponsor === null
            ? await transport.request(TOOL_LISTING_QUERY, base)
            : await transport.request(TOOL_LISTING_SPONSORED_QUERY, {...base, sponsor});

    const rows = Array.isArray(data["triples"]) ? data["triples"] : [];
    const byAtom = new Map<string, ToolListing>();

    for (const row of rows) {
        if (!isRecord(row)) continue;
        const object = row["object"];
        if (!isRecord(object)) continue;
        const atomId = readString(object, "term_id");
        if (atomId === null) continue;

        const support = sideOf(row["term"]);
        const oppose = sideOf(row["counter_term"]);
        const deposits = depositsOf(row["term"]);

        const existing = byAtom.get(atomId);
        if (existing === undefined) {
            byAtom.set(atomId, {
                atomId,
                label: readString(object, "label"),
                uri: readString(object, "data"),
                hostedAt: hostedAtFrom(object),
                type: readString(object, "type"),
                edgeCount: 1,
                pricedEdges: support.positions > 0 ? 1 : 0,
                provenDeposits: deposits.proven,
                declaredDeposits: deposits.declared,
                supportAssetsSum: support.assets,
                opposeAssetsSum: oppose.assets,
            });
            continue;
        }
        existing.edgeCount += 1;
        if (support.positions > 0) existing.pricedEdges += 1;
        existing.provenDeposits += deposits.proven;
        existing.declaredDeposits += deposits.declared;
        existing.supportAssetsSum += support.assets;
        existing.opposeAssetsSum += oppose.assets;
    }

    const order = config.order ?? "priced-edges";
    const tools = [...byAtom.values()].sort((a, b) => {
        if (order === "declarations") return b.edgeCount - a.edgeCount;
        if (order === "conviction") {
            if (a.supportAssetsSum === b.supportAssetsSum) return b.pricedEdges - a.pricedEdges;
            return a.supportAssetsSum < b.supportAssetsSum ? 1 : -1;
        }
        // priced-edges: how many declarations somebody paid to stand behind, then by the money.
        if (a.pricedEdges !== b.pricedEdges) return b.pricedEdges - a.pricedEdges;
        if (a.supportAssetsSum === b.supportAssetsSum) return b.edgeCount - a.edgeCount;
        return a.supportAssetsSum < b.supportAssetsSum ? 1 : -1;
    });

    return {curveId, edgesRead: rows.length, truncated: rows.length >= edgeLimit, sponsor, tools};
}
