import type {AgentListing, AgentListOrder, AgentPage} from "@arp-protocol/erc8004";

import {describeAtomPositions, describeChain, formatTrust} from "./trust-format";

/**
 * Turns one `AgentPage` into the shape the directory renders.
 *
 * Pure: no network, no React. It does no sorting and no filtering of its own —
 * the order is a property of the whole cohort, decided at the indexer, and a
 * page is a window onto it. Re-arranging rows here would make the window's
 * order look like the cohort's.
 */

/**
 * The two orders the directory offers, with the sentence that keeps each one
 * honest.
 *
 * Neither is a quality ranking and the labels say what is actually being
 * counted. There is no order by score: the panel exists to argue that a score
 * is worth what its evidence is worth, and one descending score column would
 * undo that argument in a single control.
 */
export const COHORT_ORDERS: readonly {
    id: AgentListOrder;
    label: string;
    note: string;
}[] = [
    {
        id: "evidence-quantity",
        label: "Most statements",
        note: "How many statements the graph holds about the agent. The mirrored shell gives every agent five, so anything above five is somebody having bothered.",
    },
    {
        id: "economic-conviction",
        label: "Most staked",
        note: "What is staked on the agent's own atom, across every bonding curve. Mostly one or two positions, so read the position count beside it.",
    },
];

export type CohortRow = {
    key: string;
    name: string;
    /** True when `name` is the indexer's `Agent 8453:NNNN` stand-in, not a chosen one. */
    isFallbackMetadata: boolean;
    /** `null` when the graph holds no usable image — an empty string is not one. */
    imageUrl: string | null;
    /** The panel route, or `null` when no single identity could be established. */
    href: string | null;
    /** `8453:1380 · Base 8453`, or the reason there is no identity to show. */
    identity: string;
    /** Set when the row cannot be linked, saying why rather than leaving a dead cell. */
    identityProblem: string | null;
    statementCount: number | null;
    /** Already formatted; `null` when the graph reported no market cap at all. */
    marketCap: string | null;
    positions: string;
};

export type CohortView = {
    sourceId: string;
    order: AgentListOrder;
    /** The whole cohort's size, from the graph's own aggregate. */
    total: number | null;
    /** 1-based index of the first row on this page. */
    rangeStart: number;
    /** 1-based index of the last row on this page. */
    rangeEnd: number;
    limit: number;
    offset: number;
    hasPrevious: boolean;
    hasNext: boolean;
    rows: CohortRow[];
};

/**
 * An image URL the indexer holds, or `null`.
 *
 * The graph stores `""` for an agent with no image — `Ouro Proof-of-Compute
 * Oracle` is one — and an `<img src="">` resolves against the page URL, so it
 * would render a broken document as an avatar.
 */
function imageUrlOf(listing: AgentListing): string | null {
    const image = listing.metadata.image?.trim() ?? "";
    return image === "" ? null : image;
}

/**
 * Why this row has no panel to link to.
 *
 * Both cases are real on mainnet and neither is an error. An atom with no
 * ERC-8004 `same as` edge is in the cohort by its `implement` edge alone; an
 * atom with several claims to be several agents at once, and picking the first
 * would send a reader to a panel this row may not be about.
 */
function identityProblemOf(listing: AgentListing): string | null {
    if (listing.ref !== null) return null;
    if (listing.isIdentityAmbiguous) {
        const count = listing.identityEdgeCount;
        return count === null
            ? "claims more than one ERC-8004 identity"
            : `claims ${count.toLocaleString("en-US")} identities — no single agent to open`;
    }
    return "no ERC-8004 identity edge in the graph";
}

export function toCohortRow(listing: AgentListing, index: number): CohortRow {
    const ref = listing.ref;
    const market = listing.market;
    const cap = market?.totalMarketCap ?? null;

    return {
        key: `${listing.sourceHandle}-${index}`,
        name: listing.metadata.name ?? "Unnamed atom",
        isFallbackMetadata: listing.metadata.isFallback,
        imageUrl: imageUrlOf(listing),
        href: ref === null ? null : `/agent/${ref.chainId}/${ref.tokenId}`,
        identity: ref === null ? "—" : `${ref.tokenId} · ${describeChain(ref.chainId)}`,
        identityProblem: identityProblemOf(listing),
        statementCount: listing.statementCount,
        marketCap: cap === null ? null : `${formatTrust(cap)} TRUST`,
        positions: market === null ? "no market data" : describeAtomPositions(market),
    };
}

/** One page in, everything the directory renders out. */
export function buildCohortView(page: AgentPage): CohortView {
    const rows = page.agents.map(toCohortRow);
    const rangeStart = rows.length === 0 ? 0 : page.offset + 1;
    const rangeEnd = page.offset + rows.length;

    return {
        sourceId: page.sourceId,
        order: page.order,
        total: page.total,
        rangeStart,
        rangeEnd,
        limit: page.limit,
        offset: page.offset,
        hasPrevious: page.offset > 0,
        // A short page is the end of the cohort whatever the total says, and a
        // total the source did not report is not a reason to hide the control.
        hasNext: rows.length === page.limit && (page.total === null || rangeEnd < page.total),
        rows,
    };
}
