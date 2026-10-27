import {useState} from "react";
import {Link} from "react-router-dom";

import {CurveControl, Segmented} from "../components/tool/ToolCatalogControls";
import {linkClass} from "../lib/control-class";
import type {ToolListingOrder} from "@arp-protocol/core";

import {PageLoading} from "../components/brand/PageLoading";
import {ToolCatalogList} from "../components/tool/ToolCatalogList";
import {useToolCatalog} from "../hooks/use-tool-catalog";
import {
    curveLabelOf,
    matchesFilter,
    TOOL_CURVES,
    TOOL_FILTERS,
    TOOL_ORDERS,
    unknowableUnder,
    type ToolFilter,
} from "../services/tool-catalog";

/**
 * `/tools` — tools agents declared using, with what is staked behind each.
 *
 * Agent declarations only. The `uses` predicate is shared and most of what sits on it is ordinary
 * prose, filtered out in the query rather than shown under a caveat.
 *
 * It reads **Intuition mainnet**. The banner that used to say so is gone (ADR `0058`); the warning
 * now lives in the confirmation step, where a wallet is about to open.
 *
 * This is the nav's "Tools" (user, 2026-10-20), so the `h1` is "Tools" and the subtitle carries the
 * population and the chain — `/` lists a different population on a different chain and still says
 * "Tools" too, which its own heading will have to resolve.
 *
 * No order by score, and no column for one: ARP composes none (ADR `0046`).
 */

export function ToolCatalog() {
    // `conviction`, not `priced-edges`. The old default ranked by how many claims carry a position
    // and is gone from the control (`TOOL_ORDERS`); money behind a claim is what separates it from
    // an assertion, so the list opens on the amount rather than on a free count.
    const [order, setOrder] = useState<ToolListingOrder>("conviction");
    // Curve 1 is the default because it is the durable signal: linear, so a position's gain follows
    // the tool's growth rather than the holder's timing. Curve 2 is where the money sits today, and
    // that is a different question — `TOOL_CURVES` has the measurement.
    const [curveId, setCurveId] = useState(TOOL_CURVES[0]?.id ?? 1);
    /**
     * What the list is narrowed to, and `all` by default.
     *
     * A default narrowing is a ranking wearing another name. The question was "can we highlight
     * the good ones?", and the answer is that ARP has no opinion to highlight with (ADR `0046`) —
     * a badge granted by two metrics is two metrics somebody farms, and a sybil costs $0.00005 an
     * address here. What it has is one axis the reader moves along.
     */
    const [filter, setFilter] = useState<ToolFilter>("all");
    const query = useToolCatalog(order, curveId);
    const view = query.data;
    /**
     * The filtered rows and what the filters could not answer, derived here rather than in the JSX.
     *
     * It was an IIFE wrapping a three-deep ternary inside the render, which recomputed every render
     * and could not be reached by `useMemo`. Three branches read as three branches when they are not
     * nested inside an expression.
     */
    const visible = (view?.rows ?? []).filter((row) => matchesFilter(row, filter));
    const unknowable = unknowableUnder(view?.rows ?? [], filter);

    return (
        <section>
            <header className="grid items-end gap-x-8 gap-y-6 pt-14 pb-10 md:grid-cols-[minmax(0,1fr)_auto]">
                <h1 className="type-display">Tools</h1>
                <dl className="flex overflow-hidden rounded-[var(--radius-card)] border border-[color:var(--color-rule)]">
                    <Fact label="In the list">
                        {view === undefined ? "—" : view.rows.length.toLocaleString("en-US")}
                    </Fact>
                    <Fact label="Curve">{curveLabelOf(curveId)}</Fact>
                </dl>
            </header>

            {/* The toolbar on its own rule, like the index's. It was inline with the `h1`, which
                at `--text-display` put four controls against a single word. */}
            <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-y border-[color:var(--color-rule)] py-3.5">
                <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
                    <Segmented
                        label="Order"
                        selected={order}
                        onChange={setOrder}
                        options={TOOL_ORDERS}
                    />
                    <Segmented
                        label="Show"
                        selected={filter}
                        onChange={setFilter}
                        options={TOOL_FILTERS}
                    />
                </div>
                <CurveControl curveId={curveId} onChange={setCurveId} />
            </div>

            {/* The list survives a failed refetch: `keepPreviousData` still holds the rows, and
                replacing them with an error would lose a good read to a transient one. */}
            {view === undefined ? (
                query.error === null ? (
                    <PageLoading label="Reading the tools">
                        reading declared tools from the intuition graph
                    </PageLoading>
                ) : (
                    <Failure error={query.error} onRetry={() => void query.refetch()} />
                )
            ) : visible.length === 0 && view.rows.length > 0 && filter !== "all" ? (
                // A filtered-to-empty list is a different state from an empty catalogue, and
                // saying so is the difference between "nothing matches what you asked" and
                // "nothing exists" — the second would be a false claim about the graph.
                <div className="max-w-[60ch]">
                    <p className="font-mono text-[length:var(--text-body-sm)] text-[color:var(--color-steel)]">
                        no rows match
                    </p>
                    {/* Two different states and one sentence each. "None can answer" is not "none
                        matches": every filter here is about declarations, and a registered-only row
                        has no per-edge figures, so it is excluded on an unknown rather than on a
                        no. A reader who registered the only tool on the list deserves the first. */}
                    <p className="mt-3 text-[length:var(--text-body-sm)] text-[color:var(--color-steel)]">
                        {unknowable === view.rows.length
                            ? "No agent has declared using these yet, so the filters cannot answer."
                            : "Turn a filter off to see them."}
                    </p>
                </div>
            ) : view.rows.length === 0 ? (
                // An empty region with nothing in it reads as a failed read, so the state is said.
                // And it says what would fill it, per `rules/ui.md`, because on this page the answer
                // is one click away and the emptiness is not informative about any tool.
                <div className="max-w-[60ch]">
                    <p className="font-mono text-[length:var(--text-body-sm)] text-[color:var(--color-steel)]">
                        nothing here yet
                    </p>
                    <p className="mt-3 text-[length:var(--text-body-sm)] text-[color:var(--color-steel)]">
                        A row appears when somebody registers a tool, or an agent declares using
                        one.
                    </p>
                    <Link to="/register" className={`mt-4 inline-block ${linkClass}`}>
                        Register the first one →
                    </Link>
                </div>
            ) : (
                <>
                    <ToolCatalogList rows={visible} curveId={view.curveId} />
                    {/* Only when it happened: a prefix presented as the whole set is the one thing
                        this page could get wrong without anyone noticing. */}
                    {view.truncated ? (
                        <p className="mt-6 text-[length:var(--text-label)] text-[color:var(--color-steel)]">
                            The read hit its limit — these are the first rows, not all of them.
                        </p>
                    ) : null}
                    {query.error === null ? null : <StaleNotice />}
                </>
            )}
        </section>
    );
}

