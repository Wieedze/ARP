import {lazy, Suspense} from "react";
import {Route, Routes} from "react-router-dom";

import {Layout} from "./components/Layout";
import {ModuleList} from "./components/ModuleList";
import {AgentRegister} from "./pages/AgentRegister";
import {Hire} from "./pages/Hire";
import {HireResult} from "./pages/HireResult";
import {RegisterModule} from "./pages/RegisterModule";
import {ToolDetail} from "./pages/ToolDetail";

/**
 * The trust panel and its entry point are split out of the main bundle. They
 * pull the ERC-8004 connector and its graph transport, which nothing else in
 * the app needs, and most visits never open them.
 */
const AgentDirectory = lazy(() =>
    import("./pages/AgentDirectory").then((module) => ({default: module.AgentDirectory})),
);
const AgentTrustPanel = lazy(() =>
    import("./pages/AgentTrustPanel").then((module) => ({default: module.AgentTrustPanel})),
);
const AgentImport = lazy(() =>
    import("./pages/AgentImport").then((module) => ({default: module.AgentImport})),
);
/**
 * The tool surface is split for the same reason and measured: importing it statically grew the
 * entry chunk by 16,230 bytes and dissolved the separate `erc8004-connector` chunk into it, which
 * also falsified the comment above — the connector would then be something the eagerly loaded
 * bundle needs. `rules/ui.md`: lazy-load route-level code.
 */
const ToolUsagePanel = lazy(() =>
    import("./pages/ToolUsagePanel").then((module) => ({default: module.ToolUsagePanel})),
);

function App() {
    return (
        <Layout>
            <Routes>
                <Route path="/" element={<ModuleList />} />
                <Route path="/agent" element={<AgentRegister />} />
                <Route
                    path="/agent/import"
                    element={
                        <Suspense fallback={<RouteFallback label="agent import" />}>
                            <AgentImport />
                        </Suspense>
                    }
                />
                <Route
                    path="/agents"
                    element={
                        <Suspense fallback={<RouteFallback label="agent lookup" />}>
                            <AgentDirectory />
                        </Suspense>
                    }
                />
                <Route
                    path="/agent/:chainId/:tokenId"
                    element={
                        <Suspense fallback={<RouteFallback label="trust panel" />}>
                            <AgentTrustPanel />
                        </Suspense>
                    }
                />
                <Route path="/modules/new" element={<RegisterModule />} />
                <Route path="/tool/:id" element={<ToolDetail />} />
                {/* Keyed on an ATOM, not a ModuleRegistry id, and a mainnet view. The route above
                    is the testnet ModuleRegistry page (ADR 0025 keeps that registry off mainnet);
                    this one is `tasks/23`'s surface. The paths are deliberately nested rather than
                    `/tools/:atomId`, which would read as a plural of the other one. */}
                <Route
                    path="/tool/atom/:atomId"
                    element={
                        <Suspense fallback={<RouteFallback label="tool surface" />}>
                            <ToolUsagePanel />
                        </Suspense>
                    }
                />
                <Route path="/hire" element={<Hire />} />
                <Route path="/hire/result/:tx" element={<HireResult />} />
            </Routes>
        </Layout>
    );
}

function RouteFallback({label}: {label: string}) {
    return (
        <p
            aria-live="polite"
            className="font-mono text-[length:var(--text-body-sm)] text-[color:var(--color-fg-60)]"
        >
            loading {label}…
        </p>
    );
}

export default App;
