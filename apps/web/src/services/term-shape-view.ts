import type {TermShape} from "@arp-protocol/core";

/**
 * A claim's shape, as sentences a reader can act on — and **no score**.
 *
 * ## The reason this is four readings and not one
 *
 * A term reporting "34,421 positions" says nothing. Measured on mainnet 2026-10-21, the busiest term
 * on the graph has exactly that, and its largest single position holds **31.2%** of the weight while
 * its top three hold **69.8%**. The count reads as a crowd; the concentration says three accounts.
 *
 * No composite, no badge, no "recommended". ARP publishes no score (ADR `0046`), and the practical
 * reason is sharper than the principle: a sybil costs **0.01 TRUST per address** on this graph —
 * $0.00005 at $0.005/TRUST — so any pair of metrics that grants a badge is a pair somebody will
 * manufacture for nothing. Handing the reader the dimensions and letting them filter keeps the
 * judgment where it cannot be farmed.
 *
 * ## What each reading is worth, stated rather than implied
 *
 * `concentration` and `span` are **exact** and cheap. `breadth` is the weak one: it catches the lazy
 * sybil and not the competent one, because airdrop farming is an industry and a farmer gives each
 * address a deliberate history — a few positions, spread over weeks — precisely because every
 * snapshot checks the naive signal.
 *
 * The strong signal is **overlap**: a cluster is the same addresses backing the same claims, and
 * giving each address an independent history is what actually costs money. It is pairwise over a
 * term's supporters, so its cost grows with the square of their number, and it is not computed —
 * `FUTURE.md` carries the reasoning.
 */
export type TermShapeView = {
    /**
     * The bonding curve every reading below was taken at.
     *
     * Carried so the panel can name it on the figure, which was the one surface that dropped it —
     * `ToolCatalogView` and `ProfileView` both carry theirs for the same reason
     * (`rules/claims.md` §2: one number, one context).
     */
    curveId: number;
    /** "31.2% held by one account", or `null` when nobody has staked. */
    concentration: string | null;
    /** True when one account holds more than half. A fact, not a verdict. */
    isDominated: boolean;
    /**
     * "Nov 2025 → Oct 2026" — the span over which **support arrived**, or `null` when there are
     * none.
     *
     * Not the span over which money arrived: a position's timestamp is when an account opened it and
     * does not move when that account deposits again. Measured 24 days apart on the busiest mainnet
     * term. The copy said "deposits span" and meant this.
     */
    span: string | null;
    /** True when every supporter opened on the same day — the cheapest sybil signature. */
    arrivedTogether: boolean;
    /** "half its supporters hold 12+ other positions", or `null` when it has none. */
    breadth: string | null;
    /** True when `breadth` is over a prefix of the backers rather than all of them. */
    breadthSampled: boolean;
    positionCount: number;
};

const MONTHS = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
] as const;

/** `2025-11-01T18:56:57+00:00` → `Nov 2025`. Month precision: a day is noise at this span. */
function monthOf(iso: string): string {
    const [year, month] = iso.slice(0, 7).split("-");
    const index = Number(month) - 1;
    return `${MONTHS[index] ?? month} ${year}`;
}

export function buildTermShapeView(shape: TermShape): TermShapeView {
    const bps = shape.largestShareBps;
    const first = shape.firstPosition;
    const last = shape.lastPosition;

    const sameDay = first !== null && last !== null && first.slice(0, 10) === last.slice(0, 10);

    return {
        curveId: shape.curveId,
        concentration: bps === null ? null : `${(bps / 100).toFixed(1)}% held by one account`,
        // Half, because that is when one account can move the figure on its own. Named `isDominated`
        // and not `isRisky`: the first is a reading of the number, the second is an opinion about it.
        isDominated: bps !== null && bps > 5000,
        span:
            first === null || last === null
                ? null
                : sameDay
                  ? `all on ${first.slice(0, 10)}`
                  : `${monthOf(first)} → ${monthOf(last)}`,
        arrivedTogether: sameDay && shape.positionCount > 1,
        breadth:
            shape.medianBackerBreadth === null
                ? null
                : shape.medianBackerBreadth === 0
                  ? "half its supporters hold nothing else"
                  : `half its supporters hold ${shape.medianBackerBreadth}+ other positions`,
        breadthSampled: shape.backersSampled,
        positionCount: shape.positionCount,
    };
}
