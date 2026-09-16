import {useId, useState} from "react";
import {useNavigate} from "react-router-dom";
import type {AgentListOrder} from "@arp-protocol/erc8004";

import {CohortList} from "../components/agent/CohortList";
import {MainnetNotice} from "../components/agent/MainnetNotice";
import {COHORT_PAGE_SIZE, useAgentCohort} from "../hooks/use-agent-cohort";
import {COHORT_ORDERS} from "../services/agent-cohort";
import {ERC8004_GRAPHQL_URL} from "../services/erc8004-connector";

/**
 * `/agents` — the way into the trust panel.
 *
 * The whole mirrored cohort, paged, ordered by measures of evidence and never
 * by a score. Both orders rank by what cost somebody something to produce, and
 * the page says so in as many words: "most statements about it" is not "best",
 * and a list that implied otherwise would be the first dishonest thing here.
 *
 * Capability search — finding an agent by what it can actually do — needs an
 * index that does not exist yet and is the next phase. Until then the lookup
 * form stays, because it is the only route to an agent on BSC or Ethereum,
 * where the graph holds registry entries but no trust edges.
 */

const LOOKUP_CHAINS: {id: number; label: string; note: string}[] = [
    {id: 8453, label: "Base (8453)", note: "mirrored into the Intuition graph"},
    {id: 56, label: "BSC (56)", note: "registry only — no trust edges in the graph"},
    {id: 1, label: "Ethereum (1)", note: "registry only — no trust edges in the graph"},
];

export function AgentDirectory() {
    const [order, setOrder] = useState<AgentListOrder>("evidence-quantity");
    const [offset, setOffset] = useState(0);
    const cohortQuery = useAgentCohort(order, offset);
    const view = cohortQuery.data;

    const activeOrder = COHORT_ORDERS.find((entry) => entry.id === order);

    function changeOrder(next: AgentListOrder) {
        // A page number means nothing across two different orders, so paging
        // restarts rather than carrying an offset into a sequence it was not
        // measured against.
        setOrder(next);
        setOffset(0);
    }

    return (
        <section>
            <MainnetNotice />

            <header className="mt-8 mb-10">
                <h1 className="text-[length:var(--text-display)] leading-[var(--leading-display)] tracking-tight font-semibold">
                    ERC-8004 agents
                </h1>
                <p className="mt-3 max-w-[64ch] text-[color:var(--color-fg-60)]">
                    {view?.total === null || view?.total === undefined
                        ? "Every one that the Intuition graph mirrors carries a trust score."
                        : `All ${view.total.toLocaleString("en-US")} that the Intuition graph mirrors carry a trust score.`}{" "}
                    Providers sign their assessments and declare how long they stay valid, and no
                    consumer checks either. Open one and see what its rating is actually resting on.
                </p>
            </header>

            <section>
                <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
                    <h2 className="font-medium">The cohort</h2>
                    <OrderControl order={order} onChange={changeOrder} />
                </div>

                <p className="mt-2 max-w-[68ch] text-[length:var(--text-body-sm)] text-[color:var(--color-fg-60)]">
                    <span className="text-[color:var(--color-fg)]">
                        Neither order is a quality ranking.
                    </span>{" "}
                    {activeOrder?.note} Ordering by a provider's score is the one thing this panel
                    argues against, so it is not offered.
                </p>

                {cohortQuery.error !== null ? (
                    <CohortError
                        message={cohortQuery.error.message}
                        onRetry={() => void cohortQuery.refetch()}
                    />
                ) : view === undefined ? (
                    <CohortLoading />
                ) : (
                    <>
                        <CohortList view={view} />
                        <nav
                            aria-label="Cohort pages"
                            className="mt-5 flex flex-wrap items-center justify-between gap-x-6 gap-y-3"
                        >
                            <p
                                aria-live="polite"
                                className="font-mono text-[length:var(--text-body-sm)] text-[color:var(--color-fg-60)] tabular-nums"
                            >
                                {view.rangeLabel}
                                {cohortQuery.isPlaceholderData ? " · reading…" : ""}
                            </p>
                            <div className="flex gap-3">
                                <PageButton
                                    label="← Previous"
                                    disabled={!view.hasPrevious}
                                    onClick={() =>
                                        setOffset(Math.max(0, offset - COHORT_PAGE_SIZE))
                                    }
                                />
                                <PageButton
                                    label="Next →"
                                    disabled={!view.hasNext}
                                    onClick={() => setOffset(offset + COHORT_PAGE_SIZE)}
                                />
                            </div>
                        </nav>
                        <p className="mt-4 max-w-[68ch] text-[length:var(--text-body-sm)] text-[color:var(--color-fg-60)]">
                            Ordered and paged by the indexer at{" "}
                            <span className="font-mono break-all">{ERC8004_GRAPHQL_URL}</span>, a
                            page at a time. Rows are never re-sorted here — the order belongs to the
                            whole cohort, and re-ranking one page would make it a property of the
                            window instead.
                        </p>
                    </>
                )}
            </section>

            <section className="mt-16">
                <h2 className="font-medium">Look one up directly</h2>
                <p className="mt-1 mb-6 max-w-[64ch] text-[length:var(--text-body-sm)] text-[color:var(--color-fg-60)]">
                    The list above is the Base mirror, which is the only chain the graph indexes.
                    Agents on BSC and Ethereum are registered but have no trust edges, so they
                    cannot be listed — only opened by token id.
                </p>
                <LookupForm />
            </section>
        </section>
    );
}

