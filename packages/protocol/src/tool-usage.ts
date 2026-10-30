import {
    ATTESTED_TOOL_USAGE_QUERY,
    createGraphqlTransport,
    DEFAULT_TIMEOUT_MS,
    defaultFetch,
    type FetchLike,
    type GraphqlTransport,
    isRecord,
    readRecord,
    readString,
    TOOL_USAGE_QUERY,
} from "@arp-protocol/graphql";
import {mapMarketSide} from "./sources/intuition/map.js";
import {INTUITION_MAINNET_GRAPHQL} from "./sources/intuition/index.js";
import {USES} from "./sources/intuition/terms.js";
import type {MarketSide, Provenance} from "./types.js";

/**
 * The curve this reader's per-vault fields are scoped to. **A copy, and the comment above it used
 * to claim otherwise** — it said "governance-configurable, read it, do not trust a copy" directly
 * above a copy.
 *
 * Today it is correct: `getBondingCurveConfig().defaultCurveId` is 1 on both 1155 and 13579
 * (measured 2026-10-19), so this agrees with what `prepareStakeOnUsed` writes and no deposit is
 * invisible. Two things a reader should know anyway:
 *
 *   - If governance moves `defaultCurveId`, the writer follows it and this does not. Assets would
 *     still show, because `mapMarketSide` reads `total_assets` off the **term** (all curves), but
 *     `positionCount` would read 0 — and ADR `0023`'s rule against showing a TRUST figure without a
 *     position count would then be satisfied by a zero.
 *   - It already mixes populations: on mainnet, **89% of the TRUST on `uses` edges sits on curve
 *     2** (`scripts/measure/stake-vault-placement.ts`), which the per-vault fields exclude and the
 *     term-level totals include.
 *
 * Reading it from the chain is the fix and belongs with `docs/tasks/23`, because it changes what the
 * tool surface displays.
 */
const DEFAULT_CURVE_ID = "1";

/** One agent's declared use of a tool, and what the market says about it. */
export type ToolUsageEdge = {
    /** The triple's term id. Its two vaults are the market on this one claim. */
    tripleId: string;
    agent: {atomId: string; label: string | null; type: string | null};
    /** Deposits saying the use happened and mattered. */
    support: MarketSide;
    /**
 * Deposits on the counter-triple, betting the other way.
 *
 * It exists for every triple at the same price as agreement, and is almost never used: 1 of the 185
 * mainnet `uses` edges has ever carried one, 969 of 285,775 triples chain-wide
 * (`scripts/measure/counter-side-usage.ts`, 1155, 2026-10-21). Read an empty one as "nobody
 * bothered", never as agreement.
 */
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
    /**
     * Capped at 200 by the query, silently.
     *
     * **Latent**: the busiest tool on mainnet has 24 incoming edges and the whole graph holds 185
     * across 84 atoms, so nothing is near it. It matters because a caller rendering
     * `edges.length` as "declared uses" would print 200 as though it were the count — say
     * "200+" if that day comes.
     */
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
    /**
     * Keep only edges this account holds a position in — the attestation filter of ADR 0034.
     *
     * A triple's subject carries no authorisation (ADR 0032), so an edge of unknown origin is
     * unusable however readable it is. A deposit is recorded against the depositor's address, so
     * filtering by account is filtering by **who stands behind the edge**.
     *
     * It is a filter, **not an exclusion**: anyone else may deposit on the same edge, and anyone may
     * write a competing edge this account has not attested. Do not render it as exclusivity.
     *
     * Already the ecosystem's own convention rather than a proposal — `wieedze.eth` and `w00ds.eth`
     * hold positions on their own `uses` edges on mainnet today.
     */
    attestedBy?: string;
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

    const attestor = config.attestedBy?.toLowerCase();
    const data = await transport.request(
        attestor === undefined ? TOOL_USAGE_QUERY : ATTESTED_TOOL_USAGE_QUERY,
        {
            toolId: toolAtomId,
            uses: USES,
            curveId: config.curveId === undefined ? DEFAULT_CURVE_ID : String(config.curveId),
            ...(attestor === undefined ? {} : {attestor}),
        },
    );

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
            note:
                `${edges.length} incoming \`uses\` edges` +
                (attestor === undefined ? "" : `, attested by ${attestor}`),
        },
    };
}
