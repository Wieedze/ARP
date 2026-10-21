import {type ReactNode} from "react";
import {Link, useLocation} from "react-router-dom";

import {deployments} from "../lib/deployments";

import {WalletConnect} from "./WalletConnect";

const REGISTRY_URL = deployments.arp.explorerLinks?.moduleRegistry ?? "#";

/**
 * Layout shell. Header has the ARP wordmark on the left and the wallet
 * connector on the right, separated from the main slot by a hairline. The
 * footer carries the canonical external links (Intuition, MetaMask, deployed
 * ModuleRegistry on the Blockscout explorer).
 *
 * Max content width is intentional (not the viewport) — set on `<main>`
 * so the shell itself spans full width but the content stays readable.
 *
 * The app spans two networks: ARP's own contracts on Intuition testnet, and the
 * ERC-8004 cohort plus its vaults on Intuition mainnet (ADR 0017). Showing "no
 * real value at stake" above a page that stakes real TRUST would be the single
 * most expensive sentence in the app, so the testnet strip is route-aware. A
 * mainnet route renders `MainnetNotice` itself, so the shell adds no second
 * strip there.
 */
function readsMainnet(pathname: string): boolean {
    return (
        pathname === "/agents" ||
        pathname === "/tools" ||
        pathname.startsWith("/agent/") ||
        pathname.startsWith("/tool/atom/")
    );
}

export function Layout({children}: {children: ReactNode}) {
    const {pathname} = useLocation();
    const isMainnetRoute = readsMainnet(pathname);

    return (
        <>
            <header className="border-b border-[color:var(--color-border)] min-h-14 px-6 py-2 flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
                <Link
                    to="/"
                    className="font-semibold tracking-tight text-[length:var(--text-body)]"
                >
                    ARP
                </Link>
                {/*
                 * Agents · Tools (user, 2026-10-20), and **Register is gone** as of 2026-10-21.
                 * It pointed at `/modules/new`, which wrote to ARP's own `ModuleRegistry` — and
                 * ADR `0051` retired that: ARP points at tools hosted elsewhere and keeps no
                 * catalogue. An entry point for writing into a registry that is not the product is
                 * worse than no entry point, and what replaces it is in `FUTURE.md`.
                 *
                 * `/` is the tool catalogue now, so "Tools" and the wordmark lead to the same
                 * place. That is deliberate while there are two tabs: the alternative was keeping a
                 * root route onto a retired registry.
                 *
                 * A "How it works" tab is part of the same structure and is not built: its content
                 * is a decision, not a layout.
                 */}
                <nav className="flex items-center gap-5 text-[length:var(--text-body-sm)]">
                    <Link
                        to="/agents"
                        className="text-[color:var(--color-fg-60)] hover:text-[color:var(--color-fg)]"
                    >
                        Agents
                    </Link>
                    <Link
                        to="/tools"
                        className="text-[color:var(--color-fg-60)] hover:text-[color:var(--color-fg)]"
                    >
                        Tools
                    </Link>
                </nav>
                <WalletConnect />
            </header>

            {isMainnetRoute ? null : (
                <div className="border-b border-[color:var(--color-border)] px-6 py-2 text-[length:var(--text-body-sm)] text-[color:var(--color-fg-60)] mx-auto w-full max-w-[1080px] flex flex-wrap items-center justify-between gap-2">
                    <span>Running on Intuition Testnet — no real value at stake.</span>
                    <a
                        href="https://intuition-testnet.hub.caldera.xyz/"
                        target="_blank"
                        rel="noreferrer"
                        className="text-[color:var(--color-accent)] hover:underline"
                    >
                        Get tTRUST →
                    </a>
                </div>
            )}

            <main className="flex-1 mx-auto w-full max-w-[1080px] px-6 py-10">{children}</main>

            <footer className="border-t border-[color:var(--color-border)] mt-16 px-6 py-6">
                <div className="mx-auto w-full max-w-[1080px] flex flex-wrap items-center justify-between gap-3 text-[length:var(--text-label)] uppercase tracking-wider text-[color:var(--color-fg-40)]">
                    <span>
                        Agent Reputation Protocol —{" "}
                        <span className="text-[color:var(--color-fg-60)]">
                            {isMainnetRoute ? "Intuition Mainnet" : "Intuition Testnet"}
                        </span>
                    </span>
                    <nav className="flex flex-wrap gap-4">
                        <a href={REGISTRY_URL} target="_blank" rel="noreferrer">
                            ModuleRegistry
                        </a>
                        <a href="https://docs.intuition.systems" target="_blank" rel="noreferrer">
                            Intuition
                        </a>
                        <a
                            href="https://docs.metamask.io/smart-accounts-kit/"
                            target="_blank"
                            rel="noreferrer"
                        >
                            MetaMask
                        </a>
                    </nav>
                </div>
            </footer>
        </>
    );
}
