import {useId, useState} from "react";
import {Link, useParams, useSearchParams} from "react-router-dom";

import {AgentIdentityPanel} from "../components/agent/AgentIdentityPanel";
import {AssessmentRow} from "../components/agent/AssessmentRow";
import {CapabilitySection} from "../components/agent/CapabilitySection";
import {MainnetNotice} from "../components/agent/MainnetNotice";
import {panelDomId, tabDomId} from "../components/agent/tab-ids";
import {TrustPanelTabs} from "../components/agent/TrustPanelTabs";
import {UnreadSources} from "../components/agent/UnreadSources";
import {useAgentProfile} from "../hooks/use-agent-profile";
import {useStakeSession} from "../hooks/use-stake-session";
import {
    buildPanelTabs,
    selectPanelTab,
    shouldUseTabs,
    type TrustPanelView,
} from "../services/agent-trust";
import {ERC8004_GRAPHQL_URL} from "../services/erc8004-connector";
import type {StakeSession} from "../services/trust-stake";

/**
 * `/agent/:chainId/:tokenId` — the trust panel.
 *
 * One view of everything that is known about an ERC-8004 agent and, just as
 * importantly, of what could not be established: which signatures actually
 * check out, which documents are past the window their own publisher declared,
 * which providers could not be reached at all, and how thin the market on each
 * claim really is.
 *
 * The left rail is the agent and stays put — identity belongs to no provider,
 * so it must not vanish when a reader opens one. The right column is where the
 * claims live, and where the tabs are: the agent's own data first, then one per
 * provider, then ARP's own position.
 *
 * Every read here is Intuition **mainnet**, regardless of the wallet's chain.
 */

const TAB_PARAM = "tab";

function parseTokenId(value: string | undefined): string | null {
    if (value === undefined || !/^\d+$/.test(value)) return null;
    return value;
}

