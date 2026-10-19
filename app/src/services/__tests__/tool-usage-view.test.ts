import {describe, expect, it} from "vitest";
import type {MarketSide, ToolUsage, ToolUsageEdge} from "@arp-protocol/core";

import {
    buildToolUsageView,
    DERIVABLE_TIERS,
    tierForEdge,
    UNREACHABLE_TIERS,
} from "../tool-usage-view";

/**
 * The fixture is IPFS's shape on mainnet, which `tasks/23` names as the design fixture because its
 * seven incoming edges demonstrate the whole ladder at once: three free assertions beside one
 * priced edge that also has a counter side. If those three ever render like the fourth, the page
 * has failed, so the tests are written against that shape rather than against a tidy one.
 */
const side = (assets: bigint | null, positions: number | null): MarketSide => ({
    marketCap: null,
    totalMarketCap: null,
    totalAssets: assets,
    totalShares: null,
    // `currentSharePrice`, not `sharePrice`. The fixture carried the wrong name and a double cast
    // let it through — the cast was not a convenience, it was hiding drift from the real type.
    currentSharePrice: null,
    positionCount: positions,
});

const edge = (
    tripleId: string,
    label: string,
    support: bigint | null,
    positions: number | null,
    oppose: bigint | null = 0n,
    opposePositions: number | null = 0,
): ToolUsageEdge => ({
    tripleId,
    agent: {atomId: `0xa${tripleId.slice(1)}`, label, type: "Thing"},
    support: side(support, positions),
    oppose: side(oppose, opposePositions),
});

const usage = (edges: ToolUsageEdge[]): ToolUsage => ({
    toolAtomId: `0x${"ab".repeat(32)}`,
    label: "IPFS",
    pinnedUri: "ipfs://bafkreiipfs",
    edges,
    totals: {
        supportAssets: edges.reduce((a, e) => a + (e.support.totalAssets ?? 0n), 0n),
        opposeAssets: edges.reduce((a, e) => a + (e.oppose.totalAssets ?? 0n), 0n),
        supportPositions: edges.reduce((a, e) => a + (e.support.positionCount ?? 0), 0),
        opposePositions: edges.reduce((a, e) => a + (e.oppose.positionCount ?? 0), 0),
    },
    provenance: {sourceId: "intuition", kind: "claim", origin: "x"},
});

describe("tierForEdge", () => {
    it("puts an edge with stake behind it on `priced-assertion`", () => {
        expect(tierForEdge(edge("0x1", "Relics", 80_000_000_000_000_000n, 8))).toBe(
            "priced-assertion",
        );
    });

    it("puts a free declaration on `free-assertion` — docs/14's **nothing**", () => {
        // The row that gets mistaken for data. Infura, Fleek and Pinata all declare using IPFS
        // with zero stake on mainnet.
        expect(tierForEdge(edge("0x2", "Infura", 0n, 0))).toBe("free-assertion");
    });

    it("is NOT fooled by the dust a triple's creation leaves in its vault", () => {
        // The live defect, and the one tasks/23 predicted in writing. Measured on mainnet
        // 2026-10-19: every created triple's vault holds exactly `minShare` = 1000000 wei with ZERO
        // positions, because creating it deposited that — not because anyone backed it. Infura,
        // Fleek, Pinata and AnyType all declare using IPFS in exactly this state. An earlier
        // version read `totalAssets > 0n` and called all seven of IPFS's edges priced. ADR 0042.
        expect(tierForEdge(edge("0x3", "Infura", 1_000_000n, 0))).toBe("free-assertion");
    });

    it("counts a real position as priced even when the stake is small", () => {
        // MetaMask's edge on IPFS: 0.01 TRUST across one position, on top of the same dust.
        expect(tierForEdge(edge("0x4", "MetaMask", 10_000_000_001_000_000n, 1))).toBe(
            "priced-assertion",
        );
    });

    it("treats a null market as free rather than as unknown", () => {
        // The graph returns no vault row for a term nobody has deposited into. That is zero stake,
        // not missing information.
        expect(tierForEdge(edge("0x5", "Unvaulted", null, null))).toBe("free-assertion");
    });
});

describe("the ladder's reach", () => {
    it("claims only the two rungs this data can derive", () => {
        expect(DERIVABLE_TIERS).toEqual(["priced-assertion", "free-assertion"]);
    });

    it("names the three it cannot, rather than omitting them", () => {
        // docs/14:156 — the interface must never render the rungs at the same weight. Dropping the
        // top three silently is the same failure from the other side: it makes a priced assertion
        // read as the best evidence that exists.
        expect(UNREACHABLE_TIERS).toEqual(["fact", "confirmed-by-both", "tool-declared"]);
    });

    it("covers all five of docs/14's rungs between the two lists, with no overlap", () => {
        // Five, not six. `off-curve` is carried as `isOffCurve` on the edge beside `isContested`,
        // not as a rung — this file's own words for `isContested` are "not a rung, an orthogonal
        // signal on the same edge", and that is exactly what off-curve is.
        const all = [...DERIVABLE_TIERS, ...UNREACHABLE_TIERS];
        expect(new Set(all).size).toBe(5);
    });
});

