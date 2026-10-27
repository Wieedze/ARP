import {useId, useState} from "react";
import {Link, useParams, useSearchParams} from "react-router-dom";
import {useAccount} from "wagmi";

import {linkClass} from "../lib/control-class";
import {AgentBacking} from "../components/agent/AgentBacking";
import {AgentIdentityPanel, AgentSigil} from "../components/agent/AgentIdentityPanel";
import {PanelSection} from "../components/agent/PanelSection";
import {RatingRow} from "../components/agent/RatingRow";
import {CapabilitySection} from "../components/agent/CapabilitySection";
import {DeclaredUses} from "../components/usage/DeclaredUses";
import {panelDomId, tabDomId} from "../components/agent/tab-ids";
import {TrustPanelTabs} from "../components/agent/TrustPanelTabs";
import {UnreadSources} from "../components/agent/UnreadSources";
import {useChainChoice} from "../lib/chain-choice";
import {useAgentProfile} from "../hooks/use-agent-profile";
import {useStakeSession} from "../hooks/use-stake-session";
import {useTermVault} from "../hooks/use-term-vault";
import {PageLoading} from "../components/brand/PageLoading";
import {
    buildPanelTabs,
    selectPanelTab,
    shouldUseTabs,
    type TrustPanelView,
} from "../services/agent-trust";
import {asStakeTermId, type StakeSession} from "../services/trust-stake";

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
 * Every read follows the chain toggle (`lib/chain-choice.ts`). It used to be mainnet whatever
 * the toggle said, which hid ARP's own testnet edges behind an empty panel.
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
            className="w-14 h-14 object-cover border border-[color:var(--color-rule-strong)]"
        />
    );
}

