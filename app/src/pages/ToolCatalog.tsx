import {useId, useState} from "react";
import {Link} from "react-router-dom";

import {CurveControl, Segmented} from "../components/tool/ToolCatalogControls";
import {linkClass} from "../lib/control-class";
import type {ToolListingOrder} from "@arp-protocol/core";

import {MainnetNotice} from "../components/agent/MainnetNotice";
import {ToolCatalogList} from "../components/tool/ToolCatalogList";
import {useToolCatalog} from "../hooks/use-tool-catalog";
import {
    matchesFilters,
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
 * It reads **Intuition mainnet**, so it renders `MainnetNotice` itself and the route is listed in
 * `Layout.readsMainnet` — without both, the shell would print "no real value at stake" above real
 * TRUST sums, which `Layout`'s own comment calls the most expensive sentence in the app.
 *
 * This is the nav's "Tools" (user, 2026-10-20), so the `h1` is "Tools" and the subtitle carries the
 * population and the chain — `/` lists a different population on a different chain and still says
 * "Tools" too, which its own heading will have to resolve.
 *
 * No order by score, and no column for one: ARP composes none (ADR `0046`).
 */

export function ToolCatalog() {
    const [order, setOrder] = useState<ToolListingOrder>("priced-edges");
    // Curve 1 is the default because it is the durable signal: linear, so a position's gain follows
    // the tool's growth rather than the holder's timing. Curve 2 is where the money sits today, and
    // that is a different question — `TOOL_CURVES` has the measurement.
    const [curveId, setCurveId] = useState(TOOL_CURVES[0]?.id ?? 1);
    /**
     * The reader's filters, and none is on by default.
     *
     * A default filter is a ranking wearing another name. The question was "can we highlight the
     * good ones?", and the answer is that ARP has no opinion to highlight with (ADR `0046`) — a
     * badge granted by two metrics is two metrics somebody farms, and a sybil costs $0.00005 an
     * address here. What it has is dimensions the reader narrows on, differently from the next
     * reader.
     */
    const [filters, setFilters] = useState<ToolFilter[]>([]);
    const query = useToolCatalog(order, curveId);
    const view = query.data;
    /**
     * The filtered rows and what the filters could not answer, derived here rather than in the JSX.
     *
     * It was an IIFE wrapping a three-deep ternary inside the render, which recomputed every render
     * and could not be reached by `useMemo`. Three branches read as three branches when they are not
     * nested inside an expression.
     */
    const visible = (view?.rows ?? []).filter((row) => matchesFilters(row, filters));
    const unknowable = unknowableUnder(view?.rows ?? [], filters);

    return (
        <section>
            <MainnetNotice />

            <header className="mt-8 mb-6 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-3">
                <div>
                    <h1 className="font-sans text-[length:var(--text-display)] leading-[var(--leading-display)] tracking-tight font-semibold">
                        Tools
                    </h1>
                    <p className="mt-2 text-[color:var(--color-steel)] max-w-[64ch]">
                        Tools somebody registered, and tools agents declared using, on the Intuition
                        mainnet graph. ARP hosts none of them — each row is a pointer with a vault.
                    </p>
                </div>
                <div className="flex flex-wrap items-baseline gap-x-6 gap-y-3">
                    <CurveControl curveId={curveId} onChange={setCurveId} />
                    <Segmented
                        label="Order"
                        selected={order}
                        onChange={setOrder}
                        options={TOOL_ORDERS}
                    />
                    <FilterControl
                        active={filters}
                        onToggle={(filter) =>
                            setFilters((previous) =>
                                previous.includes(filter)
                                    ? previous.filter((entry) => entry !== filter)
                                    : [...previous, filter],
                            )
                        }
                    />
                </div>
            </header>

            {/* The list survives a failed refetch: `keepPreviousData` still holds the rows, and
                replacing them with an error would lose a good read to a transient one. */}
            {view === undefined ? (
                query.error === null ? (
                    <p
                        aria-live="polite"
                        className="font-mono text-[length:var(--text-body-sm)] text-[color:var(--color-steel)]"
                    >
                        reading…
                    </p>
                ) : (
                    <Failure error={query.error} onRetry={() => void query.refetch()} />
                )
            ) : visible.length === 0 && view.rows.length > 0 && filters.length > 0 ? (
                // A filtered-to-empty list is a different state from an empty catalogue, and
                // saying so is the difference between "nothing matches what you asked" and
                // "nothing exists" — the second would be a false claim about the graph.
                <div className="max-w-[60ch]">
                    <p className="font-mono text-[length:var(--text-body-sm)] text-[color:var(--color-steel)]">
                        no rows match
                    </p>
                    {/* "None can answer" is not "none matches", and a reader who registered the
                        only tool on the list deserves the first. Every filter here is about
                        declarations, and a registered-only row has no per-edge figures to answer
                        with — so it is excluded on an unknown, not on a no. */}
                    <p className="mt-3 text-[length:var(--text-body-sm)] text-[color:var(--color-steel)]">
                        {unknowable === view.rows.length
                            ? view.rows.length === 1
                                ? "The one tool listed has no agent declarations yet, so these filters cannot answer for it."
                                : `None of the ${view.rows.length} tools listed has agent declarations yet, so these filters cannot answer for them.`
                            : view.rows.length === 1
                              ? "One tool is listed and it does not match."
                              : `${view.rows.length} tools are listed and none matches.`}{" "}
                        Turn a filter off to see them.
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
                        A row appears when somebody registers a tool, or when an agent declares
                        using one through the MCP server or the skill. Nobody has.
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

/**
 * The reader's filters. A checkbox group, because they combine — unlike the order, which is one of
 * three.
 *
 * `aria-pressed` on a button, not a real `<input type="checkbox">`, to match the two segmented
 * controls beside it: three different widget idioms in one header would be worse than one idiom used
 * for a slightly different job, and `aria-pressed` is the APG's toggle-button pattern.
 */
function FilterControl({
    active,
    onToggle,
}: {
    active: readonly ToolFilter[];
    onToggle: (filter: ToolFilter) => void;
}) {
    const labelId = useId();
    return (
        <div className="flex items-baseline gap-3">
            <span
                id={labelId}
                className="font-mono uppercase tracking-wider text-[length:var(--text-label)] text-[color:var(--color-steel)]"
            >
                Only
            </span>
            <div role="group" aria-labelledby={labelId} className="flex flex-wrap gap-1">
                {TOOL_FILTERS.map((filter) => {
                    const on = active.includes(filter.id);
                    return (
                        <button
                            key={filter.id}
                            type="button"
                            aria-pressed={on}
                            title={filter.title}
                            onClick={() => onToggle(filter.id)}
                            // Banged, like every other selected state here: `index.css`'s unlayered
                            // `button { border; color }` beats any `@layer utilities` rule, and an
                            // unbanged selected state renders identically to an unselected one.
                            className={`px-3 py-1 text-[length:var(--text-body-sm)] ${
                                on
                                    ? "border-[color:var(--color-accent)]! text-[color:var(--color-accent)]!"
                                    : "border-[color:var(--color-rule-strong)]! text-[color:var(--color-steel)]!"
                            }`}
                        >
                            {filter.label}
                        </button>
                    );
                })}
            </div>
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
