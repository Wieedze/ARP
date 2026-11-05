import {lazy, Suspense} from "react";
import {Navigate, Route, Routes, useLocation, useParams} from "react-router-dom";

import {PageLoading} from "./components/brand/PageLoading";
import {RouteTransition} from "./components/brand/RouteTransition";
import {ScrollToTop} from "./components/brand/ScrollToTop";

import {Layout} from "./components/Layout";

/**
 * The trust panel and its entry point are split out of the main bundle. They
 * pull the ERC-8004 connector and its graph transport, which nothing else in
 * the app needs, and most visits never open them.
 */
const ActivityPage = lazy(() =>
    import("./pages/ActivityPage").then((module) => ({default: module.ActivityPage})),
);
const AccountPage = lazy(() =>
    import("./pages/AccountPage").then((module) => ({default: module.AccountPage})),
);
const AgentDirectory = lazy(() =>
    import("./pages/AgentDirectory").then((module) => ({default: module.AgentDirectory})),
);
const AgentTrustPanel = lazy(() =>
    import("./pages/AgentTrustPanel").then((module) => ({default: module.AgentTrustPanel})),
);
const Landing = lazy(() => import("./pages/Landing").then((module) => ({default: module.Landing})));
/**
 * The tool surface is split for the same reason and measured: importing it statically grew the
 * entry chunk by 16,230 bytes and dissolved the separate `erc8004-connector` chunk into it, which
 * also falsified the comment above — the connector would then be something the eagerly loaded
 * bundle needs. `rules/ui.md`: lazy-load route-level code.
 */
const AtomPanel = lazy(() =>
    import("./pages/AtomPanel").then((module) => ({default: module.AtomPanel})),
);
/** Reads both indexes, so it is lazy like the pages it searches (task 48). */
const PulsePage = lazy(() =>
    import("./pages/PulsePage").then((module) => ({default: module.PulsePage})),
);
const SearchPage = lazy(() =>
    import("./pages/SearchPage").then((module) => ({default: module.SearchPage})),
);
/** Same reason: it reads the Intuition graph, which nothing in the eager bundle needs. */
const ToolCatalog = lazy(() =>
    import("./pages/ToolCatalog").then((module) => ({default: module.ToolCatalog})),
);
/** The three paths opened from scene 4 of `/` (task 53). */
const StartPage = lazy(() =>
    import("./pages/StartPage").then((module) => ({default: module.StartPage})),
);

