import {useParams} from "react-router-dom";

import {useToolUsage, isToolAtomId} from "../hooks/use-tool-usage";
import {formatTrust, truncateMiddle} from "../services/trust-format";
import {DERIVABLE_TIERS, UNREACHABLE_TIERS, type ToolUsageView} from "../services/tool-usage-view";
import {MainnetNotice} from "../components/agent/MainnetNotice";
import {UsageEdgeRow} from "../components/tool/UsageEdgeRow";
import {TIER_CAPTION, TIER_LABEL, TIER_UNREACHABLE_REASON} from "../components/tool/tier-scale";
import {INTUITION_MAINNET_EXPLORER} from "../lib/intuition-mainnet";

/**
 * A tool's standing: who declared using it, and what they put behind saying so (`/tool/atom/:atomId`).
 *
 * The half of `docs/12` that did not exist. The panel makes one provider's opinion of one agent
 * checkable; this makes a tool's standing legible, and legible specifically as **who paid what to
 * say so**.
 *
 * Distinct from `/tool/:id`, which is keyed on a `ModuleRegistry` id, reads the atom's own vault and
 * is testnet-only — `ModuleRegistry` is not going to mainnet (ADR `0025`). This page is keyed on an
 * atom, reads the incoming `uses` edges, and is a mainnet view.
 *
 * It reads and does not write. No staking control in this first version (`tasks/23`): ADR `0017`'s
 * seven safeguards apply the moment a deposit becomes possible, and they are acceptance criteria
 * rather than advice.
 */
export function ToolUsagePanel() {
    const {atomId} = useParams();
    const valid = isToolAtomId(atomId);
    const query = useToolUsage(valid ? atomId : null);

    if (!valid) {
        return (
            <section>
                <h1 className="text-[length:var(--text-display)] leading-[var(--leading-display)] tracking-tight font-semibold">
                    Not an atom id
                </h1>
                <p className="mt-4 max-w-[60ch] text-[color:var(--color-fg-60)]">
                    A tool is addressed by its Intuition atom id — 0x followed by 32 bytes. Got{" "}
                    <span className="font-mono">{atomId ?? "nothing"}</span>.
                </p>
            </section>
        );
    }

    return (
        <section>
            <MainnetNotice />
            <div aria-live="polite" aria-busy={query.isPending}>
                {query.isPending ? (
                    <p className="mt-10 text-[color:var(--color-fg-60)]">
                        Reading the <span className="font-mono">uses</span> edges of{" "}
                        <span className="font-mono">{truncateMiddle(atomId)}</span> on Intuition
                        mainnet…
                    </p>
                ) : query.isError ? (
                    <div className="mt-10">
                        <h1 className="text-[length:var(--text-display)] leading-[var(--leading-display)] tracking-tight font-semibold">
                            The read failed
                        </h1>
                        <p className="mt-4 max-w-[60ch] text-[color:var(--color-fg-60)]">
                            {query.error instanceof Error
                                ? query.error.message
                                : String(query.error)}
                        </p>
                    </div>
                ) : (
                    <ToolUsageBody view={query.data} />
                )}
            </div>
        </section>
    );
}

function ToolUsageBody({view}: {view: ToolUsageView}) {
    return (
        <div className="mt-10 grid gap-x-12 gap-y-10 md:grid-cols-[18rem_1fr] md:items-start">
            <aside>
                <h1 className="text-[length:var(--text-display)] leading-[var(--leading-display)] tracking-tight font-semibold break-words">
                    {view.label ?? "Unnamed atom"}
                </h1>
                <dl className="mt-6 border-t border-[color:var(--color-border)] pt-4 text-[length:var(--text-body-sm)]">
                    <dt className="text-[color:var(--color-fg-60)] text-[length:var(--text-label)] uppercase tracking-wider">
                        Atom
                    </dt>
                    <dd className="mt-1 font-mono break-all">{view.toolAtomId}</dd>
                    {view.pinnedUri === null ? null : (
                        <>
                            <dt className="mt-4 text-[color:var(--color-fg-60)] text-[length:var(--text-label)] uppercase tracking-wider">
                                Pinned at
                            </dt>
                            <dd className="mt-1 font-mono break-all">{view.pinnedUri}</dd>
                        </>
                    )}
                    <dt className="mt-4 text-[color:var(--color-fg-60)] text-[length:var(--text-label)] uppercase tracking-wider">
                        Declared uses
                    </dt>
                    <dd className="mt-1 font-mono tabular-nums">{view.edges.length}</dd>
                </dl>

                {/* Gated on the POSITION count, not on `isEmpty`. Measured on mainnet
                    2026-10-19: 20 of the 84 atoms that are the object of a `uses` edge have zero
                    positions and non-zero summed assets, because every edge carries creation dust
                    (ADR 0042). Rendering the sidebar for those printed
                    "Staked for <0.00000001 across 0 positions" beside the banner saying nobody has
                    staked anything — two statements on one screen that cannot both be true. */}
                {view.totals.supportPositions > 0 ? <Totals view={view} /> : null}

                <a
                    href={`${INTUITION_MAINNET_EXPLORER}/address/${view.toolAtomId}`}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-6 inline-block text-[length:var(--text-body-sm)] text-[color:var(--color-accent)]"
                >
                    Explorer →
                </a>
            </aside>

            <div className="min-w-0">
                {view.isEmpty ? <EmptyState atomId={view.toolAtomId} /> : <Edges view={view} />}
                {/* "Everything above prices the claim…" is false with nothing above it. */}
                {view.isEmpty ? null : <OtherMarket />}
                <Ladder view={view} />
            </div>
        </div>
    );
}