export function AgentTrustPanel() {
    const params = useParams();
    const chainId = parseChainId(params.chainId);
    const tokenId = parseTokenId(params.tokenId);
    const ref = chainId !== null && tokenId !== null ? {chainId, tokenId} : null;

    const chain = useChainChoice();
    const [searchParams, setSearchParams] = useSearchParams();
    const baseId = useId();

    // The market numbers and the vault a stake lands in must be the same curve.
    // Until the chain read resolves this is undefined and the package default is
    // used, which is correct on mainnet today; if the chain ever reports another
    // curve the query key changes and the profile refetches against it.
    const {address} = useAccount();
    const sessionQuery = useStakeSession();
    const profileQuery = useAgentProfile(ref, sessionQuery.data?.curveId);
    const view = profileQuery.data;
    // Checked, not asserted: `atomTermId` comes off a source handle typed `string`, and a malformed
    // term id would become the address a deposit is sent to.
    const backingAtomId = asStakeTermId(view?.atomTermId ?? null);
    /**
     * Whether the connected wallet holds a position here, for the sigil's core.
     *
     * The same query key `AgentBacking` uses, so react-query serves one request for both rather
     * than two: the alternative was threading the answer up out of a child, which would have made
     * the identity column depend on the market section's render.
     */
    const viewerVault = useTermVault({
        termId: backingAtomId,
        curveId: sessionQuery.data?.curveId ?? null,
        account: address ?? null,
    });
    const viewerStaked = (viewerVault.data?.shares ?? 0n) > 0n;

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
                    <Link to="/agents" className={linkClass}>
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
                className="font-mono text-[length:var(--text-body-sm)] text-[color:var(--color-steel)]"
            >
                ← agents
            </Link>

            <div className="mt-4"></div>

            {profileQuery.isLoading ? (
                <LoadingShape chainId={ref.chainId} tokenId={ref.tokenId} />
            ) : profileQuery.error !== null ? (
                <section className="mt-10">
                    <h1 className="type-title">Could not read this agent</h1>
                    <p className="mt-4 max-w-[60ch] text-[color:var(--color-steel)]">
                        Every source failed, so nothing here would be an answer.{" "}
                        {profileQuery.error.message}
                    </p>
                    <button
                        type="button"
                        onClick={() => void profileQuery.refetch()}
                        className="mt-5 px-3 py-1.5 text-[length:var(--text-body-sm)] border border-[color:var(--color-rule-strong)]"
                    >
                        Try again
                    </button>
                </section>
            ) : view === undefined ? null : !view.found ? (
                <section className="mt-10">
                    <h1 className="type-title">No agent there</h1>
                    <p className="mt-4 max-w-[60ch] text-[color:var(--color-steel)]">
                        Nothing resolves for <span className="font-mono">{view.caip19}</span>. The
                        sources answered cleanly; the agent is simply not registered under that
                        token id.
                    </p>
                    <p className="mt-5">
                        <Link to="/agents" className={linkClass}>
                            Try another →
                        </Link>
                    </p>
                </section>
            ) : (
                <>
                    {/* The header: the mark, the name, what it says about itself. The sigil is
                        beside the name rather than at the top of a metadata column, because it is
                        the agent's identity and that is where an identity mark goes. The avatar
                        only shows when the agent chose one — the sigil is generated and always
                        true, the avatar is whatever was uploaded. */}
                    <header className="flex flex-wrap items-start gap-x-8 gap-y-6 pt-10 pb-12">
                        <AgentSigil view={view} viewerStaked={viewerStaked} />
                        <div className="min-w-0 flex-1">
                            <h1
                                className={`type-title ${
                                    view.name === null ? "text-[color:var(--color-grey)]" : ""
                                }`}
                            >
                                {view.name ?? `Token ${view.tokenId}`}
                            </h1>
                            <p className="mt-4 break-all font-mono text-[length:var(--text-body-sm)] text-[color:var(--color-steel)]">
                                {view.caip19}
                            </p>
                            {view.isFallbackMetadata ? (
                                <p className="mt-5 inline-flex max-w-[64ch] rounded-[var(--radius-tag)] border border-dashed border-[color:var(--color-rule-strong)] px-3 py-1.5 font-mono text-[length:var(--text-label)] text-[color:var(--color-silver)]">
                                    Name and URL are the indexer&rsquo;s stand-in — this agent
                                    registered without metadata
                                </p>
                            ) : view.description !== null ? (
                                <p className="mt-5 max-w-[62ch] text-[color:var(--color-silver)]">
                                    {view.description}
                                </p>
                            ) : null}
                        </div>
                        {view.image !== null ? (
                            <AgentAvatar src={view.image} name={view.name ?? view.tokenId} />
                        ) : null}
                    </header>

                    {/* Numbered sections, in the order the page argues: who it is, what the market
                        on it says, who declared using it, what others rate it. Each rung costs more to
                        produce than the one above it, and the ordering is what says so — the
                        reference's PAID/FREE pills are gone (user, 2026-10-27). */}
                    <PanelSection number="01" title="Identity">
                        <AgentIdentityPanel view={view} />
                    </PanelSection>

                    {/* The market on **this agent**, which is what the page is about. The ratings
                        below are one provider's opinion, which runs beside this rather than feeding
                        it (ADR `0056`).

                        Absent when the graph has no atom: no vault to deposit into, so the section
                        would be a form with nowhere to send. Measured on mainnet 1155 — most of the
                        mirrored cohort does resolve to one, and the ones that do not are the honest
                        gap. */}
                    {backingAtomId === null ? null : (
                        <PanelSection number="02" title="Backing">
                            {/* The same string the `h1` above uses. `view.tokenId` alone made the
                                confirmation read "deposit onto 2340" while the heading said
                                "Token 2340" — the one screen where the subject has to be
                                unmistakable (ADR `0017` safeguard 4). */}
                            <AgentBacking
                                atomTermId={backingAtomId}
                                name={view.name ?? `Token ${view.tokenId}`}
                                nameIsId={view.name === null}
                            />
                        </PanelSection>
                    )}

                    {/* The same component the atom page uses, because it is the same read: `uses`
                        edges whose object is this atom. Keyed on the agent's atom rather than its
                        token id, so it is absent for the same reason section 02 is. */}
                    {backingAtomId === null ? null : (
                        <PanelSection number="03" title="Who declared it">
                            <DeclaredUses atomId={backingAtomId} />
                        </PanelSection>
                    )}

                    <PanelSection number="04" title="Ratings">
                        {shouldUseTabs(view.rows) ? (
                            <TabbedClaims
                                view={view}
                                baseId={baseId}
                                requestedTab={searchParams.get(TAB_PARAM)}
                                onSelectTab={handleSelectTab}
                                session={sessionQuery.data}
                            />
                        ) : (
                            <StackedClaims view={view} session={sessionQuery.data} />
                        )}
                    </PanelSection>

                    <PanelSection number="05" title="Capabilities">
                        <CapabilitySection
                            groups={view.capabilities}
                            count={view.capabilityCount}
                        />
                    </PanelSection>

                    {/* Only when something actually failed. An always-present "nothing failed"
                        section would be a row of reassurance, which is not information. */}
                    {view.sourceErrors.length > 0 || view.conflicts.length > 0 ? (
                        <PanelSection number="06" title="Not read">
                            <UnreadSources view={view} />
                        </PanelSection>
                    ) : null}

                    <p className="border-t border-[color:var(--color-rule)] pt-5 font-mono text-[length:var(--text-label)] text-[color:var(--color-grey)]">
                        Graph read from {chain.graphqlUrl}
                    </p>
                </>
            )}
        </article>
    );
}

