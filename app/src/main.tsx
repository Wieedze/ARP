import {StrictMode} from "react";
import {createRoot} from "react-dom/client";
import {QueryClient, QueryClientProvider} from "@tanstack/react-query";

import {ChainChoiceProvider} from "./lib/ChainChoiceProvider";
import {BrowserRouter} from "react-router-dom";
import {WagmiProvider} from "wagmi";

import App from "./App.tsx";
import {wagmiConfig} from "./lib/wagmi";
import "./index.css";

const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            staleTime: 30_000,
            retry: 1,
            refetchOnWindowFocus: false,
        },
    },
});

createRoot(document.getElementById("root")!).render(
    <StrictMode>
        <WagmiProvider config={wagmiConfig}>
            <QueryClientProvider client={queryClient}>
                {/* Inside the query client, because every read keyed by chain lives under it. */}
                <ChainChoiceProvider>
                    <BrowserRouter>
                        <App />
                    </BrowserRouter>
                </ChainChoiceProvider>
            </QueryClientProvider>
        </WagmiProvider>
    </StrictMode>,
);
