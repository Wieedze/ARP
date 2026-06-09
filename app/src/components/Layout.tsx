import {type ReactNode} from "react";
import {Link} from "react-router-dom";

import {deployments} from "../lib/deployments";

import {WalletConnect} from "./WalletConnect";

const REGISTRY_URL = deployments.arp.explorerLinks?.moduleRegistry ?? "#";

/**
 * Layout shell. Header has the ARP wordmark on the left and the wallet
 * connector on the right, separated from the main slot by a hairline. The
 * footer carries the canonical external links (Intuition, MetaMask, repo,
 * deployed ModuleRegistry on the Blockscout explorer).
 *
 * Max content width is intentional (not the viewport) — set on `<main>`
 * so the shell itself spans full width but the content stays readable.
 */
export function Layout({children}: {children: ReactNode}) {
    return (
        <>
            <header className="border-b border-[color:var(--color-border)] h-14 px-6 flex items-center justify-between gap-6">
                <Link to="/" className="font-semibold tracking-tight text-[length:var(--text-body)]">
                    ARP
                </Link>
                <nav className="flex items-center gap-5 text-[length:var(--text-body-sm)]">
                    <Link
                        to="/"
                        className="text-[color:var(--color-fg-60)] hover:text-[color:var(--color-fg)]"
                    >
                        Modules
                    </Link>
                    <Link
                        to="/hire"
                        className="text-[color:var(--color-fg-60)] hover:text-[color:var(--color-fg)]"
                    >
                        Hire
                    </Link>
                </nav>
                <WalletConnect />
            </header>

            <div className="border-b border-[color:var(--color-border)] px-6 py-2 text-[length:var(--text-body-sm)] text-[color:var(--color-fg-60)] mx-auto w-full max-w-[1080px] flex flex-wrap items-center justify-between gap-2">
                <span>
                    Running on Intuition Testnet — no real value at stake.
                </span>
                <a
                    href="https://intuition-testnet.hub.caldera.xyz/"
                    target="_blank"
                    rel="noreferrer"
                    className="text-[color:var(--color-accent)] hover:underline"
                >
                    Get tTRUST →
                </a>
            </div>

            <main className="flex-1 mx-auto w-full max-w-[1080px] px-6 py-10">{children}</main>

            <footer className="border-t border-[color:var(--color-border)] mt-16 px-6 py-6">
                <div className="mx-auto w-full max-w-[1080px] flex flex-wrap items-center justify-between gap-3 text-[length:var(--text-label)] uppercase tracking-wider text-[color:var(--color-fg-40)]">
                    <span>
                        Agent Reputation Protocol —{" "}
                        <span className="text-[color:var(--color-fg-60)]">Intuition Testnet</span>
                    </span>
                    <nav className="flex flex-wrap gap-4">
                        <a href={REGISTRY_URL} target="_blank" rel="noreferrer">
                            ModuleRegistry
                        </a>
                        <a href="https://docs.intuition.systems" target="_blank" rel="noreferrer">
                            Intuition
                        </a>
                        <a href="https://docs.metamask.io/smart-accounts-kit/" target="_blank" rel="noreferrer">
                            MetaMask
                        </a>
                    </nav>
                </div>
            </footer>
        </>
    );
}
