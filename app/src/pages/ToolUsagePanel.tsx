import {useParams} from "react-router-dom";

import {useToolUsage, isToolAtomId} from "../hooks/use-tool-usage";
import {formatTrust, truncateMiddle} from "../services/trust-format";
import {describeCounts, opensRun, type ToolUsageView} from "../services/tool-usage-view";
import {MainnetNotice} from "../components/agent/MainnetNotice";
import {UsageEdgeRow} from "../components/tool/UsageEdgeRow";
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
 * **It reads and does not write**, by decision rather than by omission. It briefly carried a stake
 * form on each edge; ADR `0056` removed it. Measured on mainnet 1155 the same day, 1 of 185 `uses`
 * edges has ever been contradicted and 969 of 285,775 triples chain-wide — so the edge is not a
 * two-sided market, and soliciting a deposit on one invited the reader to look for a disagreement
 * that is not there. What the edge costs to write is the signal: 0.1 TRUST in a non-recoverable
 * protocol fee, paid once per claim. A position somebody did take is still displayed.
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
                <p className="mt-4 max-w-[60ch] text-[color:var(--color-steel)]">
                    A tool is addressed by its Intuition atom id — 0x followed by 32 bytes. Got{" "}
                    <span className="font-mono">{atomId ?? "nothing"}</span>.
                </p>
            </section>
        );
    }

    return (
        <section>
            <MainnetNotice />
            {/* `aria-live` is on the two transient branches, not on the wrapper. A live region
                announces every descendant mutation that does not establish its own, so a wrapper
                region turned a form's per-keystroke help text into a polite announcement per
                keystroke. The forms are gone (ADR `0056`) but the rule that cost us that is not,
                and the next thing added under this wrapper would hit it again. */}
            <div>
                {query.isPending ? (
                    <p
                        aria-live="polite"
                        aria-busy
                        className="mt-10 text-[color:var(--color-steel)]"
                    >
                        Reading the <span className="font-mono">uses</span> edges of{" "}
                        <span className="font-mono">{truncateMiddle(atomId)}</span> on Intuition
                        mainnet…
                    </p>
                ) : query.isError ? (
                    <div aria-live="polite" className="mt-10">
                        <h1 className="text-[length:var(--text-display)] leading-[var(--leading-display)] tracking-tight font-semibold">
                            The read failed
                        </h1>
                        <p className="mt-4 max-w-[60ch] text-[color:var(--color-steel)]">
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
                <dl className="mt-6 border-t border-[color:var(--color-rule)] pt-4 text-[length:var(--text-body-sm)]">
                    <dt className="text-[color:var(--color-steel)] text-[length:var(--text-label)] uppercase tracking-wider">
                        Atom
                    </dt>
                    <dd className="mt-1 font-mono break-all">{view.toolAtomId}</dd>
                    {view.pinnedUri === null ? null : (
                        <>
                            <dt className="mt-4 text-[color:var(--color-steel)] text-[length:var(--text-label)] uppercase tracking-wider">
                                Pinned at
                            </dt>
                            <dd className="mt-1 font-mono break-all">{view.pinnedUri}</dd>
                        </>
                    )}
                    <dt className="mt-4 text-[color:var(--color-steel)] text-[length:var(--text-label)] uppercase tracking-wider">
                        Declared uses
                    </dt>
                    <dd className="mt-1 font-mono tabular-nums">{view.edges.length}</dd>
                </dl>

                {/* Gated on the POSITION count, not on `isEmpty`. `scripts/measure/tool-page-states.ts`
                    counts which state every tool atom would render: on mainnet 2026-10-19, 64 of 84
                    render the sidebar and **20 have it gated** — 19 entirely free plus the one
                    off-curve atom — because every edge carries creation dust (ADR 0042). Rendering
                    it for those printed "Staked for <0.00000001 across 0 positions" beside the
                    banner saying nobody has staked anything: two statements on one screen that
                    cannot both be true. */}
                {view.totals.supportPositions > 0 || view.totals.opposePositions > 0 ? (
                    <Totals view={view} />
                ) : null}

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
                {view.isEmpty ? (
                    <EmptyState atomId={view.toolAtomId} />
                ) : (
                    <Edges view={view} />
                )}
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
        <dl className="mt-6 border-t border-[color:var(--color-rule)] pt-4 text-[length:var(--text-body-sm)]">
            {view.totals.supportPositions > 0 ? (
                <>
                    <dt className="text-[color:var(--color-steel)] text-[length:var(--text-label)] uppercase tracking-wider">
                        Staked for
                    </dt>
                    <dd className="mt-1 font-mono tabular-nums">
                        {formatTrust(view.totals.supportAssets)}{" "}
                        <span className="text-[color:var(--color-steel)]">
                            across {view.totals.supportPositions}{" "}
                            {view.totals.supportPositions === 1 ? "position" : "positions"}
                        </span>
                    </dd>
                    <dd className="mt-1 max-w-[30ch] font-sans text-[length:var(--text-label)] text-[color:var(--color-steel)]">
                        Amounts cover every curve; the counts cover one.
                    </dd>
                </>
            ) : null}
            {view.totals.opposePositions > 0 ? (
                <>
                    <dt className="mt-4 text-[color:var(--color-steel)] text-[length:var(--text-label)] uppercase tracking-wider">
                        Staked against
                    </dt>
                    <dd className="mt-1 font-mono tabular-nums">
                        {formatTrust(view.totals.opposeAssets)}{" "}
                        <span className="text-[color:var(--color-steel)]">
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
            {/* Counted, not implied. `tierCounts` exists for this. */}
            <p className="mb-6 text-[length:var(--text-body-sm)] text-[color:var(--color-steel)]">
                {describeCounts(view)}
            </p>
            {view.isEntirelyUnpriced ? (
                <p className="mb-6 max-w-[70ch] border border-[color:var(--color-rule-strong)] px-4 py-3 text-[length:var(--text-body-sm)]">
                    Nothing stands behind the claims below. The tool&rsquo;s own atom is a
                    separate market, not read here.
                </p>
            ) : null}
            <ul>
                {view.edges.map((edge, index) => (
                    <UsageEdgeRow
                        key={edge.tripleId}
                        edge={edge}
                        // `opensRun` lives in the service because this predicate was wrong here: it
                        // keyed on the tier while the row renders from the tier AND `isOffCurve`,
                        // which suppressed the caption on the first free row after an off-curve one.
                        isFirstOfTier={opensRun(view.edges, index)}
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
 * on 1155 (`scripts/measure/tool-atom-shape.ts`).
 *
 * Says what would be here and how it appears, per `rules/ui.md`, and is not a pitch. It also does
 * not pretend the absence is informative: nobody declaring a tool is not evidence against it.
 *
 * **No measured figure in the copy.** A first draft said "84 of the atoms on mainnet are the object
 * of a `uses` edge" — true on 2026-10-19 (`scripts/measure/tool-atom-shape.ts`) and guaranteed to
 * rot on screen, where nobody can re-run it. The shape of the claim survives without the number.
 */
function EmptyState({atomId}: {atomId: string}) {
    return (
        <div>
            <h2 className="text-[length:var(--text-body)] font-medium">No declared uses</h2>
            <p className="mt-3 max-w-[70ch] text-[color:var(--color-steel)]">
                No agent has declared using{" "}
                <span className="font-mono">{truncateMiddle(atomId)}</span>.
            </p>
        </div>
    );
}
