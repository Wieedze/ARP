import {useState} from "react";
import type {ToolListingOrder} from "@arp-protocol/core";

import {MainnetNotice} from "../components/agent/MainnetNotice";
import {ToolCatalogList} from "../components/tool/ToolCatalogList";
import {useToolCatalog} from "../hooks/use-tool-catalog";
import {TOOL_CURVES, TOOL_ORDERS} from "../services/tool-catalog";

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
    const query = useToolCatalog(order, curveId);
    const view = query.data;

    return (
        <section>
            <MainnetNotice />

            <header className="mt-8 mb-6 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-3">
                <div>
                    <h1 className="font-sans text-[length:var(--text-display)] leading-[var(--leading-display)] tracking-tight font-semibold">
                        Tools
                    </h1>
                    <p className="mt-2 text-[color:var(--color-fg-60)] max-w-[64ch]">
                        Tools agents declared using, on the Intuition mainnet graph.
                    </p>
                </div>
                <div className="flex flex-wrap items-baseline gap-x-6 gap-y-3">
                    <CurveControl curveId={curveId} onChange={setCurveId} />
                    <OrderControl order={order} onChange={setOrder} />
                </div>
            </header>

            {/* The list survives a failed refetch: `keepPreviousData` still holds the rows, and
                replacing them with an error would lose a good read to a transient one. */}
            {view === undefined ? (
                query.error === null ? (
                    <p
                        aria-live="polite"
                        className="font-mono text-[length:var(--text-body-sm)] text-[color:var(--color-fg-60)]"
                    >
                        reading…
                    </p>
                ) : (
                    <Failure error={query.error} onRetry={() => void query.refetch()} />
                )
            ) : view.rows.length === 0 ? (
                // The list's own state, in as few words as it takes. An empty region with nothing
                // in it reads as a failed read.
                <p className="font-mono text-[length:var(--text-body-sm)] text-[color:var(--color-fg-60)]">
                    no declarations yet
                </p>
            ) : (
                <>
                    <ToolCatalogList rows={view.rows} curveId={view.curveId} />
                    {/* Only when it happened: a prefix presented as the whole set is the one thing
                        this page could get wrong without anyone noticing. */}
                    {view.truncated ? (
                        <p className="mt-6 text-[length:var(--text-label)] text-[color:var(--color-fg-60)]">
                            The read hit its limit — these are the first rows, not all of them.
                        </p>
                    ) : null}
                    {query.error === null ? null : <StaleNotice />}
                </>
            )}
        </section>
    );
}

/** The rows on screen are the last good read, and a newer one failed. */
function StaleNotice() {
    return (
        <p className="mt-6 pl-5 border-l border-[color:var(--color-border-strong)] text-[length:var(--text-body-sm)] text-[color:var(--color-fg-60)] max-w-[64ch]">
            These rows are the last successful read. The most recent one failed.
        </p>
    );
}

/**
 * Which bonding curve the figures come from.
 *
 * A selector and not two columns: the two are different markets, so a reader compares them by
 * switching rather than by reading a total that would erase the difference. "Long term" and "Short
 * term" name what a position on each one means; the curve's own name is in the `title` and the
 * subtitle for anyone who wants it.
 */
function CurveControl({curveId, onChange}: {curveId: number; onChange: (next: number) => void}) {
    return (
        <div className="flex items-baseline gap-3">
            <span
                id="tool-curve-label"
                className="font-mono uppercase tracking-wider text-[length:var(--text-label)] text-[color:var(--color-fg-60)]"
            >
                Horizon
            </span>
            <div role="group" aria-labelledby="tool-curve-label" className="flex gap-1">
                {TOOL_CURVES.map((entry) => (
                    <button
                        key={entry.id}
                        type="button"
                        aria-pressed={entry.id === curveId}
                        onClick={() => onChange(entry.id)}
                        title={entry.curve}
                        className={`px-3 py-1 text-[length:var(--text-body-sm)] border ${
                            entry.id === curveId
                                ? "border-[color:var(--color-accent)] text-[color:var(--color-accent)]"
                                : "border-[color:var(--color-border-strong)] text-[color:var(--color-fg-60)]"
                        }`}
                    >
                        {entry.label}
                    </button>
                ))}
            </div>
        </div>
    );
}

function OrderControl({
    order,
    onChange,
}: {
    order: ToolListingOrder;
    onChange: (next: ToolListingOrder) => void;
}) {
    return (
        <div className="flex items-baseline gap-3">
            <span
                id="tool-order-label"
                className="font-mono uppercase tracking-wider text-[length:var(--text-label)] text-[color:var(--color-fg-60)]"
            >
                Order
            </span>
            {/* `px-3 py-1 border`, selected in the accent, because `index.css`'s unlayered `button`
                rule sets a full 1px border and beats every Tailwind `border-*` utility — a
                `border-b` here renders as a tight box with no selected state at all. */}
            <div role="group" aria-labelledby="tool-order-label" className="flex gap-1">
                {TOOL_ORDERS.map((entry) => (
                    <button
                        key={entry.id}
                        type="button"
                        aria-pressed={entry.id === order}
                        onClick={() => onChange(entry.id)}
                        className={`px-3 py-1 text-[length:var(--text-body-sm)] border ${
                            entry.id === order
                                ? "border-[color:var(--color-accent)] text-[color:var(--color-accent)]"
                                : "border-[color:var(--color-border-strong)] text-[color:var(--color-fg-60)]"
                        }`}
                    >
                        {entry.label}
                    </button>
                ))}
            </div>
        </div>
    );
}

function Failure({error, onRetry}: {error: Error; onRetry: () => void}) {
    return (
        <div className="pl-5 border-l border-[color:var(--color-border-strong)] max-w-[64ch]">
            <p className="font-medium">The graph read failed.</p>
            <p className="mt-2 font-mono text-[length:var(--text-body-sm)] text-[color:var(--color-fg-60)] break-words">
                {error.message}
            </p>
            <button
                type="button"
                onClick={onRetry}
                className="mt-4 px-3 py-1 text-[length:var(--text-body-sm)] border border-[color:var(--color-border-strong)]"
            >
                Try again
            </button>
        </div>
    );
}
