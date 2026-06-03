import {useMemo, useState} from "react";

import {deployments} from "../lib/deployments";
import {type Module} from "../lib/abi/module-registry";
import {useAllModules, useDomains} from "../hooks/use-modules";

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

    const [filter, setFilter] = useState<string | null>(null);

    const filtered = useMemo(() => {
        if (!filter) return modules;
        return modules.filter((m) => m.domain === filter);
    }, [modules, filter]);

    return (
        <section>
            <header className="mb-10">
                <h1 className="font-sans text-[length:var(--text-display)] leading-[var(--leading-display)] tracking-tight font-semibold">
                    Modules
                </h1>
                <p className="mt-2 text-[color:var(--color-fg-60)]">
                    Evaluation modules registered on the Agent Reputation Protocol.
                </p>
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
                    {filtered.map((m) => (
                        <ModuleRow key={m.id.toString()} module={m} highlightDomain={filter} />
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

function ModuleRow({module, highlightDomain}: {module: Module; highlightDomain: string | null}) {
    const explorerUrl = deployments.chain.explorerUrl;
    const isHighlighted = highlightDomain === module.domain;

    return (
        <li className="grid grid-cols-[3rem_1fr_auto] sm:grid-cols-[3rem_1fr_10rem_auto_8rem] items-center gap-x-4 gap-y-1 border-b border-[color:var(--color-border)] py-4">
            <span className="font-mono text-[color:var(--color-fg-40)] text-[length:var(--text-body-sm)]">
                #{module.id.toString()}
            </span>
            <span className="font-medium">{module.name}</span>
            <span
                className={[
                    "font-mono uppercase tracking-wider text-[length:var(--text-label)] hidden sm:inline",
                    isHighlighted ? "text-[color:var(--color-accent)]" : "text-[color:var(--color-fg-60)]",
                ].join(" ")}
            >
                {module.domain}
            </span>
            <a
                href={`${explorerUrl}/address/${module.creator}`}
                target="_blank"
                rel="noreferrer"
                className="hidden sm:inline font-mono text-[length:var(--text-body-sm)] text-[color:var(--color-fg-60)]"
            >
                {short(module.creator)}
            </a>
            <time
                dateTime={new Date(Number(module.createdAt) * 1000).toISOString()}
                title={new Date(Number(module.createdAt) * 1000).toISOString()}
                className="font-mono text-[length:var(--text-body-sm)] text-[color:var(--color-fg-40)] text-right"
            >
                {relative(Number(module.createdAt))}
            </time>

            {/* Mobile-only second row: domain + creator */}
            <span
                className={[
                    "col-span-3 sm:hidden font-mono uppercase tracking-wider text-[length:var(--text-label)]",
                    isHighlighted ? "text-[color:var(--color-accent)]" : "text-[color:var(--color-fg-60)]",
                ].join(" ")}
            >
                {module.domain} · {short(module.creator)}
            </span>
        </li>
    );
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

function short(addr: string): string {
    return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function relative(unixSeconds: number): string {
    const diff = Date.now() / 1000 - unixSeconds;
    if (diff < 60) return "just now";
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
}
