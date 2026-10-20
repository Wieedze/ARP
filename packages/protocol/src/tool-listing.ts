import {createGraphqlTransport, type GraphqlTransport} from "./sources/intuition/graphql.js";
import {SAME_AS, USES} from "./sources/intuition/terms.js";
import {defaultFetch, type FetchLike} from "./http.js";
import {isRecord, readNumber, readString} from "./json.js";

/**
 * The tools agents have declared using, with what stands behind each — the read `/tools` is built on.
 *
 * **It returns agent declarations only.** The `uses` predicate is shared, and most of what sits on it
 * is ordinary prose: measured 2026-10-20, **0 of 185** edges on mainnet 1155 and 1 of 144 on testnet
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
 */

const DEFAULT_CURVE_ID = "1";
const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_EDGE_LIMIT = 500;

const TOOL_LISTING_QUERY = `
query ToolListing($uses: String!, $sameAs: String!, $curveId: numeric!, $limit: Int!) {
  triples(
    where: {
      predicate_id: {_eq: $uses}
      subject: {as_subject_triples: {predicate_id: {_eq: $sameAs}}}
    }
    limit: $limit
  ) {
    term_id
    object {
      term_id
      label
      data
      type
      value { thing { url } }
    }
    term {
      total_assets
      vaults(where: {curve_id: {_eq: $curveId}}, limit: 1) { position_count total_assets }
    }
    counter_term {
      total_assets
      vaults(where: {curve_id: {_eq: $curveId}}, limit: 1) { position_count total_assets }
    }
  }
}`;

export type ToolListing = {
    atomId: string;
    label: string | null;
    /** The atom's `data` — an `ipfs://` URI for 78 of the 84 tool atoms on mainnet. */
    uri: string | null;
    /**
     * Where the tool is **hosted** — the pinned Thing's `url`. The pointer, and the whole reason a
     * listing is useful to an agent: discover, go look, decide.
     *
     * `null` for 28 of the 80 distinct tools on mainnet `uses` edges, measured 2026-10-20, and
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
    tools: ToolListing[];
};

export type ToolListingOrder = "declarations" | "priced-edges" | "conviction";

export type ToolListingConfig = {
    graphqlUrl?: string;
    fetch?: FetchLike;
    timeoutMs?: number;
    transport?: GraphqlTransport;
    curveId?: number;
    /** How many edges to read before grouping. Defaults to 500. */
    edgeLimit?: number;
    order?: ToolListingOrder;
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
    const edgeLimit = config.edgeLimit ?? DEFAULT_EDGE_LIMIT;

    const data = await transport.request(TOOL_LISTING_QUERY, {
        uses: USES,
        sameAs: SAME_AS,
        curveId: String(curveId),
        limit: edgeLimit,
    });

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
                supportAssetsSum: support.assets,
                opposeAssetsSum: oppose.assets,
            });
            continue;
        }
        existing.edgeCount += 1;
        if (support.positions > 0) existing.pricedEdges += 1;
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

    return {curveId, edgesRead: rows.length, truncated: rows.length >= edgeLimit, tools};
}