/** One boxed figure in the header, matching the index's. */
function Fact({label, children}: {label: string; children: React.ReactNode}) {
    return (
        <div className="flex min-w-[7.5rem] flex-col gap-1.5 px-5 py-3.5 [&+&]:border-l [&+&]:border-l-[color:var(--color-rule)]">
            <dt className="font-mono text-[10px] uppercase tracking-[0.06em] text-[color:var(--color-steel)]">
                {label}
            </dt>
            <dd className="type-face text-[26px] leading-none tabular-nums">{children}</dd>
        </div>
    );
}

/** The rows on screen are the last good read, and a newer one failed. */
function StaleNotice() {
    return (
        <p className="mt-6 pl-5 border-l border-[color:var(--color-rule-strong)] text-[length:var(--text-body-sm)] text-[color:var(--color-steel)] max-w-[64ch]">
            These rows are the last successful read. The most recent one failed.
        </p>
    );
}

function Failure({error, onRetry}: {error: Error; onRetry: () => void}) {
    return (
        <div className="pl-5 border-l border-[color:var(--color-rule-strong)] max-w-[64ch]">
            <p className="font-medium">The graph read failed.</p>
            <p className="mt-2 font-mono text-[length:var(--text-body-sm)] text-[color:var(--color-steel)] break-words">
                {error.message}
            </p>
            <button
                type="button"
                onClick={onRetry}
                className="mt-4 px-3 py-1 text-[length:var(--text-body-sm)] border border-[color:var(--color-rule-strong)]"
            >
                Try again
            </button>
        </div>
    );
}
