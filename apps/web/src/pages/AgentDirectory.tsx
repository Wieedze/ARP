import {useId, useState} from "react";
import {useNavigate} from "react-router-dom";
import type {AgentListOrder} from "@arp-protocol/core";

import {CapabilityFilter, CapabilityResults} from "../components/agent/CapabilitySearch";
import {CohortList} from "../components/agent/CohortList";
import {PageLoading} from "../components/brand/PageLoading";
import {useChainChoice} from "../lib/chain-choice";
import {controlClass} from "../lib/control-class";
import {COHORT_PAGE_SIZE, useAgentCohort} from "../hooks/use-agent-cohort";
import {COHORT_ORDERS, describeCohortFailure, orderLabel} from "../services/agent-cohort";

/**
 * `/agents` — the index.
 *
 * ## Rebuilt 2026-10-27 from the second design handoff
 *
 * `docs/design/arp-design-handoff/arp-design-handoff 2/reference/agents.html`. The user's verdict on what was
 * here: _« tout est mal disposé, surtout en haut avec le find capability et le titre erc8004
 * agents, ça ne va pas du tout. Le whole cohort non plus, enfin rien ne va. »_ Three specific
 * faults, and each one is fixed by the reference rather than by taste:
 *
 * 1. **The title was `ERC-8004 agents` at 32px** — a standard spelling nobody says out loud, at a
 *    size that barely cleared body copy. It is `Agents.` over a dim second line now, at
 *    `--text-display` (up to 88px), with the standard named in the kicker where a standard belongs.
 * 2. **Two headings for one list.** "Find by capability" sat above the list with its own heading,
 *    then "The whole cohort" above the rows. The filter is in the toolbar now and its results
 *    *replace* the rows, so there is one list and no heading over it — the toolbar says what it is.
 * 3. **Nothing anchored the page.** The reference's `.facts` box puts the one number this page is
 *    about in the top right, boxed, against the title.
 *
 * ## Two columns the reference has and this page does not
 *
 * `DOMAIN` and `RECEIPTS`. Neither has data behind it: the cohort read samples capability edges but
 * does not resolve a single domain per agent, and a receipt is an action executed under enforced
 * caveats, which nothing in this app produces yet. Rendering either would be a column of invented
 * values, and `rules/claims.md` is the whole reason not to. They arrive when the data does.
 *
 * Both orders rank by what cost somebody something to produce. There is no order-by-score button
 * and never will be (ADR `0046`).
 */

const LOOKUP_CHAINS: {id: number; label: string; note: string}[] = [
    {id: 8453, label: "Base (8453)", note: "mirrored into the Intuition graph"},
    {id: 56, label: "BSC (56)", note: "registry only — no trust edges in the graph"},
    {id: 1, label: "Ethereum (1)", note: "registry only — no trust edges in the graph"},
];