/**
 * The summed market, and never the sum alone.
 *
 * `ToolUsage.totals` carries the position counts for exactly this reason: summing assets across
 * edges without them turns a handful of convictions into something that reads like liquidity.
 *
 * **Not `StakerCount` here, and that is the trap ADR `0023` predicted in writing.** Its accessible
 * name is "N distinct stakers", which is true of a `MarketSide` scoped to one vault — ADR `0023`
 * says so outright — and **false of a sum across edges**, where one account backing two tools is
 * counted twice. The rows below use `StakerCount` because each is a single vault; this says
 * "positions" because that is all a sum can claim.
 */
function Totals({view}: {view: ToolUsageView}) {
    return (
        <dl className="mt-6 border-t border-[color:var(--color-border)] pt-4 text-[length:var(--text-body-sm)]">
            <dt className="text-[color:var(--color-fg-60)] text-[length:var(--text-label)] uppercase tracking-wider">
                Staked for
            </dt>
            <dd className="mt-1 font-mono tabular-nums">
                {formatTrust(view.totals.supportAssets)}{" "}
                <span className="text-[color:var(--color-fg-60)]">
                    across {view.totals.supportPositions}{" "}
                    {view.totals.supportPositions === 1 ? "position" : "positions"}
                </span>
            </dd>
            {view.totals.opposePositions > 0 ? (
                <>
                    <dt className="mt-4 text-[color:var(--color-fg-60)] text-[length:var(--text-label)] uppercase tracking-wider">
                        Staked against
                    </dt>
                    <dd className="mt-1 font-mono tabular-nums">
                        {formatTrust(view.totals.opposeAssets)}{" "}
                        <span className="text-[color:var(--color-fg-60)]">
                            across {view.totals.opposePositions}{" "}
                            {view.totals.opposePositions === 1 ? "position" : "positions"}
                        </span>
                    </dd>
                </>
            ) : null}
        </dl>
    );
}

function Edges({view}: {view: ToolUsageView}) {
    return (
        <>
            {view.isEntirelyUnpriced ? (
                <p className="mb-6 max-w-[70ch] border border-[color:var(--color-border-strong)] px-4 py-3 text-[length:var(--text-body-sm)]">
                    Every declaration below is free. Nobody has put TRUST behind any of these
                    claims, so there is no market here to read — not a weak one.
                </p>
            ) : null}
            <ul>
                {view.edges.map((edge, index) => (
                    <UsageEdgeRow
                        key={edge.tripleId}
                        edge={edge}
                        // The list is sorted by tier, so "first of its tier" is "differs from the
                        // one above" — the caption prints once per run rather than once per row.
                        isFirstOfTier={index === 0 || view.edges[index - 1]?.tier !== edge.tier}
                    />
                ))}
            </ul>
        </>
    );
}

/**
 * The empty state, for the overwhelming majority of atoms, which nobody has declared using.
 *
 * Not "the roughly 88,000 atoms": 88,243 is the count of ERC-8004 identities on **Base**
 * (`docs/12:10`), of which Intuition mirrors 28,648. It is not a count of Intuition-mainnet atoms,
 * and that population has not been measured. What has: **84** atoms are the object of a `uses` edge
 * on 1155 (`scripts/measure-tool-atom-shape.ts`).
 *
 * Says what would be here and how it appears, per `rules/ui.md`, and is not a pitch. It also does
 * not pretend the absence is informative: nobody declaring a tool is not evidence against it.
 *
 * **No measured figure in the copy.** A first draft said "84 of the atoms on mainnet are the object
 * of a `uses` edge" — true on 2026-10-19 (`scripts/measure-tool-atom-shape.ts`) and guaranteed to
 * rot on screen, where nobody can re-run it. The shape of the claim survives without the number.
 */