function OrderControl({
    order,
    onChange,
}: {
    order: AgentListOrder;
    onChange: (next: AgentListOrder) => void;
}) {
    return (
        <div className="flex items-baseline gap-3">
            <span
                id="cohort-order-label"
                className="font-mono uppercase tracking-wider text-[length:var(--text-label)] text-[color:var(--color-fg-60)]"
            >
                Order
            </span>
            <div role="group" aria-labelledby="cohort-order-label" className="flex gap-1">
                {COHORT_ORDERS.map((entry) => (
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
        <button
            type="button"
            disabled={disabled}
            onClick={onClick}
            className="px-3 py-1.5 text-[length:var(--text-body-sm)] border border-[color:var(--color-border-strong)] disabled:opacity-40 disabled:cursor-not-allowed"
        >
            {label}
        </button>
    );
}

/** A loading state shaped like the answer: the read that is in flight, named. */
function CohortLoading() {
    return (
        <p
            aria-live="polite"
            className="mt-8 font-mono text-[length:var(--text-body-sm)] text-[color:var(--color-fg-60)]"
        >
            reading the cohort from the intuition graph — identity, statement counts, markets
        </p>
    );
}

function CohortError({message, onRetry}: {message: string; onRetry: () => void}) {
    return (
        <div className="mt-8">
            <p className="max-w-[64ch]">
                The cohort could not be read, so this list is empty for a reason that has nothing to
                do with how many agents exist. {message}
            </p>
            <button
                type="button"
                onClick={onRetry}
                className="mt-4 px-3 py-1.5 text-[length:var(--text-body-sm)] border border-[color:var(--color-border-strong)]"
            >
                Try again
            </button>
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
        <form onSubmit={handleSubmit} className="max-w-[26rem]">
            <div>
                <label
                    htmlFor={`${fieldId}-chain`}
                    className="block font-mono uppercase tracking-wider text-[length:var(--text-label)] text-[color:var(--color-fg-60)]"
                >
                    Chain
                </label>
                <select
                    id={`${fieldId}-chain`}
                    value={chainId}
                    onChange={(event) => setChainId(Number(event.target.value))}
                    className="mt-2 block w-full bg-[color:var(--color-bg)] border border-[color:var(--color-border-strong)] px-3 py-1.5 font-mono text-[length:var(--text-body-sm)] focus:outline-none focus:border-[color:var(--color-accent)]"
                >
                    {LOOKUP_CHAINS.map((chain) => (
                        <option key={chain.id} value={chain.id}>
                            {chain.label}
                        </option>
                    ))}
                </select>
                <p className="mt-2 text-[length:var(--text-body-sm)] text-[color:var(--color-fg-60)]">
                    {LOOKUP_CHAINS.find((chain) => chain.id === chainId)?.note}
                </p>
            </div>

            <div className="mt-5">
                <label
                    htmlFor={`${fieldId}-token`}
                    className="block font-mono uppercase tracking-wider text-[length:var(--text-label)] text-[color:var(--color-fg-60)]"
                >
                    Token id
                </label>
                <input
                    id={`${fieldId}-token`}
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    value={tokenId}
                    onChange={(event) => setTokenId(event.target.value)}
                    className="mt-2 block w-full bg-transparent border border-[color:var(--color-border-strong)] px-3 py-1.5 font-mono focus:outline-none focus:border-[color:var(--color-accent)]"
                />
                {trimmed !== "" && !isValid ? (
                    <p className="mt-2 text-[length:var(--text-body-sm)]">
                        Token ids are decimal, for example 2340.
                    </p>
                ) : null}
            </div>

            <button
                type="submit"
                disabled={!isValid}
                className="mt-5 px-3 py-1.5 text-[length:var(--text-body-sm)] border border-[color:var(--color-border-strong)] disabled:opacity-40 disabled:cursor-not-allowed"
            >
                Open panel
            </button>
        </form>
    );
}