export function AgentDirectory() {
    const chain = useChainChoice();
    const [order, setOrder] = useState<AgentListOrder>("evidence-quantity");
    const [offset, setOffset] = useState(0);
    const [draft, setDraft] = useState("");
    const [filter, setFilter] = useState("");
    const cohortQuery = useAgentCohort(order, offset);
    const view = cohortQuery.data;
    const isFiltered = filter.trim().length > 0;

    function changeOrder(next: AgentListOrder) {
        // A page number means nothing across two different orders, so paging restarts rather than
        // carrying an offset into a sequence it was not measured against.
        setOrder(next);
        setOffset(0);
    }

    return (
        <section>
            <header className="grid items-end gap-x-8 gap-y-6 pt-14 pb-10 md:grid-cols-[minmax(0,1fr)_auto]">
                {/* The name of the thing, and nothing else.
                    The reference's header is a kicker — "AGENT INDEX · INTUITION TESTNET 13579" —
                    over "Agents." and a dim "Sorted by what is at stake.". The user rejected both
                    (2026-10-27), and on the same grounds as the rail's notes: the kicker restates
                    what the page already is, and the second line comments on **our** choice of
                    sort. Neither tells a reader anything the page does not already show — the
                    chain and the count are in the box to the right, and the sort is a control.

                    What is left is `rules/ui.md`'s own argument: "typography-driven, hierarchy
                    comes from type weight and size". One word at `--text-display` is the design. */}
                <h1 className="type-display">Agents</h1>

                {/* One cell per fact, and only facts. The reference has three — AGENTS, STAKED,
                    RECEIPTS — and the other two would be fabricated here: the cohort read does not
                    sum staked value across the index, and receipts do not exist. */}
                <dl className="flex overflow-hidden rounded-[var(--radius-card)] border border-[color:var(--color-rule)]">
                    <Fact label="In the index">
                        {view?.total === null || view === undefined
                            ? "—"
                            : view.total.toLocaleString("en-US")}
                    </Fact>
                    <Fact label="Chain">{chain.label}</Fact>
                </dl>
            </header>

            <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4 border-y border-[color:var(--color-rule)] py-3.5">
                <CapabilityFilter value={draft} onChange={setDraft} onSubmit={setFilter} />
                {isFiltered ? null : <OrderControl order={order} onChange={changeOrder} />}
            </div>

            {isFiltered ? (
                <div className="mt-8">
                    <CapabilityResults domain={filter} />
                </div>
            ) : cohortQuery.error !== null ? (
                <CohortError
                    error={cohortQuery.error}
                    order={order}
                    onRetry={() => void cohortQuery.refetch()}
                    onSwitchOrder={changeOrder}
                />
            ) : view === undefined ? (
                <PageLoading label="Reading the cohort" />
            ) : (
                <>
                    <CohortList view={view} />
                    <nav
                        aria-label="Cohort pages"
                        className="mt-5 flex flex-wrap items-center justify-between gap-x-6 gap-y-3"
                    >
                        <p
                            aria-live="polite"
                            className="font-mono text-[length:var(--text-body-sm)] text-[color:var(--color-steel)] tabular-nums"
                        >
                            {view.rangeLabel}
                            {cohortQuery.isPlaceholderData ? " · reading…" : ""}
                        </p>
                        <div className="flex gap-3">
                            <PageButton
                                label="← Previous"
                                disabled={!view.hasPrevious}
                                onClick={() => setOffset(Math.max(0, offset - COHORT_PAGE_SIZE))}
                            />
                            <PageButton
                                label="Next →"
                                disabled={!view.hasNext}
                                onClick={() => setOffset(offset + COHORT_PAGE_SIZE)}
                            />
                        </div>
                    </nav>
                </>
            )}

            <section className="mt-24 border-t border-[color:var(--color-rule)] pt-10">
                <h2 className="type-section">
                    Or open one<span className="text-[color:var(--color-grey)]"> by id.</span>
                </h2>
                <p className="mt-4 mb-7 max-w-[64ch] text-[color:var(--color-silver)]">
                    The index is Base only. Agents on BSC and Ethereum open by token id.
                </p>
                <LookupForm />
            </section>
        </section>
    );
}

/** One boxed figure in the header. Mono label above, display numeral below. */
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

/**
 * The order, as the reference's segmented `.sort` group: one bordered strip, hairlines between,
 * the selected cell raised.
 *
 * It was three bordered pills beside a mono "ORDER" label. The label is gone — the control is in
 * a toolbar whose only other item is a filter, and "STATEMENTS / CONVICTION" reads as a sort
 * without being told it is one.
 */
function OrderControl({
    order,
    onChange,
}: {
    order: AgentListOrder;
    onChange: (next: AgentListOrder) => void;
}) {
    const labelId = useId();
    return (
        <div
            role="group"
            aria-labelledby={labelId}
            className="flex overflow-hidden rounded-[var(--radius-control)] border border-[color:var(--color-rule)]"
        >
            <span id={labelId} className="sr-only">
                Order the index
            </span>
            {COHORT_ORDERS.map((entry) => {
                const selected = entry.id === order;
                return (
                    <button
                        key={entry.id}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => onChange(entry.id)}
                        // Banged, and `border-transparent!` rather than no border: `index.css`'s
                        // unlayered `button { border: 1px solid … }` would otherwise draw a box
                        // inside the strip's own border on every cell.
                        className={`h-[34px] border-transparent! px-3 font-mono text-[11px] uppercase tracking-wider [&+&]:border-l-[color:var(--color-rule)]! ${
                            selected
                                ? "bg-[color:var(--color-raised)] text-[color:var(--color-fg)]!"
                                : "text-[color:var(--color-steel)]! hover:text-[color:var(--color-fg)]!"
                        }`}
                    >
                        {entry.label}
                    </button>
                );
            })}
        </div>
    );
}