function parseChainId(value: string | undefined): number | null {
    if (value === undefined || !/^\d+$/.test(value)) return null;
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function AgentAvatar({src, name}: {src: string; name: string}) {
    const [failed, setFailed] = useState(false);
    if (failed) return null;
    return (
        <img
            src={src}
            alt={`${name} avatar`}
            width={56}
            height={56}
            loading="lazy"
            onError={() => setFailed(true)}
            className="w-14 h-14 object-cover border border-[color:var(--color-border-strong)]"
        />
    );
}

export function AgentTrustPanel() {
    const params = useParams();
    const chainId = parseChainId(params.chainId);
    const tokenId = parseTokenId(params.tokenId);
    const ref = chainId !== null && tokenId !== null ? {chainId, tokenId} : null;

    const [searchParams, setSearchParams] = useSearchParams();
    const baseId = useId();

    // The market numbers and the vault a stake lands in must be the same curve.
    // Until the chain read resolves this is undefined and the package default is
    // used, which is correct on mainnet today; if the chain ever reports another
    // curve the query key changes and the profile refetches against it.
    const sessionQuery = useStakeSession();
    const profileQuery = useAgentProfile(ref, sessionQuery.data?.curveId);
    const view = profileQuery.data;

    /**
     * `replace` rather than `push`: a tab is a way of looking at one page, not a
     * place. Pushing would make Back walk the reader through every tab they
     * opened before it left the agent. The URL still changes, so the link is
     * still shareable and a refresh still lands on the same tab.
     */
    function handleSelectTab(slug: string) {
        setSearchParams(
            (current) => {
                const next = new URLSearchParams(current);
                next.set(TAB_PARAM, slug);
                return next;
            },
            {replace: true},
        );
    }

    if (ref === null) {
        return (
            <section>
                <p className="max-w-[60ch]">
                    A trust panel is addressed by chain id and token id, both decimal — for example{" "}
                    <span className="font-mono">/agent/8453/2340</span>.
                </p>
                <p className="mt-4">
                    <Link to="/agents" className="text-[color:var(--color-accent)]">
                        Look one up →
                    </Link>
                </p>
            </section>
        );
    }

    return (
        <article>
            <Link
                to="/agents"
                className="font-mono text-[length:var(--text-body-sm)] text-[color:var(--color-fg-60)]"
            >
                ← agents
            </Link>

            <div className="mt-4">
                <MainnetNotice />
            </div>

            {profileQuery.isLoading ? (
                <LoadingShape chainId={ref.chainId} tokenId={ref.tokenId} />
            ) : profileQuery.error !== null ? (
                <section className="mt-10">
                    <h1 className="text-[length:var(--text-display)] leading-[var(--leading-display)] tracking-tight font-semibold">
                        Could not read this agent
                    </h1>
                    <p className="mt-4 max-w-[60ch] text-[color:var(--color-fg-60)]">
                        Every source failed, so nothing here would be an answer.{" "}
                        {profileQuery.error.message}
                    </p>
                    <button
                        type="button"
                        onClick={() => void profileQuery.refetch()}
                        className="mt-5 px-3 py-1.5 text-[length:var(--text-body-sm)] border border-[color:var(--color-border-strong)]"
                    >
                        Try again
                    </button>
                </section>
            ) : view === undefined ? null : !view.found ? (
                <section className="mt-10">
                    <h1 className="text-[length:var(--text-display)] leading-[var(--leading-display)] tracking-tight font-semibold">
                        No agent there
                    </h1>
                    <p className="mt-4 max-w-[60ch] text-[color:var(--color-fg-60)]">
                        Nothing resolves for <span className="font-mono">{view.caip19}</span>. The
                        sources answered cleanly; the agent is simply not registered under that
                        token id.
                    </p>
                    <p className="mt-5">
                        <Link to="/agents" className="text-[color:var(--color-accent)]">
                            Try another →
                        </Link>
                    </p>
                </section>
            ) : (
                <>
                    <header className="mt-8 mb-10">
                        <div className="flex items-start gap-4">
                            {view.image !== null ? (
                                <AgentAvatar src={view.image} name={view.name ?? view.tokenId} />
                            ) : null}
                            <div className="min-w-0">
                                <h1 className="text-[length:var(--text-display)] leading-[var(--leading-display)] tracking-tight font-semibold break-words">
                                    {view.name ?? `Token ${view.tokenId}`}
                                </h1>
                                <p className="mt-2 font-mono text-[length:var(--text-body-sm)] text-[color:var(--color-fg-60)] break-all">
                                    {view.caip19}
                                </p>
                            </div>
                        </div>

                        {view.isFallbackMetadata ? (
                            <p className="mt-4 border border-[color:var(--color-border-strong)] px-3 py-2 text-[length:var(--text-body-sm)] max-w-[64ch]">
                                This name and URL are the indexer's stand-in, not the agent's own.
                                It registered without metadata — about 54% of the cohort is in that
                                state — so <span className="font-mono">{view.name}</span> is a
                                generated label and tells you nothing about what this agent does.
                            </p>
                        ) : view.description !== null ? (
                            <p className="mt-4 max-w-[68ch] text-[color:var(--color-fg-60)]">
                                {view.description}
                            </p>
                        ) : null}
                    </header>

                    <div className="grid lg:grid-cols-[minmax(0,17rem)_minmax(0,1fr)] gap-x-12 gap-y-12">
                        <AgentIdentityPanel view={view} />

                        <div className="min-w-0">
                            {shouldUseTabs(view.rows) ? (
                                <TabbedClaims
                                    view={view}
                                    baseId={baseId}
                                    requestedTab={searchParams.get(TAB_PARAM)}
                                    onSelectTab={handleSelectTab}
                                    session={sessionQuery.data}
                                    sessionError={sessionQuery.error}
                                />
                            ) : (
                                <StackedClaims
                                    view={view}
                                    session={sessionQuery.data}
                                    sessionError={sessionQuery.error}
                                />
                            )}

                            <p className="mt-16 text-[length:var(--text-body-sm)] text-[color:var(--color-fg-60)] max-w-[64ch]">
                                Graph read from{" "}
                                <span className="font-mono">{ERC8004_GRAPHQL_URL}</span>.
                            </p>
                        </div>
                    </div>
                </>
            )}
        </article>
    );
}

type ClaimsProps = {
    view: TrustPanelView;
    session: StakeSession | undefined;
    sessionError: Error | null;
};

/**
 * Two or more providers: the agent's own data, then one tab each, then ARP.
 *
 * The strip carries the per-provider summary, so the comparison stacking gave
 * away for free survives being one-at-a-time — see `TrustPanelTabs`.
 */
function TabbedClaims({
    view,
    baseId,
    requestedTab,
    onSelectTab,
    session,
    sessionError,
}: ClaimsProps & {
    baseId: string;
    requestedTab: string | null;
    onSelectTab: (slug: string) => void;
}) {
    const model = buildPanelTabs(view.rows);
    const selected = selectPanelTab(model, requestedTab);
    const hasUnreadSources = view.sourceErrors.length > 0 || view.conflicts.length > 0;

    return (
        <>
            {/* The tab labels are the section headings a reader sees; this one
                keeps the document outline from jumping h1 → h3. */}
            <h2 className="sr-only">Assessments and agent data</h2>

            <TrustPanelTabs
                tabs={model.tabs}
                selectedSlug={selected.slug}
                baseId={baseId}
                onSelect={onSelectTab}
            />

            <div
                role="tabpanel"
                id={panelDomId(baseId, selected.slug)}
                aria-labelledby={tabDomId(baseId, selected.slug)}
                tabIndex={0}
                className="mt-10"
            >
                {selected.kind === "provider" ? (
                    /* Keyed on the row: without it React reuses the instance
                       across a tab switch and the stake control keeps the quote
                       it built for the previous provider's claim. */
                    <AssessmentRow
                        key={selected.row.id}
                        row={selected.row}
                        session={session}
                        sessionError={sessionError}
                    />
                ) : selected.kind === "arp" ? (
                    <ArpPosition />
                ) : (
                    <AgentData view={view} hasUnreadSources={hasUnreadSources} />
                )}
            </div>
        </>
    );
}

/**
 * Fewer than two providers: no strip.
 *
 * One provider covers 99.99% of this cohort, so this is the ordinary case, and
 * a tab strip over a single claim would be a control with no choice behind it.
 */
function StackedClaims({view, session, sessionError}: ClaimsProps) {
    return (
        <>
            <section>
                <h2 className="font-medium">Assessments</h2>
                {view.rows.length === 0 ? (
                    <p className="mt-6 text-[length:var(--text-body-sm)] text-[color:var(--color-fg-60)] max-w-[60ch]">
                        No trust provider has written an edge about this agent. With 99.99% of the
                        cohort covered by one provider, an agent with none is unusual — and there is
                        nothing here to take a position on.
                    </p>
                ) : (
                    <div className="mt-8 flex flex-col gap-14">
                        {view.rows.map((row) => (
                            <AssessmentRow
                                key={row.id}
                                row={row}
                                session={session}
                                sessionError={sessionError}
                            />
                        ))}
                    </div>
                )}

                <div className="mt-14">
                    <ArpPosition />
                </div>
            </section>

            <section className="mt-16">
                <h2 className="font-medium">Capabilities</h2>
                <div className="mt-6">
                    <CapabilitySection groups={view.capabilities} count={view.capabilityCount} />
                </div>
            </section>

            {view.sourceErrors.length > 0 || view.conflicts.length > 0 ? (
                <section className="mt-16">
                    <h2 className="font-medium">What could not be read</h2>
                    <div className="mt-4">
                        <UnreadSources view={view} />
                    </div>
                </section>
            ) : null}
        </>
    );
}

/** The `Agent` tab: what this agent is for, and what could not be read about it. */
function AgentData({view, hasUnreadSources}: {view: TrustPanelView; hasUnreadSources: boolean}) {
    return (
        <div className="flex flex-col gap-14">
            <section>
                <h3 className="font-medium">Capabilities</h3>
                <div className="mt-6">
                    <CapabilitySection groups={view.capabilities} count={view.capabilityCount} />
                </div>
            </section>

            {hasUnreadSources ? (
                <section>
                    <h3 className="font-medium">What could not be read</h3>
                    <div className="mt-4">
                        <UnreadSources view={view} />
                    </div>
                </section>
            ) : null}
        </div>
    );
}

/**
 * ARP's own position. It has no assessment to publish yet and says so, rather
 * than occupying the slot with a number it has not earned. Phase 3 is where
 * this changes, and it changes by ARP staking on its own reads first.
 */
function ArpPosition() {
    return (
        <article className="pl-5 border-l border-l-[color:var(--color-border-strong)]">
            <h3 className="text-[length:var(--text-body)] font-medium">ARP</h3>
            <p className="mt-3 font-mono uppercase tracking-wider text-[length:var(--text-label)] text-[color:var(--color-fg-60)]">
                insufficient evidence
            </p>
            <p className="mt-3 text-[length:var(--text-body-sm)] text-[color:var(--color-fg-60)] max-w-[60ch]">
                ARP publishes no assessment of this agent. It has no execution record for it and no
                capital at risk on it, and a score assembled out of neither would be exactly the
                costless signal this panel exists to argue against.
            </p>
        </article>
    );
}

/**
 * A loading state shaped like the answer: the agent being resolved, named,
 * where its name will be. Not a grey block on a grey background.
 */
function LoadingShape({chainId, tokenId}: {chainId: number; tokenId: string}) {
    return (
        <section className="mt-10" aria-live="polite">
            <h1 className="text-[length:var(--text-display)] leading-[var(--leading-display)] tracking-tight font-semibold text-[color:var(--color-fg-60)]">
                Resolving {chainId}:{tokenId}
            </h1>
        </section>
    );
}
