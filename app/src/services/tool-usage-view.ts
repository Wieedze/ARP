import type {ToolUsage, ToolUsageEdge} from "@arp-protocol/core";

/**
 * A tool's standing, shaped for the page.
 *
 * The connector answers "what is on the graph"; this answers "what may be shown, and at what
 * weight". The split matters because the second question has an answer the first does not contain:
 * **how much an edge is worth knowing**, which `docs/14`'s ladder settles and which no amount of
 * vault data states on its own.
 */

/**
 * The ladder of knowledge, `docs/14_THE_WITNESS_PROBLEM.md:160-165`, verbatim in its order.
 *
 * `docs/14:156`: _"What the interface must never do is render these at the same weight."_ That is
 * the whole reason this module exists rather than the page reading vault numbers directly.
 */
export type ProvenanceTier =
    | "fact"
    | "confirmed-by-both"
    | "tool-declared"
    | "priced-assertion"
    | "free-assertion";

/**
 * Which rungs this data can reach **today**, and which it cannot.
 *
 * Only the bottom two are derivable from a `uses` edge and its vaults. The top three need
 * information nothing in this repo reads yet:
 *
 * | rung                | what it would need                                                      |
 * | ------------------- | ----------------------------------------------------------------------- |
 * | `fact`              | a payment, an on-chain call or a delegation redemption — `tasks/22`      |
 * | `confirmed-by-both` | the tool declaring the same edge, which nothing writes                  |
 * | `tool-declared`     | the same, from the tool's side alone                                     |
 *
 * They are named rather than omitted. A page that shows only what it can measure, with no sign that
 * the scale continues above, reports a priced assertion as the best evidence that exists — which is
 * the flattening `docs/14` warns about, arrived at from the other direction.
 */
export const DERIVABLE_TIERS: readonly ProvenanceTier[] = ["priced-assertion", "free-assertion"];

export const UNREACHABLE_TIERS: readonly ProvenanceTier[] = [
    "fact",
    "confirmed-by-both",
    "tool-declared",
];

/**
 * The rung one edge sits on.
 *
 * Two outcomes, because two is what the data supports. An edge with stake behind it is a priced
 * assertion; an edge with none is, in `docs/14`'s word, **nothing** — "the one that gets mistaken
 * for data".
 *
 * **Keyed on the position count, not on the assets, and that is not a stylistic choice.** Creating
 * a triple seeds both of its vaults with `minShare`, so `total_assets` is **never zero** for an
 * edge that exists. Measured on mainnet 1155, IPFS's seven incoming edges, 2026-10-19:
 *
 * ```
 * Infura   term 1000000  vaults [(curve 1, 0 positions, 1000000)]
 * Fleek    term 1000000  vaults [(curve 1, 0 positions, 1000000)]
 * Relics   term 80000000001000000  vaults [(curve 1, 8 positions, 80000000001000000)]
 * ```
 *
 * `1000000` wei is `getGeneralConfig().minShare`, and it is there because the triple was created,
 * not because anyone backed it. An earlier version of this function read `totalAssets > 0n` and so
 * called all seven edges priced — including the three `tasks/23` names as the design fixture
 * precisely because they are free. The task's warning was literal: _"if those three render like the
 * fourth, the page has failed."_ It did, and the live gate is what caught it.
 *
 * A position is the honest discriminator: an account holds at most one per vault, so
 * `positionCount > 0` means somebody actually deposited, and the dust-only vaults all report zero.
 * See ADR `0042`.
 */
export function tierForEdge(edge: ToolUsageEdge): ProvenanceTier {
    return (edge.support.positionCount ?? 0) > 0 ? "priced-assertion" : "free-assertion";
}

/**
 * Assets far above the creation dust, with no position on the curve this read is scoped to.
 *
 * `getToolUsage` pairs an **all-curve** `totalAssets` with a `positionCount` scoped to one vault
 * (`packages/protocol/src/sources/intuition/map.ts:126-137`), which are two different populations —
 * and on mainnet **91.6% of the TRUST on `uses` edges sits on curve 2** while the counts read curve
 * 1 (`scripts/measure-stake-vault-placement.ts`). So an edge can hold real capital and report zero
 * positions here. **Live on 1 of 185 edges** today, which is latent-ish rather than widespread, and
 * the cost of getting it wrong is printing "This is not evidence" over 4.94 TRUST.
 *
 * Calling such an edge `free-assertion` would be a lie, and `priced-assertion` would claim a market
 * this read cannot see. So it is **not a rung at all** — it is `isOffCurve`, a flag beside
 * `isContested`, which this file already documents as "not a rung — an orthogonal signal on the
 * same edge". Carrying it as a sixth `ProvenanceTier` member forced it to pick a tone in the rung
 * table, put a non-rung in `DERIVABLE_TIERS`, and made the sort rank it above the edges this page
 * can actually read.
 *
 * **The ceiling is safe against a governance floor, not against an observation.** Creation dust is
 * `minShare` per touched vault — 1e6 each, up to ~4e6 observed. The smallest deposit the protocol
 * *accepts* is `getGeneralConfig().minDeposit`: **1e16 on mainnet 1155, 1e15 on testnet 13579**
 * (`rules/portability.md`). So 1e9 sits 250× above the dust and at least a million times below
 * anything the protocol will take. An "observed smallest stake" can be beaten by the next deposit;
 * a protocol floor cannot without governance moving.
 *
 * Reading `defaultCurveId` from the chain is the real fix and belongs to the connector's read
 * contract, not to this page — `packages/protocol/src/tool-usage.ts:26` already says so.
 */
