import {type ReactNode} from "react";
import {useLocation} from "react-router-dom";
import {useAccount} from "wagmi";

import {linkClass} from "../lib/control-class";
import {readsMainnet} from "../lib/mainnet-routes";

import {NavLink, NavSplit} from "./brand/NavSplit";
import {WalletConnect} from "./WalletConnect";

/**
 * Layout shell. The header is the split nav from ADR `0057` §3: links inward on both sides, the
 * Source mark centred on the page, one hairline below and no decoration under it.
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
 *
 * **The route list moved to `lib/mainnet-routes.ts`** after it went stale twice in one day — once
 * for `/` and once for `/register`, each a page that reads or spends real TRUST while this shell
 * told the reader it was testnet and offered them a faucet. A hand-maintained list inside the
 * component is what made both possible.
 */

export function Layout({children}: {children: ReactNode}) {
    const {pathname} = useLocation();
    const {isConnected} = useAccount();
    const isMainnetRoute = readsMainnet(pathname);

    return (
        <>
            {/*
             * Agents · Tools on the left, Register · My profile on the right (user, 2026-10-20,
             * split per ADR `0057` §3). The handoff's left pair is "AGENTS, MODULES"; there is no
             * module surface — `ModuleRegistry` and its three pages went with ADR `0051`/`0055` —
             * so Tools takes the slot, which is the live equivalent.
             *
             * Register points at `/register`, which creates a tool's **atom**, derived from its URL
             * so the same URL always lands on the same market (ADR `0054`). ARP stores nothing.
             *
             * `/` is the tool catalogue, so "Tools" and the mark lead to the same place.
             *
             * "My profile", not "You", and `/profile`, not `/me` — the user rejected both. Last in
             * the group and only once a wallet is connected: a page of your positions with nothing
             * to read is a worse answer than no tab.
             *
             * A "How it works" tab is part of the same structure and is not built: its content is a
             * decision, not a layout.
             */}
            <NavSplit
                left={
                    <>
                        <NavLink to="/agents">Agents</NavLink>
                        <NavLink to="/tools">Tools</NavLink>
                    </>
                }
                right={
                    <>
                        <NavLink to="/register">Register</NavLink>
                        {isConnected ? <NavLink to="/profile">My profile</NavLink> : null}
                        <WalletConnect />
                    </>
                }
            />

            {isMainnetRoute ? null : (
                <div className="border-b border-[color:var(--color-rule)] px-6 py-2 text-[length:var(--text-body-sm)] text-[color:var(--color-steel)] mx-auto w-full max-w-[1080px] flex flex-wrap items-center justify-between gap-2">
                    <span>Running on Intuition Testnet — no real value at stake.</span>
                    <a
                        href="https://intuition-testnet.hub.caldera.xyz/"
                        target="_blank"
                        rel="noreferrer"
                        className={linkClass}
                    >
                        Get tTRUST →
                    </a>
                </div>
            )}

            <main className="flex-1 mx-auto w-full max-w-[1080px] px-6 py-10">{children}</main>

            <footer className="border-t border-[color:var(--color-rule)] mt-16 px-6 py-6">
                <div className="mx-auto w-full max-w-[1080px] flex flex-wrap items-center justify-between gap-3 text-[length:var(--text-label)] uppercase tracking-wider text-[color:var(--color-grey)]">
                    <span>
                        Agent Reputation Protocol —{" "}
                        <span className="text-[color:var(--color-steel)]">
                            {isMainnetRoute ? "Intuition Mainnet" : "Intuition Testnet"}
                        </span>
                    </span>
                    {/* `ModuleRegistry` used to be the first link here. The contract is retired
                        (ADR `0051`, `0055`) and the three pages that used it are deleted, so the
                        link advertised a surface the product no longer has. */}
                    <nav className="flex flex-wrap gap-4">
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
