import {type ReactNode} from "react";
import {useAccount} from "wagmi";

import {useChainChoice} from "../lib/chain-choice";

import {ChainToggle} from "./brand/ChainToggle";
import {NavLink, NavSplit} from "./brand/NavSplit";
import {Watermark} from "./brand/Watermark";
import {WalletConnect} from "./WalletConnect";

/**
 * Layout shell. The header is the split nav from ADR `0057` §3 and both design handoffs: links
 * inward on both sides, the Source mark centred on the page, one hairline below and no decoration
 * under it. The footer ends on the wordmark at `--text-giant`, cropped by the page edge.
 *
 * Max content width is **1320px**, which is the reference's `.wrap`, not the 1080 this shell used.
 * The listing pages are eight-column tables and 1080 squeezed them; the user's complaint that the
 * agent index was badly laid out started there (2026-10-27).
 *
 * The app spans two networks: ARP's own contracts on Intuition testnet, and the ERC-8004 cohort
 * plus its vaults on Intuition mainnet (ADR 0017).
 *
 * **Both network banners are gone** — the shell's testnet strip and the per-page `MainnetNotice`
 * (ADR `0058`, user decision). The warning that matters is the one at the moment a wallet opens,
 * and `StakeControl` and `WithdrawControl` both carry it in their confirmation step, which is where
 * ADR `0029` said it belonged. `readsMainnet` survives for the footer's network label, which is a
 * fact about where the data came from rather than a warning about it.
 */

export function Layout({children}: {children: ReactNode}) {
    const {isConnected} = useAccount();
    const chain = useChainChoice();

    return (
        /* `min-h-screen flex flex-col` is what makes `flex-1` on `<main>` mean anything. This was
           a fragment, so the footer sat directly under whatever the page rendered — on a short
           page or a loading one it rode up the screen and then jumped back down when the content
           arrived (user, 2026-10-27). */
        <div className="flex min-h-screen flex-col">
            {/*
             * Agents · Tools on the left, Register · My profile on the right (user, 2026-10-20,
             * one row since 2026-10-27). The handoff's left pair is "AGENTS, MODULES"; there is
             * no module surface — `ModuleRegistry` and its three pages went with ADR `0051`/`0055`
             * — so Tools takes the slot, which is the live equivalent. Discover replaced Hire
             * (ADR `0060`).
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
            {/* Split around the centred mark: what you read on the left, what you *do* on the
                right. `/agent` and `/agent/import` linked only to each other and appeared in no
                nav, so the only route to either was already knowing the URL — 1,828 lines of UI
                with no door (user, 2026-10-27). "Your agent", not "Register", because
                `/register` beside it registers a *tool* and two items reading "Register" would be
                the ambiguity that question was about. */}
            {/* Balanced around the centred mark, and the balance is the whole point: the right
                column had five text items plus a two-button chain toggle plus an address, against
                two on the left. It overflowed, wrapped the address onto a second line and shoved
                the mark off centre (user, with a screenshot, 2026-10-27).

                Three and three now. **What you read** goes left — the two indexes and your own
                positions, which is a page of figures like the others. **What you do** goes right,
                with the chain and the wallet after it: both are state rather than destinations, so
                they sit at the end rather than among the links. The toggle is one button now, not
                two (`ChainToggle`). */}
            <NavSplit
                left={
                    <>
                        <NavLink to="/agents">Agents</NavLink>
                        <NavLink to="/tools">Tools</NavLink>
                        {isConnected ? <NavLink to="/profile">My profile</NavLink> : null}
                    </>
                }
                right={
                    <>
                        <NavLink to="/agent">Your agent</NavLink>
                        <NavLink to="/register">Add a tool</NavLink>
                        <ChainToggle />
                        <WalletConnect />
                    </>
                }
            />

            <main className="flex-1 mx-auto w-full max-w-[1320px] px-6 py-10">{children}</main>

            {/* `overflow-hidden` is what makes the wordmark's crop a crop rather than a scrollbar. */}
            <footer className="mt-24 overflow-hidden border-t border-[color:var(--color-rule)] px-6 pt-7">
                <div className="mx-auto w-full max-w-[1320px] flex flex-wrap items-center justify-between gap-3 text-[length:var(--text-label)] uppercase tracking-wider text-[color:var(--color-steel)]">
                    <span>
                        Agent Reputation Protocol —{" "}
                        <span className="text-[color:var(--color-steel)]">{chain.chain.name}</span>
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
                {/* Full bleed, so "across the whole width" means the viewport and not the
                    1320px shell (user, 2026-10-27). The footer carries `px-6`, cancelled here by
                    the negative inset — the mark touches both edges. */}
                <div className="-mx-6 mt-6">
                    <Watermark />
                </div>
            </footer>
        </div>
    );
}
