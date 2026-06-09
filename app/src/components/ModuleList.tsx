import {useMemo, useState} from "react";
import {Link, useNavigate} from "react-router-dom";
import {formatEther} from "viem";
import {useAccount} from "wagmi";

import {type Module} from "../lib/abi/module-registry";
import {useAgentId} from "../hooks/use-agent";
import {useAllModules, useDomains} from "../hooks/use-modules";
import {useVaultMetrics, type VaultMetric} from "../hooks/use-vault-metrics";

/**
 * Module list page (the app's root route).
 *
 * Reads live from `ModuleRegistry` on Intuition Testnet — see
 * `app/src/lib/deployments.ts` for the address. Filter is client-side
 * (the MVP scope assumes O(10) modules).
 */
export function ModuleList() {
    const {modules, isLoading, error, refetch} = useAllModules();
    const domains = useDomains(modules);
    const {metrics} = useVaultMetrics(modules);

    const {isConnected} = useAccount();
    const {data: agentId} = useAgentId();

    const [filter, setFilter] = useState<string | null>(null);

    // Join modules with their vault metric so the row component receives both
    // and we can sort by TVL on a flat list.
    type Row = {module: Module; metric: VaultMetric};
    const rows: Row[] = useMemo(
        () => modules.map((m, i) => ({module: m, metric: metrics[i] ?? null})),
        [modules, metrics],
    );

    const filtered = useMemo(() => {
        const inDomain = filter ? rows.filter((r) => r.module.domain === filter) : rows;
        // Sort by TVL descending; modules with no metric (read failed or
        // atom not created yet) sort to the bottom.
        return [...inDomain].sort((a, b) => {
            const av = a.metric?.totalAssets ?? -1n;
            const bv = b.metric?.totalAssets ?? -1n;
            if (av === bv) return Number(a.module.id - b.module.id);
            return bv > av ? 1 : -1;
        });
    }, [rows, filter]);

    const agentCta = isConnected
        ? agentId
            ? {to: "/agent", label: `Your agent #${agentId.toString()}`}
            : {to: "/agent", label: "Register your agent"}
        : null;

    return (
        <section>
            <header className="mb-10 flex items-baseline justify-between gap-4 flex-wrap">
                <div>
                    <h1 className="font-sans text-[length:var(--text-display)] leading-[var(--leading-display)] tracking-tight font-semibold">
                        Modules
                    </h1>
                    <p className="mt-2 text-[color:var(--color-fg-60)]">
                        Evaluation modules registered on the Agent Reputation Protocol.
                    </p>
                </div>
                <div className="flex items-center gap-5 text-[length:var(--text-body-sm)]">
                    <Link
                        to="/modules/new"
                        className="text-[color:var(--color-accent)]"
                    >
                        + Register a tool
                    </Link>
                    {agentCta ? (
                        <Link
                            to={agentCta.to}
                            className="text-[color:var(--color-accent)]"
                        >
                            {agentCta.label} →
                        </Link>
                    ) : null}
                </div>
            </header>

            {domains.length > 0 ? (
                <nav className="mb-8 flex flex-wrap gap-2" aria-label="Filter by domain">
                    <FilterChip label="All" active={filter === null} onClick={() => setFilter(null)} />
                    {domains.map((d) => (
                        <FilterChip
                            key={d}
                            label={d}
                            active={filter === d}
                            onClick={() => setFilter(filter === d ? null : d)}
                        />
                    ))}
                </nav>
            ) : null}

            {error ? <ErrorState onRetry={refetch} /> : null}
            {!error && isLoading ? <LoadingState /> : null}
            {!error && !isLoading && filtered.length === 0 ? <EmptyState /> : null}
            {!error && !isLoading && filtered.length > 0 ? (
                <ul className="border-t border-[color:var(--color-border)]">
                    {filtered.map(({module, metric}) => (
                        <ModuleRow
                            key={module.id.toString()}
                            module={module}
                            metric={metric}
                            highlightDomain={filter}
                        />
                    ))}
                </ul>
            ) : null}
        </section>
    );
}

function FilterChip({label, active, onClick}: {label: string; active: boolean; onClick: () => void}) {
    return (
        <button
            type="button"
            onClick={onClick}
            aria-pressed={active}
            className={[
                "px-3 py-1 text-[length:var(--text-label)] uppercase tracking-wider font-mono",
                active
                    ? "border-[color:var(--color-accent)] text-[color:var(--color-accent)]"
                    : "text-[color:var(--color-fg-60)]",
            ].join(" ")}
        >
            {label}
        </button>
    );
}

