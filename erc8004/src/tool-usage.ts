import {defaultFetch, DEFAULT_TIMEOUT_MS, type FetchLike} from "./http.js";
import {isRecord, readRecord, readString} from "./json.js";
import {createGraphqlTransport, type GraphqlTransport} from "./sources/intuition/graphql.js";
import {mapMarketSide} from "./sources/intuition/map.js";
import {INTUITION_MAINNET_GRAPHQL} from "./sources/intuition/index.js";
import {USES} from "./sources/intuition/terms.js";
import type {MarketSide, Provenance} from "./types.js";

/** The curve the UI prices on. Governance-configurable — read it, do not trust a copy. */
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
 * Every `uses` edge pointing AT a tool, with both sides of each edge's market.
 *
 * `$curveId` is `numeric`, never `String!`. Declaring it `String!` is rejected at validation time
 * and takes the whole query down — the bug that broke the trust surface on 2026-09-16, which no
 * fixture could catch because a mocked transport proves the variable was passed and not that the
 * query was valid.
 */
const TOOL_USAGE_QUERY = `
query ToolUsage($toolId: String!, $uses: String!, $curveId: numeric!) {
  tool: atoms(where: {term_id: {_eq: $toolId}}, limit: 1) {
    term_id
    label
    data
  }
  triples(where: {predicate_id: {_eq: $uses}, object_id: {_eq: $toolId}}, limit: 200) {
    term_id
    subject {
      term_id
      label
      type
    }
    term { ${VAULT_SIDE} }
    counter_term { ${VAULT_SIDE} }
  }
}`;

/** One agent's declared use of a tool, and what the market says about it. */
export type ToolUsageEdge = {
    /** The triple's term id. Its two vaults are the market on this one claim. */
    tripleId: string;
    agent: {atomId: string; label: string | null; type: string | null};
    /** Deposits saying the use happened and mattered. */
    support: MarketSide;
    /** Deposits on the counter-triple, betting the other way. Free with every triple. */
    oppose: MarketSide;
};

/**
 * A tool's standing, as the sum of what agents put behind using it.
 *
 * This is the read half of `docs/12`'s mechanism: an agent stakes on the modules it used, which
 * builds reputation for the tool as well as the agent. Until this existed the `uses` edges were a
 * write path with no reader.
 */
export type ToolUsage = {
    toolAtomId: string;
    label: string | null;
    /** The pinned URI, when the atom has one. */
    pinnedUri: string | null;
    edges: ToolUsageEdge[];
    /**
     * Summed across edges — and **never shown without `supportPositions`**. These vaults hold one or
     * two positions each, so a TRUST figure on its own suggests a depth of opinion that is not
     * there. ADR 0023, and the `StakerCount` precedent in the panel.
     */
    totals: {
        supportAssets: bigint;
        opposeAssets: bigint;
        supportPositions: number;
        opposePositions: number;
    };
    provenance: Provenance;
};

export type ToolUsageConfig = {
    graphqlUrl?: string;
    fetch?: FetchLike;
    timeoutMs?: number;
    /** Stringified for the transport; Hasura coerces it to `numeric`. */
    curveId?: string | number | bigint;
    transport?: GraphqlTransport;
};

function sumPositions(side: MarketSide): number {
    return side.positionCount ?? 0;
}

/**
 * Read a tool's incoming `uses` edges.
 *
 * Keyed by **atom id**, not by an `AgentRef`, because a tool is not always an agent — it may be a
 * URI-backed atom. Where it *is* an agent (the common case in ERC-8004 plus MCP, see `docs/14`),
 * resolve its atom through the identity path first and pass the result here.
 *
 * Returns an empty `edges` array for a tool nobody has declared, which is **not** an error: 84 of
 * the cohort's atoms are the object of a `uses` edge and 64 of those carry a position, so most
 * things are simply not yet used. A caller renders that as an empty state, not a failure.
 */
export async function getToolUsage(
    toolAtomId: string,
    config: ToolUsageConfig = {},
): Promise<ToolUsage> {
    const transport =
        config.transport ??
        createGraphqlTransport({
            url: config.graphqlUrl ?? INTUITION_MAINNET_GRAPHQL,
            fetch: config.fetch ?? defaultFetch(),
            timeoutMs: config.timeoutMs ?? DEFAULT_TIMEOUT_MS,
        });

    const data = await transport.request(TOOL_USAGE_QUERY, {
        toolId: toolAtomId,
        uses: USES,
        curveId: config.curveId === undefined ? DEFAULT_CURVE_ID : String(config.curveId),
    });

    const toolRows = Array.isArray(data["tool"]) ? data["tool"] : [];
    const tool = toolRows.length > 0 && isRecord(toolRows[0]) ? toolRows[0] : null;

    const rows = Array.isArray(data["triples"]) ? data["triples"] : [];
    const edges: ToolUsageEdge[] = [];
    for (const row of rows) {
        if (!isRecord(row)) continue;
        const tripleId = readString(row, "term_id");
        const subject = readRecord(row, "subject");
        const agentAtomId = subject === null ? null : readString(subject, "term_id");
        if (tripleId === null || agentAtomId === null) continue;
        edges.push({
            tripleId,
            agent: {
                atomId: agentAtomId,
                label: readString(subject, "label"),
                type: readString(subject, "type"),
            },
            support: mapMarketSide(row["term"]),
            oppose: mapMarketSide(row["counter_term"]),
        });
    }

    return {
        toolAtomId,
        label: tool === null ? null : readString(tool, "label"),
        pinnedUri: tool === null ? null : readString(tool, "data"),
        edges,
        totals: {
            supportAssets: edges.reduce((t, e) => t + (e.support.totalAssets ?? 0n), 0n),
            opposeAssets: edges.reduce((t, e) => t + (e.oppose.totalAssets ?? 0n), 0n),
            supportPositions: edges.reduce((t, e) => t + sumPositions(e.support), 0),
            opposePositions: edges.reduce((t, e) => t + sumPositions(e.oppose), 0),
        },
        // `claim`, not `derived`: each edge is an assertion somebody wrote, and the market only
        // prices it. The totals are a sum over claims and inherit their kind — calling them
        // `derived` would suggest ARP computed the standing rather than read it.
        provenance: {
            sourceId: "intuition",
            kind: "claim",
            origin: toolAtomId,
            note: `${edges.length} incoming \`uses\` edges`,
        },
    };
}