type ClaimsProps = {
    view: TrustPanelView;
    session: StakeSession | undefined;
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
}: ClaimsProps & {
    baseId: string;
    requestedTab: string | null;
    onSelectTab: (slug: string) => void;
}) {
    const model = buildPanelTabs(view.rows);
    const selected = selectPanelTab(model, requestedTab);

    return (
        <>
            {/* The tab labels are the section headings a reader sees; this one
                keeps the document outline from jumping h1 → h3. */}
            <h2 className="sr-only">Ratings and agent data</h2>

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
                    <RatingRow key={selected.row.id} row={selected.row} session={session} />
                ) : (
                    <ArpPosition />
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
function StackedClaims({view, session}: ClaimsProps) {
    return (
        <>
            {view.rows.length === 0 ? (
                <p className="max-w-[60ch] text-[length:var(--text-body-sm)] text-[color:var(--color-steel)]">
                    No trust provider has written an edge about this agent.
                </p>
            ) : (
                <div className="flex flex-col gap-14">
                    {view.rows.map((row) => (
                        <RatingRow key={row.id} row={row} session={session} />
                    ))}
                </div>
            )}
            <div className="mt-9">
                <ArpPosition />
            </div>
        </>
    );
}

/**
 * ARP's own position. It has no rating to publish yet and says so, rather
 * than occupying the slot with a number it has not earned. Phase 3 is where
 * this changes, and it changes by ARP staking on its own reads first.
 */
function ArpPosition() {
    return (
        <article className="pl-5 border-l border-l-[color:var(--color-rule-strong)]">
            <h3 className="text-[length:var(--text-body)] font-medium">ARP</h3>
            <p className="mt-3 font-mono uppercase tracking-wider text-[length:var(--text-label)] text-[color:var(--color-steel)]">
                insufficient evidence
            </p>
            <p className="mt-3 text-[length:var(--text-body-sm)] text-[color:var(--color-steel)] max-w-[60ch]">
                ARP publishes no rating, and will not.
            </p>
        </article>
    );
}

/**
 * A loading state shaped like the answer: the agent being resolved, named.
 *
 * It used to render the name as an `h1` beside a 40px ring, so the page had a heading that was not
 * the agent's. `PageLoading` centres the mark and keeps the subject in the label, which is the
 * same information without claiming to be the page's title.
 */
function LoadingShape({chainId, tokenId}: {chainId: number; tokenId: string}) {
    return (
        <PageLoading label="Resolving this agent">
            resolving {chainId}:{tokenId}
        </PageLoading>
    );
}
