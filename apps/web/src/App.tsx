import {lazy, Suspense} from "react";
import {Navigate, Route, Routes, useLocation, useParams} from "react-router-dom";

import {PageLoading} from "./components/brand/PageLoading";
import {RouteTransition} from "./components/brand/RouteTransition";
import {ScrollToTop} from "./components/brand/ScrollToTop";

import {Layout} from "./components/Layout";
import {AgentRegister} from "./pages/AgentRegister";

/**
 * The trust panel and its entry point are split out of the main bundle. They
 * pull the ERC-8004 connector and its graph transport, which nothing else in
 * the app needs, and most visits never open them.
 */
const ActivityPage = lazy(() =>
    import("./pages/ActivityPage").then((module) => ({default: module.ActivityPage})),
);
const Profile = lazy(() => import("./pages/Profile").then((module) => ({default: module.Profile})));
const AgentDirectory = lazy(() =>
    import("./pages/AgentDirectory").then((module) => ({default: module.AgentDirectory})),
);
const AgentTrustPanel = lazy(() =>
    import("./pages/AgentTrustPanel").then((module) => ({default: module.AgentTrustPanel})),
);
const Landing = lazy(() => import("./pages/Landing").then((module) => ({default: module.Landing})));
const Register = lazy(() =>
    import("./pages/Register").then((module) => ({default: module.Register})),
);
/**
 * The tool surface is split for the same reason and measured: importing it statically grew the
 * entry chunk by 16,230 bytes and dissolved the separate `erc8004-connector` chunk into it, which
 * also falsified the comment above — the connector would then be something the eagerly loaded
 * bundle needs. `rules/ui.md`: lazy-load route-level code.
 */
const AtomPanel = lazy(() =>
    import("./pages/AtomPanel").then((module) => ({default: module.AtomPanel})),
);
/** Same reason: it reads the Intuition graph, which nothing in the eager bundle needs. */
const ToolCatalog = lazy(() =>
    import("./pages/ToolCatalog").then((module) => ({default: module.ToolCatalog})),
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
                    {/* One door, one question — "does your agent already have an ERC-8004 id?" — with
                    both branches on this page. It was two routes that linked only to each other and
                    appeared in no nav, so the only way to reach either was to know the URL (user,
                    2026-10-27). `?have=yes|no` carries the branch, so it is shareable and Back
                    returns to the question. */}
                    {/* Now a branch of `/register` (user, 2026-10-29). Redirected with its query, so a
                    link carrying `?have=` still lands on the branch it named. */}
                    <Route path="/agent" element={<AgentRedirectToRegister />} />
                    {/* The old spelling of the "yes" branch. Redirected, not removed: it is linked from
                    commits, ADRs and task files. */}
                    <Route
                        path="/agent/import"
                        element={<Navigate to="/register?what=agent&have=yes" replace />}
                    />
                    {/* The five-step testnet bring-up, named for what it is. It mints into ARP's **own**
                    copy of the registry on 13579, designates a runtime wallet, deploys a Smart
                    Account, signs two delegations and funds the runtime — a rehearsal of
                    `docs/12` point 5, consumed by `scripts/`, not a path a visitor takes. Out of
                    the nav on purpose. */}
                    <Route path="/rig" element={<AgentRegister />} />
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
                        path="/register"
                        element={
                            <Suspense fallback={<RouteFallback label="register" />}>
                                <Register />
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
                    {/* Keyed on an ATOM, and not on a tool. `/tool/atom/:atomId` read `uses` edges
                    only, so a tool had a page and a tag, a category or a protocol did not — they
                    are all atoms with their own vaults and the question is the same for each: who
                    points at this, and what did they put behind saying so (user, 2026-10-27).
                    `/tool/:id` was the testnet `ModuleRegistry` page and went with the registry
                    (ADR `0051`). */}
                    <Route
                        path="/atom/:atomId"
                        element={
                            <Suspense fallback={<RouteFallback label="atom" />}>
                                <AtomPanel />
                            </Suspense>
                        }
                    />
                    {/* The old spelling, redirected rather than 404'd: links to it exist in commits, in
                    ADRs and in whatever anybody bookmarked. `AtomRedirect` because `Navigate` cannot
                    carry a param through. */}
                    <Route path="/tool/atom/:atomId" element={<AtomRedirect />} />
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

/** `/agent?have=yes` → `/register?what=agent&have=yes`: the branch moved, the query did not. */
function AgentRedirectToRegister() {
    const {search} = useLocation();
    const params = new URLSearchParams(search);
    params.set("what", "agent");
    return <Navigate to={`/register?${params.toString()}`} replace />;
}