function App() {
    return (
        <Layout>
            <ScrollToTop />
            {/* The third motion scale, and the one that has to be hardest to notice (`docs/18`
                §5): the arriving page fades in over 200ms, opacity only, and back and forward
                swap with no transition at all. Why there is no out-fade is in the component. */}
            <RouteTransition>
                <Routes>
                    {/* `/` is the landing, from the second design handoff's `landing.html`, which it
                    marks approved as final. It was the tool catalogue, which was itself a
                    replacement for `ModuleList` — ARP's own `ModuleRegistry`, retired by ADR
                    `0051`. The catalogue keeps `/tools`.

                    Everything on it reads from the chain, including the empty state: on mainnet
                    there are zero declarations by an identified agent, and the page says so rather
                    than showing a sample. */}
                    <Route
                        path="/"
                        element={
                            <Suspense fallback={<RouteFallback label="the front page" />}>
                                <Landing />
                            </Suspense>
                        }
                    />
                    {/* Now a branch of `/start/agent` (task 62, ADR `0125`), by way of `/register`
                    (2026-10-29). Redirected with its query, so a link carrying `?have=` still lands
                    on the branch it named. */}
                    <Route path="/agent" element={<RegisterRedirect what="agent" />} />
                    {/* The old spelling of the "yes" branch. Redirected, not removed: it is linked from
                    commits, ADRs and task files. */}
                    <Route
                        path="/agent/import"
                        element={<Navigate to="/start/agent?have=yes" replace />}
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
                    {/* What the operator authorised and configured: the Smart Account, its
                    delegations and the runtime they name. Reached from the wallet menu (user,
                    2026-10-30). It replaced `/rig`'s steps 3 and 4, and `/profile`'s positions
                    moved to `/activity`; `/rig`, `/profile` and `/me` are gone (`docs/tasks/35`
                    §0), so an old link lands on no route rather than on a redirect. */}
                    <Route
                        path="/account"
                        element={
                            <Suspense fallback={<RouteFallback label="account" />}>
                                <AccountPage />
                            </Suspense>
                        }
                    />
                    {/* Folded into `/start/<profile>` (task 62, ADR `0125`): it wrote what Get started
                    writes, with a wallet. Redirected, not removed, for the links in commits and ADRs. */}
                    <Route path="/register" element={<RegisterRedirect />} />
                    <Route
                        path="/tools"
                        element={
                            <Suspense fallback={<RouteFallback label="tools in use" />}>
                                <ToolCatalog />
                            </Suspense>
                        }
                    />
                    {/* Keyed on an ATOM, and not on a tool. `/tool/atom/:atomId` read `uses` edges
                    only, so a tool had a page and a tag, a category or a protocol did not — they
                    are all atoms with their own vaults and the question is the same for each: who
                    points at this, and what did they put behind saying so (user, 2026-10-27).
                    `/tool/:id` was the testnet `ModuleRegistry` page and went with the registry
                    (ADR `0051`). */}
                    <Route
                        path="/atom/:atomId"
                        element={
                            <Suspense fallback={<RouteFallback label="page" />}>
                                <AtomPanel />
                            </Suspense>
                        }
                    />
                    {/* The old spelling, redirected rather than 404'd: links to it exist in commits, in
                    ADRs and in whatever anybody bookmarked. `AtomRedirect` because `Navigate` cannot
                    carry a param through. */}
                    <Route path="/tool/atom/:atomId" element={<AtomRedirect />} />
                    <Route
                        path="/start/:profile"
                        element={
                            <Suspense fallback={<RouteFallback label="your path" />}>
                                <StartPage />
                            </Suspense>
                        }
                    />
                    {/* What a skill implies and what agents wrote about it (task 63). */}
                    <Route
                        path="/pulse/:owner/:repo/:skill"
                        element={
                            <Suspense fallback={<RouteFallback label="pulse" />}>
                                <PulsePage />
                            </Suspense>
                        }
                    />
                    {/* One field for both indexes (task 48). */}
                    <Route
                        path="/search"
                        element={
                            <Suspense fallback={<RouteFallback label="search" />}>
                                <SearchPage />
                            </Suspense>
                        }
                    />
                    {/* What the operator's agent triggered and declared, from the local feed. */}
                    <Route
                        path="/activity"
                        element={
                            <Suspense fallback={<RouteFallback label="activity" />}>
                                <ActivityPage />
                            </Suspense>
                        }
                    />
                </Routes>
            </RouteTransition>
        </Layout>
    );
}

/** `/tool/atom/:atomId` → `/atom/:atomId`, keeping the id. */
function AtomRedirect() {
    const {atomId} = useParams();
    return <Navigate to={atomId === undefined ? "/tools" : `/atom/${atomId}`} replace />;
}

/**
 * A route still fetching its chunk.
 *
 * `arp-route-loader` holds it invisible for `--loader-delay` (150ms) and then fades it in, so **a
 * cached route never shows a loader at all** — which is most navigations after the first. No JS
 * timer decides that; it is an `animation-delay`, so there is nothing to cancel if the chunk
 * arrives first and nothing to leak if it does not.
 */
function RouteFallback({label}: {label: string}) {
    return (
        <div className="arp-route-loader">
            <PageLoading label={`Loading ${label}`}>loading {label}…</PageLoading>
        </div>
    );
}

export default App;

/**
 * `/register?what=…&have=…` and `/agent?have=…` → the branch of `/start/<profile>` they named.
 * `/register`'s forms were the wallet forms, so they land on `?with=wallet`; `have=yes` is the
 * import, which needs no wallet choice. With no `what`, there was no branch, and `/` has the door.
 */
export function RegisterRedirect({what}: {what?: "agent" | "tool"}) {
    const {search} = useLocation();
    const params = new URLSearchParams(search);
    const profile = what ?? params.get("what");
    if (profile === "tool") return <Navigate to="/start/tool?with=wallet" replace />;
    if (profile !== "agent") return <Navigate to="/" replace />;
    const have = params.get("have");
    if (have === "yes") return <Navigate to="/start/agent?have=yes" replace />;
    if (have === "no") return <Navigate to="/start/agent?with=wallet" replace />;
    return <Navigate to="/start/agent" replace />;
}