function PageButton({
    label,
    disabled,
    onClick,
}: {
    label: string;
    disabled: boolean;
    onClick: () => void;
}) {
    return (
        <button type="button" disabled={disabled} onClick={onClick} className={controlClass}>
            {label}
        </button>
    );
}

/**
 * A failed listing, said out loud.
 *
 * An empty list reads as "there are no agents", which is the one thing it definitely does not
 * mean — so the failure takes the space the rows would have had and names itself. A deadline also
 * offers the other order, because a reader whose sort just failed should not have to guess whether
 * the page is broken or the endpoint is slow.
 */
function CohortError({
    error,
    order,
    onRetry,
    onSwitchOrder,
}: {
    error: Error;
    order: AgentListOrder;
    onRetry: () => void;
    onSwitchOrder: (next: AgentListOrder) => void;
}) {
    const failure = describeCohortFailure(error, order);
    // Bound to a local so the narrowing survives into the click handler.
    const alternate = failure.alternateOrder;

    return (
        <div className="mt-10 border-l border-l-[color:var(--color-rule-strong)] pl-5">
            <h3 className="text-[length:var(--text-body)] font-medium">{failure.headline}</h3>
            <p className="mt-3 max-w-[64ch] text-[color:var(--color-steel)]">{failure.detail}</p>
            {failure.canRetry || alternate !== null ? (
                <div className="mt-5 flex flex-wrap gap-3">
                    {failure.canRetry ? (
                        <button type="button" onClick={onRetry} className={controlClass}>
                            Try again
                        </button>
                    ) : null}
                    {alternate !== null ? (
                        <button
                            type="button"
                            onClick={() => onSwitchOrder(alternate)}
                            className={controlClass}
                        >
                            Order by {orderLabel(alternate).toLowerCase()} instead
                        </button>
                    ) : null}
                </div>
            ) : null}
        </div>
    );
}

function LookupForm() {
    const navigate = useNavigate();
    const fieldId = useId();
    const [chainId, setChainId] = useState(8453);
    const [tokenId, setTokenId] = useState("");

    const trimmed = tokenId.trim();
    const isValid = /^\d+$/.test(trimmed);

    function handleSubmit(event: React.FormEvent) {
        event.preventDefault();
        if (!isValid) return;
        navigate(`/agent/${chainId}/${trimmed}`);
    }

    return (
        <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3">
            <div>
                <label
                    htmlFor={`${fieldId}-chain`}
                    className="block font-mono text-[length:var(--text-label)] uppercase tracking-wider text-[color:var(--color-steel)]"
                >
                    Chain
                </label>
                <select
                    id={`${fieldId}-chain`}
                    value={chainId}
                    onChange={(event) => setChainId(Number(event.target.value))}
                    className="mt-2 h-9 rounded-[var(--radius-control)] border border-[color:var(--color-rule-strong)] bg-[color:var(--color-ground)] px-3 font-mono text-[length:var(--text-body-sm)] focus:border-[color:var(--color-accent)]"
                >
                    {LOOKUP_CHAINS.map((entry) => (
                        <option key={entry.id} value={entry.id}>
                            {entry.label}
                        </option>
                    ))}
                </select>
            </div>

            <div>
                <label
                    htmlFor={`${fieldId}-token`}
                    className="block font-mono text-[length:var(--text-label)] uppercase tracking-wider text-[color:var(--color-steel)]"
                >
                    Token id
                </label>
                <input
                    id={`${fieldId}-token`}
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    value={tokenId}
                    placeholder="2340"
                    onChange={(event) => setTokenId(event.target.value)}
                    className="mt-2 h-9 w-40 rounded-[var(--radius-control)] border border-[color:var(--color-rule-strong)] bg-transparent px-3 font-mono focus:border-[color:var(--color-accent)]"
                />
            </div>

            <button type="submit" disabled={!isValid} className={`h-9 ${controlClass}`}>
                Open
            </button>

            <p className="w-full font-mono text-[length:var(--text-label)] text-[color:var(--color-steel)]">
                {LOOKUP_CHAINS.find((entry) => entry.id === chainId)?.note}
                {trimmed !== "" && !isValid ? " · token ids are decimal" : ""}
            </p>
        </form>
    );
}
