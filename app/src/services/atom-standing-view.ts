import type {AtomEdge, AtomEdgeGroup, AtomStanding} from "@arp-protocol/core";

import {formatTrust, truncateMiddle} from "./trust-format";

/**
 * What the atom page renders, derived from `getAtomStanding` and nothing else.
 *
 * ## The one rule this file exists to enforce
 *
 * **A figure is shown only when a position stands behind it.** ADR `0042`: every term is born with
 * `minShare` dust — 1,000,000 wei — so an edge nobody has backed still reports a non-zero
 * `total_assets`. Measured live on mainnet 2026-10-27, a `has tag` group came back with exactly
 * `1000000` assets and `0` positions. Rendering that as `<0.00000001 TRUST` invents a market where
 * there is none, which is the same defect ADR `0042` was written for.
 *
 * So `positions === 0` is the discriminator, not the amount, and `backing` is `null` in that case.
 * The caller has no way to print a number without one.
 *
 * ## No tier, and no ranking
 *
 * `tool-usage-view.ts` grades `uses` edges on `docs/14`'s ladder. That is the right question on an
 * agent's page — how good is this evidence — and the wrong one here. A `has tag` edge is not weak
 * evidence of a tag; it is a declaration whose only cost is what the writer paid. Grading it would
 * invent a scale the data does not carry, and ARP composes no score (ADR `0046`).
 *
 * The order is the graph's own: `getAtomStanding` asks for edges by `total_assets desc`, so the
 * groups arrive busiest first. Nothing here re-sorts them.
 */

export type EdgeRow = {
    tripleId: string;
    /** The subject's name, or its id when it has none. `nameIsId` says which. */
    name: string;
    nameIsId: boolean;
    subjectAtomId: string;
    /** `null` when no position stands behind the claim — ADR `0042`. */
    backing: string | null;
    positions: number;
    /** Deposits on the counter-triple. `null` unless somebody actually took the other side. */
    opposition: string | null;
};

export type GroupView = {
    predicateAtomId: string;
    /** What the predicate says, or its id. The graph lets anyone use any atom as a predicate. */
    label: string;
    labelIsId: boolean;
    rows: EdgeRow[];
    /** The group's summed backing, or `null` when no position stands behind any of it. */
    backing: string | null;
    positions: number;
};

export type AtomView = {
    atomId: string;
    /** The atom's own name, or its id. */
    title: string;
    titleIsId: boolean;
    type: string | null;
    pinnedUri: string | null;
    exists: boolean;
    /** The atom's **own** vault — a different market from any edge, and never summed with one. */
    ownBacking: string | null;
    ownPositions: number;
    groups: GroupView[];
    edgeCount: number;
    truncated: boolean;
};

/** A figure, or `null` when nothing stands behind it. The only place this decision is made. */
function backingOf(assets: bigint | null, positions: number, symbol: string): string | null {
    if (positions <= 0) return null;
    return `${formatTrust(assets ?? 0n)} ${symbol}`;
}

function rowOf(edge: AtomEdge, symbol: string): EdgeRow {
    const label = edge.subject.label;
    const hasName = label !== null && label.trim() !== "";
    return {
        tripleId: edge.tripleId,
        name: hasName ? label : truncateMiddle(edge.subject.atomId),
        nameIsId: !hasName,
        subjectAtomId: edge.subject.atomId,
        backing: backingOf(edge.support.totalAssets, edge.support.positionCount ?? 0, symbol),
        positions: edge.support.positionCount ?? 0,
        opposition: backingOf(edge.oppose.totalAssets, edge.oppose.positionCount ?? 0, symbol),
    };
}

function groupOf(group: AtomEdgeGroup, symbol: string): GroupView {
    const label = group.predicate.label;
    const hasLabel = label !== null && label.trim() !== "";
    return {
        predicateAtomId: group.predicate.atomId,
        label: hasLabel ? label : truncateMiddle(group.predicate.atomId),
        labelIsId: !hasLabel,
        rows: group.edges.map((edge) => rowOf(edge, symbol)),
        backing: backingOf(group.assets, group.positions, symbol),
        positions: group.positions,
    };
}

export function buildAtomView(standing: AtomStanding, symbol: string): AtomView {
    const label = standing.label;
    const hasTitle = label !== null && label.trim() !== "";
    return {
        atomId: standing.atomId,
        title: hasTitle ? label : truncateMiddle(standing.atomId, 14, 10),
        titleIsId: !hasTitle,
        type: standing.type,
        pinnedUri: standing.pinnedUri,
        exists: standing.exists,
        ownBacking: backingOf(
            standing.market?.totalAssets ?? null,
            standing.market?.positionCount ?? 0,
            symbol,
        ),
        ownPositions: standing.market?.positionCount ?? 0,
        groups: standing.groups.map((group) => groupOf(group, symbol)),
        edgeCount: standing.edgeCount,
        truncated: standing.truncated,
    };
}

/**
 * How many things point at this atom, said so a truncated read cannot be misread as a total.
 *
 * `edgeCount` is a floor when the read hit its limit, and the indexer caps a page silently
 * (`INTUITION_MAX_PAGE`). "19 things" and "250+ things" are different claims.
 */
export function describePointers(view: AtomView): string {
    const count = view.edgeCount;
    if (count === 0) return "nothing points at it";
    const noun = count === 1 ? "claim" : "claims";
    const groups = view.groups.length;
    const kinds = groups === 1 ? "one predicate" : `${groups} predicates`;
    return `${view.truncated ? `${count}+` : count} ${noun} across ${kinds}`;
}