const DUST_CEILING = 1_000_000_000n;

function hasOffCurveStake(edge: ToolUsageEdge): boolean {
    return (
        (edge.support.positionCount ?? 0) === 0 && (edge.support.totalAssets ?? 0n) > DUST_CEILING
    );
}

/** One edge, with its rung and the two sides of its market. */
export type ToolUsageEdgeView = {
    tripleId: string;
    agent: ToolUsageEdge["agent"];
    tier: ProvenanceTier;
    supportAssets: bigint;
    supportPositions: number;
    opposeAssets: bigint;
    opposePositions: number;
    /**
     * Capital is behind this claim on a bonding curve this read is not scoped to. Not a rung — see
     * {@link tierForEdge}'s note. The tier stays `free-assertion`, because no position exists on
     * the curve read; this says the page cannot see the whole market, and so no figure is shown.
     */
    isOffCurve: boolean;
    /**
     * Someone has staked the other way. Not a rung — an orthogonal signal on the same edge.
     *
     * Also keyed on positions, for the same reason: the counter-vault carries its own `minShare`
     * from creation, so every edge on the graph has non-zero assets against it. Reading the assets
     * marked all seven of IPFS's edges contested, which is the same defect wearing a different hat.
     */
    isContested: boolean;
};

export type ToolUsageView = {
    toolAtomId: string;
    label: string | null;
    pinnedUri: string | null;
    edges: ToolUsageEdgeView[];
    totals: ToolUsage["totals"];
    /** How many edges sit on each rung. The Ladder renders it, so the page says what it shows. */
    tierCounts: Record<ProvenanceTier, number>;
    /** True when no agent has declared using this tool at all. */
    isEmpty: boolean;
    /**
     * True when every edge is free. The page says so rather than letting a column of zeroes read as
     * a weak market: `docs/14` puts a free assertion at **nothing**, not at a low number.
     */
    isEntirelyUnpriced: boolean;
};

const emptyTierCounts = (): Record<ProvenanceTier, number> => ({
    fact: 0,
    "confirmed-by-both": 0,
    "tool-declared": 0,
    "priced-assertion": 0,
    "free-assertion": 0,
});

/**
 * Order: priced first, then off-curve, then free. Within a group, heaviest first.
 *
 * Not a ranking — `tasks/23` puts composing edges into a score out of scope, and this orders rather
 * than scores. It exists because the alternative is the graph's own order, which is arbitrary, and
 * an arbitrary order puts a free assertion above a priced one often enough to mislead.
 *
 * **Grouped before weighed, and that is the fix for a live defect.** Sorting on `supportAssets`
 * alone put the off-curve edge first, because its all-curve 4.94 TRUST outweighs the 0.08 the page
 * can actually read — so the top row went to the one edge whose market this page cannot see. Live
 * on 1 of 84 tool pages.
 */
function rankOf(edge: ToolUsageEdgeView): number {
    if (edge.tier === "priced-assertion") return 0;
    return edge.isOffCurve ? 1 : 2;
}

function compareEdges(a: ToolUsageEdgeView, b: ToolUsageEdgeView): number {
    if (rankOf(a) !== rankOf(b)) return rankOf(a) - rankOf(b);
    if (a.supportAssets !== b.supportAssets) return a.supportAssets > b.supportAssets ? -1 : 1;
    if (a.supportPositions !== b.supportPositions) return b.supportPositions - a.supportPositions;
    return a.tripleId.localeCompare(b.tripleId);
}

export function buildToolUsageView(usage: ToolUsage): ToolUsageView {
    const tierCounts = emptyTierCounts();
    const edges = usage.edges.map((edge): ToolUsageEdgeView => {
        const tier = tierForEdge(edge);
        tierCounts[tier] += 1;
        const opposePositions = edge.oppose.positionCount ?? 0;
        return {
            tripleId: edge.tripleId,
            agent: edge.agent,
            tier,
            supportAssets: edge.support.totalAssets ?? 0n,
            supportPositions: edge.support.positionCount ?? 0,
            opposeAssets: edge.oppose.totalAssets ?? 0n,
            opposePositions,
            isOffCurve: hasOffCurveStake(edge),
            isContested: opposePositions > 0,
        };
    });
    edges.sort(compareEdges);

    return {
        toolAtomId: usage.toolAtomId,
        label: usage.label,
        pinnedUri: usage.pinnedUri,
        edges,
        totals: usage.totals,
        tierCounts,
        isEmpty: edges.length === 0,
        isEntirelyUnpriced:
            edges.length > 0 &&
            tierCounts["priced-assertion"] === 0 &&
            !edges.some((edge) => edge.isOffCurve),
    };
}
