import {lazy, Suspense} from "react";
import {Navigate, Route, Routes} from "react-router-dom";

import {Layout} from "./components/Layout";
import {AgentRegister} from "./pages/AgentRegister";

/**
 * The trust panel and its entry point are split out of the main bundle. They
 * pull the ERC-8004 connector and its graph transport, which nothing else in
 * the app needs, and most visits never open them.
 */
const Discover = lazy(() =>
    import("./pages/Discover").then((module) => ({default: module.Discover})),
);
const Profile = lazy(() =>
    import("./pages/Profile").then((module) => ({default: module.Profile})),
);
const ToolRegister = lazy(() =>
    import("./pages/ToolRegister").then((module) => ({default: module.ToolRegister})),
);
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
/** Same reason: it reads the Intuition graph, which nothing in the eager bundle needs. */
const ToolCatalog = lazy(() =>
    import("./pages/ToolCatalog").then((module) => ({default: module.ToolCatalog})),
);

function App() {
    return (
        <Layout>
            <Routes>
                {/* `/` is the tool catalogue now. It was `ModuleList`, reading ARP's own
                    `ModuleRegistry`, and ADR `0051` retired that: ARP points at tools hosted
                    elsewhere and keeps no catalogue. The root route pointing at a registry ARP
                    wrote was the clearest remaining statement of the opposite. */}
                <Route
                    path="/"
                    element={
                        <Suspense fallback={<RouteFallback label="tools" />}>
                            <ToolCatalog />
                        </Suspense>
                    }
                />
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
                <Route
                    path="/profile"
                    element={
                        <Suspense fallback={<RouteFallback label="your positions" />}>
                            <Profile />
                        </Suspense>
                    }
                />
                {/* `/me` was the route and the tab was called "You". The user rejected both as
                    wrong syntax; `HANDOFF.md` §8 names the route `/profile`. The redirect stays
                    because a bookmark, a shared link or a `git log` reference to `/me` should not
                    land on a blank page — and it is three lines against a dead end. */}
                <Route path="/me" element={<Navigate to="/profile" replace />} />
                <Route
                    path="/discover"
                    element={
                        <Suspense fallback={<RouteFallback label="agents" />}>
                            <Discover />
                        </Suspense>
                    }
                />
                <Route
                    path="/register"
                    element={
                        <Suspense fallback={<RouteFallback label="register a tool" />}>
                            <ToolRegister />
                        </Suspense>
                    }
                />
                <Route
                    path="/tools"
                    element={
                        <Suspense fallback={<RouteFallback label="tools in use" />}>
                            <ToolCatalog />
                        </Suspense>
                    }
                />
                {/* Keyed on an ATOM. `/tool/:id` was the testnet `ModuleRegistry` page beside it
                    and is gone with the registry (ADR `0051`); the nesting under `/tool/` is kept
                    so existing links to this one still resolve. */}
                <Route
                    path="/tool/atom/:atomId"
                    element={
                        <Suspense fallback={<RouteFallback label="tool surface" />}>
                            <ToolUsagePanel />
                        </Suspense>
                    }
                />
            </Routes>
        </Layout>
    );
}

function RouteFallback({label}: {label: string}) {
    return (
        <p
            aria-live="polite"
            className="font-mono text-[length:var(--text-body-sm)] text-[color:var(--color-steel)]"
        >
            loading {label}…
        </p>
    );
}

export default App;
