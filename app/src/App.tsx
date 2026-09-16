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