function EmptyState({atomId}: {atomId: string}) {
    return (
        <div>
            <h2 className="text-[length:var(--text-body)] font-medium">No declared uses</h2>
            <p className="mt-3 max-w-[70ch] text-[color:var(--color-fg-60)]">
                No agent has declared using{" "}
                <span className="font-mono">{truncateMiddle(atomId)}</span>. An edge appears here
                when an agent writes <span className="font-mono">(agent, uses, this atom)</span> on
                Intuition mainnet and, usually in a second transaction, deposits TRUST on that edge.
            </p>
            <p className="mt-3 max-w-[70ch] text-[color:var(--color-fg-60)]">
                An empty page says nothing about the tool. Almost every atom on the graph is in this
                state, because almost nobody has written a <span className="font-mono">uses</span>{" "}
                edge yet.
            </p>
        </div>
    );
}

/**
 * What is on screen, in words, counted rather than implied.
 *
 * Built by hand rather than by mapping the labels, because "1 free assertion" and "3 free
 * assertions" differ and lowercasing a label does not pluralise it. The first version printed
 * "1 priced assertion · 1 staked off-curve · 3 free assertion" — ungrammatical on the gate fixture
 * itself. Off-curve is counted separately because it is a flag on the edge, not a rung.
 */
function describeCounts(view: ToolUsageView): string {
    const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
    const parts = DERIVABLE_TIERS.filter((tier) => view.tierCounts[tier] > 0).map((tier) =>
        plural(
            view.tierCounts[tier],
            TIER_LABEL[tier].toLowerCase(),
            `${TIER_LABEL[tier].toLowerCase()}s`,
        ),
    );
    const offCurve = view.edges.filter((edge) => edge.isOffCurve).length;
    if (offCurve > 0) parts.push(`${offCurve} staked off-curve`);
    return parts.join(" · ");
}

/**
 * The market this page does **not** read, named once.
 *
 * A deposit can sit on the tool's own atom instead of on the `uses` edge, and 74 of the 185 mainnet
 * edges are in exactly that state (`scripts/measure-stake-vault-placement.ts`). Pricing the edge is
 * the right choice — it is the claim, it is contestable, and it is attributable (ADR `0039`) — but
 * it means "nothing staked on this claim" is not "nothing staked on this tool", and a reader will
 * take the first for the second unless told.
 */
function OtherMarket() {
    return (
        <p className="mt-10 max-w-[70ch] text-[length:var(--text-body-sm)] text-[color:var(--color-fg-60)]">
            Everything above prices the <em>claim</em> that an agent used this tool. A deposit can
            also sit on the tool's own atom — a market on the tool in general, open to anyone for
            any reason, which this page does not read and which is often the larger of the two.
        </p>
    );
}

/**
 * The scale, including the rungs this page cannot reach.
 *
 * Without it a priced assertion reads as the best evidence that exists. `docs/14`'s ladder has five
 * rungs and this data distinguishes two; saying so is cheaper than implying the other three are
 * unoccupied rather than unread.
 */
function Ladder({view}: {view: ToolUsageView}) {
    // What is actually on screen, counted rather than implied. `tierCounts` exists for this.
    // Not `ToolUsageView | null`: there is one call site and it always has a view, so the null
    // branch was unreachable.
    const counts = view.isEmpty ? null : describeCounts(view);
    return (
        <section className="mt-12 border-t border-[color:var(--color-border)] pt-6">
            <h2 className="text-[length:var(--text-label)] uppercase tracking-wider text-[color:var(--color-fg-60)]">
                What this page can and cannot know
            </h2>
            {counts === null ? null : (
                <p className="mt-3 max-w-[70ch] text-[length:var(--text-body-sm)]">{counts}</p>
            )}
            <dl className="mt-4 space-y-3 text-[length:var(--text-body-sm)]">
                {UNREACHABLE_TIERS.map((tier) => (
                    <div key={tier} className="flex flex-wrap gap-x-3">
                        <dt className="text-[color:var(--color-fg-60)] line-through">
                            {TIER_LABEL[tier]}
                        </dt>
                        <dd className="max-w-[60ch] text-[color:var(--color-fg-60)]">
                            {TIER_CAPTION[tier]} {TIER_UNREACHABLE_REASON[tier]}
                        </dd>
                    </div>
                ))}
            </dl>
            <p className="mt-4 max-w-[70ch] text-[length:var(--text-body-sm)] text-[color:var(--color-fg-60)]">
                Position counts here are scoped to one bonding curve, while the amounts are the
                term's across every curve — two different populations, which is why an edge holding
                TRUST on another curve shows as <span className="font-mono">staked off-curve</span>{" "}
                rather than as a figure. Reading the curve from the chain is the fix and it belongs
                to the connector.
            </p>
            <p className="mt-4 max-w-[70ch] text-[length:var(--text-body-sm)] text-[color:var(--color-fg-60)]">
                The three rungs struck through are <em>higher</em> on the ladder than anything this
                page can show, and nothing in this project reads them yet. Their absence here is not
                evidence that nobody is on them. What the edges carry — a priced or a free assertion
                — sits at the bottom of a scale that continues above.
            </p>
        </section>
    );
}