function ModuleRow({
    module,
    metric,
    highlightDomain,
}: {
    module: Module;
    metric: VaultMetric;
    highlightDomain: string | null;
}) {
    const navigate = useNavigate();
    const isHighlighted = highlightDomain === module.domain;
    const hasStake = metric !== null && metric.totalAssets > 0n;

    function navigateToTool() {
        navigate(`/tool/${module.id.toString()}`);
    }

    return (
        <li
            onClick={navigateToTool}
            onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    navigateToTool();
                }
            }}
            role="link"
            tabIndex={0}
            className="grid grid-cols-[3rem_1fr_auto] sm:grid-cols-[3rem_1fr_10rem_8rem_8rem] items-center gap-x-4 gap-y-1 border-b border-[color:var(--color-border)] py-4 cursor-pointer hover:bg-[color:var(--color-surface-hover,rgba(255,255,255,0.03))] focus:outline-none focus:bg-[color:var(--color-surface-hover,rgba(255,255,255,0.03))]"
        >
            <span className="font-mono text-[color:var(--color-fg-40)] text-[length:var(--text-body-sm)]">
                #{module.id.toString()}
            </span>
            <span className="font-medium">{module.name}</span>
            <span
                className={[
                    "font-mono uppercase tracking-wider text-[length:var(--text-label)] hidden sm:inline",
                    isHighlighted
                        ? "text-[color:var(--color-accent)]"
                        : "text-[color:var(--color-fg-60)]",
                ].join(" ")}
            >
                {module.domain}
            </span>
            <span
                className={[
                    "hidden sm:inline font-mono text-[length:var(--text-body-sm)] text-right",
                    hasStake
                        ? "text-[color:var(--color-accent)]"
                        : "text-[color:var(--color-fg-40)]",
                ].join(" ")}
                title="Total TVL staked on this tool's atom"
            >
                {metric === null ? "—" : `${formatTrust(metric.totalAssets)} tTRUST`}
            </span>
            <span
                className="hidden sm:inline font-mono text-[length:var(--text-body-sm)] text-[color:var(--color-fg-40)] text-right"
                title="Distinct addresses that have ever staked on this tool"
            >
                {metric === null
                    ? "—"
                    : `${metric.stakerCount} ${metric.stakerCount === 1 ? "staker" : "stakers"}`}
            </span>

            {/* Mobile-only second row: domain · TVL · creator */}
            <span
                className={[
                    "col-span-3 sm:hidden font-mono uppercase tracking-wider text-[length:var(--text-label)]",
                    isHighlighted
                        ? "text-[color:var(--color-accent)]"
                        : "text-[color:var(--color-fg-60)]",
                ].join(" ")}
            >
                {module.domain} ·{" "}
                {metric === null ? "—" : `${formatTrust(metric.totalAssets)} tTRUST`}
            </span>
        </li>
    );
}

/**
 * Trim trailing zeros for compact display. `formatEther` produces strings
 * like "0.001000000001" — fine on a detail page but noisy on a row.
 */
function formatTrust(weiAmount: bigint): string {
    const raw = formatEther(weiAmount);
    if (!raw.includes(".")) return raw;
    return raw.replace(/0+$/, "").replace(/\.$/, "");
}

function LoadingState() {
    return (
        <ul className="border-t border-[color:var(--color-border)]">
            {Array.from({length: 3}, (_, i) => (
                <li key={i} className="border-b border-[color:var(--color-border)] py-4 animate-pulse">
                    <div className="h-4 w-2/3 bg-[color:var(--color-fg-20)] mb-2" />
                    <div className="h-3 w-1/3 bg-[color:var(--color-fg-20)]" />
                </li>
            ))}
        </ul>
    );
}

function EmptyState() {
    return <p className="text-[color:var(--color-fg-60)]">No modules yet.</p>;
}

function ErrorState({onRetry}: {onRetry: () => void}) {
    return (
        <div className="flex items-center gap-4">
            <p className="text-[color:var(--color-fg-60)]">
                Couldn’t load modules from Intuition Testnet.
            </p>
            <button type="button" onClick={onRetry} className="px-3 py-1 text-[length:var(--text-body-sm)]">
                Retry
            </button>
        </div>
    );
}