describe("buildToolUsageView", () => {
    /**
     * IPFS's real shape on mainnet, dust included, read 2026-10-19.
     *
     * Every vault carries `minShare` = 1000000 wei from creation, and the counter-vaults do too —
     * which is why the free edges below have non-zero assets on BOTH sides and are still free and
     * uncontested. A tidier fixture with literal zeroes would pass a test the chain fails.
     */
    const DUST = 1_000_000n;
    const ipfs = usage([
        edge("0x1", "Infura", DUST, 0, DUST, 0),
        edge("0x2", "Relics by Intuition", 80_000_000_001_000_000n, 8, 30_000_000_001_000_000n, 3),
        edge("0x3", "Fleek", DUST, 0, DUST, 0),
        edge("0x4", "Pinata", DUST, 0, DUST, 0),
    ]);

    it("orders priced edges above free ones", () => {
        const view = buildToolUsageView(ipfs);
        expect(view.edges[0]?.agent.label).toBe("Relics by Intuition");
        expect(view.edges.slice(1).every((e) => e.tier === "free-assertion")).toBe(true);
    });

    it("counts the edges on each rung", () => {
        const view = buildToolUsageView(ipfs);
        expect(view.tierCounts["priced-assertion"]).toBe(1);
        expect(view.tierCounts["free-assertion"]).toBe(3);
        expect(view.tierCounts.fact).toBe(0);
    });

    it("marks an edge somebody staked against as contested", () => {
        const view = buildToolUsageView(ipfs);
        expect(view.edges[0]?.isContested).toBe(true);
        expect(view.edges[1]?.isContested).toBe(false);
    });

    it("says when nothing is priced, so a column of zeroes cannot read as a weak market", () => {
        const free = buildToolUsageView(usage([edge("0x1", "Infura", 0n, 0)]));
        expect(free.isEntirelyUnpriced).toBe(true);
        expect(buildToolUsageView(ipfs).isEntirelyUnpriced).toBe(false);
    });

    it("flags an edge holding TRUST on another curve, without calling it priced or free", () => {
        // The live case, n=1 of 185 on mainnet: `2026 FIFA World Cup uses upgraded semi-automated
        // offside technology` holds 4.94 TRUST in its term with zero positions on the curve read.
        const offCurve = buildToolUsageView(
            usage([edge("0x6", "FIFA", 4_940_000_000_000_000_000n, 0)]),
        );
        expect(offCurve.edges[0]?.isOffCurve).toBe(true);
        // The tier stays free, because no position exists on the curve read. The flag is what says
        // the page cannot see the whole market.
        expect(offCurve.edges[0]?.tier).toBe("free-assertion");
        // And the tool is not "entirely unpriced", or the page would print "nobody has put TRUST
        // behind any of these claims" over 4.94 TRUST.
        expect(offCurve.isEntirelyUnpriced).toBe(false);
    });

    it("does not flag the creation dust as off-curve", () => {
        // The ceiling clears ~4e6 of dust and stays far below `minDeposit`, which is 1e16 on
        // mainnet and 1e15 on testnet — the smallest the protocol accepts.
        const dusty = buildToolUsageView(usage([edge("0x7", "Infura", 4_000_000n, 0)]));
        expect(dusty.edges[0]?.isOffCurve).toBe(false);
        expect(dusty.isEntirelyUnpriced).toBe(true);
    });

    it("sorts an off-curve edge below the priced ones it cannot outrank", () => {
        // Sorting on assets alone put it first, because its all-curve 4.94 TRUST outweighs the 0.08
        // the page can read — the top row went to the one edge whose market is invisible here.
        const mixed = buildToolUsageView(
            usage([
                edge("0x6", "FIFA", 4_940_000_000_000_000_000n, 0),
                edge("0x2", "Relics", 80_000_000_001_000_000n, 8),
                edge("0x1", "Infura", DUST, 0),
            ]),
        );
        expect(mixed.edges.map((e) => e.agent.label)).toEqual(["Relics", "FIFA", "Infura"]);
    });

    it("reports the empty case rather than failing on it", () => {
        // The normal case. 84 atoms are the object of a `uses` edge on mainnet 1155
        // (`scripts/measure-tool-atom-shape.ts`); every other atom is in this state, and the atom
        // population itself has not been counted — 88,243 is ERC-8004 identities on Base.
        const none = buildToolUsageView(usage([]));
        expect(none.isEmpty).toBe(true);
        expect(none.isEntirelyUnpriced).toBe(false);
        expect(none.edges).toEqual([]);
    });

    it("carries the totals through untouched, positions included", () => {
        // ADR 0023: an amount never travels without its count. If the view dropped the counts a
        // caller could render the sum alone, which is the failure the StakerCount precedent exists
        // for. The totals include the dust, because the connector sums what the graph reports —
        // the page's job is to not render an amount nobody staked, which it does by checking the
        // count.
        const view = buildToolUsageView(ipfs);
        expect(view.totals.supportAssets).toBe(80_000_000_004_000_000n);
        expect(view.totals.supportPositions).toBe(8);
        expect(view.totals.opposeAssets).toBe(30_000_000_004_000_000n);
        expect(view.totals.opposePositions).toBe(3);
    });

    it("keeps the atom's identity and provenance", () => {
        const view = buildToolUsageView(ipfs);
        expect(view.toolAtomId).toBe(`0x${"ab".repeat(32)}`);
        expect(view.label).toBe("IPFS");
        expect(view.pinnedUri).toBe("ipfs://bafkreiipfs");
    });
});
