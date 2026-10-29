import {QueryClient, QueryClientProvider} from "@tanstack/react-query";
import {render as rtlRender, type RenderResult} from "@testing-library/react";
import {MemoryRouter, Route, Routes} from "react-router-dom";
import type {ReactElement, ReactNode} from "react";
import {WagmiProvider} from "wagmi";

import {ChainChoiceContext, choiceFor, type ChainChoiceValue} from "../lib/chain-choice";
import {wagmiConfig} from "../lib/wagmi";

/**
 * Render a component with the four providers every page in this app assumes.
 *
 * **`WagmiProvider` joined the list when `/atom/:atomId` gained a write control.** It said "three"
 * and meant it — no page with a wallet control had a DOM test, so `useAccount` had never been
 * rendered here, and the first page to reach for it failed with
 * `useConfig must be used within WagmiProvider` from a test file that did not mention wallets.
 *
 * The **real** config, not a stub. Its only connector is `injected()`, which finds no
 * `window.ethereum` under `happy-dom` and so leaves every test disconnected — which is the state
 * worth testing by default, since it is what a first-time reader sees. A hand-built config would
 * also have to satisfy wagmi's `Register` interface, and a second definition of the app's chains is
 * a second place for them to drift.
 *
 * **The chain is passed explicitly and never read from storage.** `ChainChoiceProvider` calls
 * `readStored()`, which reads `localStorage` — so a test would inherit whatever a previous test
 * wrote, and the symbol in every assertion would depend on test order. `rules/claims.md` §2 in its
 * test form: one number, one context. A test that says `tTRUST` has to have asked for testnet.
 *
 * The query client retries **nothing** and caches nothing. A test asserting an error state should
 * not wait three backoff rounds for it, and a `gcTime` above zero leaks a resolved query into the
 * next test through the same key.
 */
export function renderWithProviders(
    ui: ReactElement,
    options: {
        /** Which chain's symbols and endpoints the tree sees. Testnet by default: it is `tTRUST`,
         *  which is visibly different from `TRUST` and so catches a hardcoded symbol. */
        mainnet?: boolean;
        /** Mount under a route, for a component that reads `useParams`. */
        route?: {path: string; at: string};
    } = {},
): RenderResult {
    const client = new QueryClient({
        defaultOptions: {
            queries: {retry: false, gcTime: 0, staleTime: 0},
            mutations: {retry: false},
        },
    });

    const chain: ChainChoiceValue = {
        choice: choiceFor(options.mainnet ?? false),
        setMainnet: () => {},
    };

    function Wrapper({children}: {children: ReactNode}) {
        const inner =
            options.route === undefined ? (
                children
            ) : (
                <Routes>
                    <Route path={options.route.path} element={children} />
                </Routes>
            );
        return (
            <WagmiProvider config={wagmiConfig}>
                <QueryClientProvider client={client}>
                    <ChainChoiceContext.Provider value={chain}>
                        <MemoryRouter initialEntries={[options.route?.at ?? "/"]}>
                            {inner}
                        </MemoryRouter>
                    </ChainChoiceContext.Provider>
                </QueryClientProvider>
            </WagmiProvider>
        );
    }

    return rtlRender(ui, {wrapper: Wrapper});
}
