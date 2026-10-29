import {INTUITION_USES_TERM_ID} from "@arp-protocol/core";
import type {AtomClaim, AtomEdge, AtomEdgeGroup, AtomStanding} from "@arp-protocol/core";

import {formatTrust, truncateMiddle} from "./trust-format";
import {parseToolLabel, primaryNameOf} from "../lib/tool-label";

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
    /**
     * The atom's raw label, kept beside the title.
     *
     * `title` is for reading and `label` is the key: the description, the install count and the
     * repository's signals live beside the chain, keyed by exactly this string. A lookup needs
     * the value the graph gave, not the one the page shows.
     */
    label: string | null;
    titleIsId: boolean;
    type: string | null;
    pinnedUri: string | null;
    /**
     * Whether to offer this atom's market at all.
     *
     * `/atom/:atomId` serves **every** atom, so without a test the deposit control appeared on a
     * tag, a keyword and a person's name. The user's scope for the market is _« une bourse
     * d'agents et d'outils »_ (ADR `0056`), not every node in a permissionless graph.
     *
     * **No single field decides it, and the first attempt got that wrong in the worst direction.**
     * `type` cannot: measured on mainnet, the tag `Sanctioned Address` and the skill `docx` are
     * both `Thing`. A non-empty `url` looked like the answer — a tool points at something, a tag
     * does not — and it is right for every atom written by `toolThing` or by the skills.sh
     * cohort. But the testnet rig's tools predate that recipe and carry `url: ""` with a real name
     * and description, so the url test **hid the market on an actual tool**
     * (`Trail of Bits — secure-workflow-guide`, seen by the user). A false negative here is worse
     * than the false positive it was guarding: it removes the market from the things the market is
     * for.
     *
     * So it is two tests, either of which is enough:
     *
     * 1. the atom **points at something** — a non-empty `url` in its pinned Thing;
     * 2. somebody has declared **using** it — it is the object of at least one `uses` edge
     *    (ADR `0030`'s frozen predicate id, never the label).
     *
     * A tag fails both: `Sanctioned Address` has an empty url and its 250+ edges are all
     * `has tag`. A freshly registered tool passes the first before anyone has used it; a legacy
     * rig tool passes the second.
     */
    offersMarket: boolean;
    exists: boolean;
    /** The atom's **own** vault — a different market from any edge, and never summed with one. */
    ownBacking: string | null;
    ownPositions: number;
    groups: GroupView[];
    /**
     * What the atom says about **itself** — its outgoing edges.
     *
     * The page rendered only incoming ones until 2026-10-29 and a whole population came out blank:
     * a skill's edges point outward (`source` to its repository, `has tag` to its domain) and
     * nothing points back, so 662 atoms whose every fact was on chain had an empty page.
     */
    claims: ClaimView[];
    edgeCount: number;
    truncated: boolean;
};

/** One outgoing edge, ready to render: a predicate, an object, and where the object lives. */
export type ClaimView = {
    tripleId: string;
    /** The predicate's own word, unrelabelled. {@link predicateLabelOf} names it at render time. */
    predicate: string;
    /** The object's raw label, which is what decides how the predicate is named. */
    objectLabel: string | null;
    object: string;
    objectIsId: boolean;
    objectAtomId: string;
    /** What stands behind this claim, or `null` when nobody has put anything behind it. */
    backing: string | null;
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

/**
 * What to call an outgoing edge on screen, read from its **object** rather than its predicate.
 *
 * `has tag` is overloaded on chain and ARP writes both meanings itself:
 *
 * ```
 * (skill, has tag, image)       a domain
 * (repository, has tag, maintained)   a liveness verdict
 * ```
 *
 * Printing "has tag" twice is jargon; printing "Domain" twice would be a false label on the
 * second. So the object decides, and `domains` is ARP's own tree — membership in it is the test,
 * which also means a `has tag` edge somebody else wrote, pointing at something outside the tree,
 * falls through to the predicate's own word rather than being claimed as a domain.
 */
export const LIVENESS_OBJECTS = new Set(["maintained", "reachable"]);

export function predicateLabelOf(
    predicate: string,
    objectLabel: string | null,
    domains: ReadonlySet<string>,
): string {
    if (predicate !== "has tag" || objectLabel === null) return predicate;
    if (LIVENESS_OBJECTS.has(objectLabel)) return "Status";
    return domains.has(objectLabel) ? "Domain" : predicate;
}

function claimOf(claim: AtomClaim, symbol: string): ClaimView {
    const label = claim.object.label;
    const named = label !== null && label.trim() !== "";
    const predicate = claim.predicate.label;
    const named_predicate =
        predicate === null || predicate.trim() === ""
            ? truncateMiddle(claim.predicate.atomId)
            : predicate;
    return {
        tripleId: claim.tripleId,
        predicate: named_predicate,
        objectLabel: label,
        // A tool's object is a URL, so it is parsed the same way a row's name is — `github.com/`
        // in front of every one of them says nothing.
        object: named ? primaryNameOf(parseToolLabel(label)) : truncateMiddle(claim.object.atomId),
        objectIsId: !named,
        objectAtomId: claim.object.atomId,
        backing: backingOf(claim.support.totalAssets, claim.support.positionCount ?? 0, symbol),
    };
}

export function buildAtomView(standing: AtomStanding, symbol: string): AtomView {
    const label = standing.label;
    const hasTitle = label !== null && label.trim() !== "";
    return {
        label,
        atomId: standing.atomId,
        title: hasTitle ? label : truncateMiddle(standing.atomId, 14, 10),
        titleIsId: !hasTitle,
        type: standing.type,
        pinnedUri: standing.pinnedUri,
        offersMarket:
            standing.url !== null ||
            standing.groups.some(
                (group) =>
                    group.predicate.atomId.toLowerCase() === INTUITION_USES_TERM_ID.toLowerCase(),
            ),
        exists: standing.exists,
        ownBacking: backingOf(
            standing.market?.totalAssets ?? null,
            standing.market?.positionCount ?? 0,
            symbol,
        ),
        ownPositions: standing.market?.positionCount ?? 0,
        groups: standing.groups.map((group) => groupOf(group, symbol)),
        claims: standing.claims.map((claim) => claimOf(claim, symbol)),
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
