import {useId, useState} from "react";
import {Link, useParams, useSearchParams} from "react-router-dom";
import {useAccount} from "wagmi";

import {linkClass} from "../lib/control-class";
import {AtomMarket} from "../components/market/AtomMarket";
import {AgentIdentityPanel, AgentSigil} from "../components/agent/AgentIdentityPanel";
import {RatingRow} from "../components/agent/RatingRow";
import {CapabilitySection} from "../components/agent/CapabilitySection";
import {panelDomId, tabDomId} from "../components/agent/tab-ids";
import {TrustPanelTabs} from "../components/agent/TrustPanelTabs";
import {UnreadSources} from "../components/agent/UnreadSources";
import {useChainChoice} from "../lib/chain-choice";
import {identityRegistryFor} from "../lib/deployments";
import {AgentClaims, AgentDeclareCard} from "../components/agent/AgentClaims";
import {SectionTabs} from "../components/agent/SectionTabs";
import {AgentEndpoints} from "../components/agent/AgentEndpoints";
import {actionCardClass} from "../lib/surface-class";
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
/**
 * The outer strip's own query parameter.
 *
 * Separate from `tab`, which the **ratings** strip inside one of these sections already owns. Two
 * strips sharing one parameter would have a provider slug select a section and a section slug
 * select a provider — each silently falling back to its default, which looks like the link simply
 * not working.
 */
const SECTION_PARAM = "section";

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
    // The registry travels with the ref. Without it the panel resolved every chain against the
    // canonical Base address and ARP's own testnet agents had no page at all — `tasks/28` item 42.
    const ref =
        chainId !== null && tokenId !== null
            ? {
                  chainId,
                  tokenId,
                  ...(identityRegistryFor(chainId) === undefined
                      ? {}
                      : {registry: identityRegistryFor(chainId)}),
              }
            : null;

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
     * The sections, as tabs.
     *
     * Built from the view rather than fixed: "Not read" is offered only when something actually
     * failed — an always-present "nothing failed" tab is a row of reassurance, which is not
     * information — and "Claims" needs an atom to have claims about.
     */
    const sectionTabs = [
        ...(backingAtomId === null ? [] : [{slug: "claims", label: "Claims"}]),
        {slug: "endpoints", label: "Endpoints"},
        {slug: "ratings", label: "Ratings", count: view?.rows.length ?? null},
        {slug: "capabilities", label: "Capabilities", count: view?.capabilityCount ?? null},
        ...((view?.sourceErrors.length ?? 0) > 0 || (view?.conflicts.length ?? 0) > 0
            ? [{slug: "unread", label: "Not read"}]
            : []),
    ];
    const requestedSection = searchParams.get(SECTION_PARAM);
    const selectedSection =
        sectionTabs.find((tab) => tab.slug === requestedSection)?.slug ??
        sectionTabs[0]?.slug ??
        "endpoints";
    /**
     * Whether the connected wallet holds a position here, for the sigil's core.
     *
     * The same query key `AtomMarket` uses, so react-query serves one request for both rather
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
    function handleSelectSection(slug: string) {
        setSearchParams(
            (current) => {
                const next = new URLSearchParams(current);
                next.set(SECTION_PARAM, slug);
                return next;
            },
            {replace: true},
        );
    }

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
                                    Name and URL are the indexer&rsquo;s stand-in — no source
                                    published a name for this agent
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

                    {/* **The atom page's shell**, which the user asked for after using both:
                        _« la page tools est vraiment mieux, je voudrais la même chose pour la page
                        detailed agent »_. Identity in an 18rem column, everything else beside it.

                        The numbered rail is gone with it. It existed to make the page's **order**
                        visible — identity, the market, who used it, what others say — and each rung
                        does cost more to produce than the one above. That argument survives in the
                        ordering itself; what it does not need is a 200px column repeating it in
                        mono beside every section. `PanelSection` is deleted rather than left
                        unused (`rules/code.md`). */}
                    <div className="grid gap-x-12 gap-y-10 md:grid-cols-[18rem_1fr] md:items-start">
                        <aside>
                            <AgentIdentityPanel view={view} />
                        </aside>

                        <div className="flex min-w-0 flex-col gap-12">
                            {/* The market on **this agent**, which is what the page is about. The ratings
                        below are one provider's opinion, which runs beside this rather than feeding
                        it (ADR `0056`).

                        Absent when the graph has no atom: no vault to deposit into, so the section
                        would be a form with nowhere to send. Measured on mainnet 1155 — most of the
                        mirrored cohort does resolve to one, and the ones that do not are the honest
                        gap. */}
                            {backingAtomId === null ? null : (
                                <section>
                                    <h2 className="font-medium">Support</h2>
                                    <div className="mt-5">
                                        {/* The same string the `h1` above uses. `view.tokenId` alone made the
                                confirmation read "deposit onto 2340" while the heading said
                                "Token 2340" — the one screen where the subject has to be
                                unmistakable (ADR `0017` safeguard 4). */}
                                        {/* **An action card**, the same shape the atom page gives the same
                                component — the design reference's `.act`: a stronger border, the
                                panel background, 20px of padding. A thing you can act on separates
                                harder than a thing you read, and this section was neither: a figure
                                row and a form on the page background, at the weight of everything
                                around them. The user's verdict on that: « tout est pareil ». */}
                                        <div className={actionCardClass}>
                                            <AtomMarket
                                                atomTermId={backingAtomId}
                                                name={view.name ?? `Token ${view.tokenId}`}
                                                nameIsId={view.name === null}
                                                heading={null}
                                            />
                                        </div>
                                    </div>
                                </section>
                            )}

                            {/* **The declaration card stays above the strip.** It is one of the
                                page's two writes, and putting a write behind a tab hides it behind
                                a click. `(my agent) uses (this agent)` is a real claim — ADR `0056`
                                §2: a client writes it with its own identity atom as the subject. */}
                            {backingAtomId === null ? null : (
                                <AgentDeclareCard
                                    atomId={backingAtomId}
                                    name={view.name ?? `Token ${view.tokenId}`}
                                />
                            )}

                            {/* **Everything a reader reads, as tabs.** Five answers stacked meant
                                scrolling past four to reach the fifth (user, 2026-10-28). The strip
                                carries them; the actions above it do not move. */}
                            <div>
                                <SectionTabs
                                    tabs={sectionTabs}
                                    selectedSlug={selectedSection}
                                    baseId={`${baseId}-section`}
                                    onSelect={handleSelectSection}
                                />
                                <div
                                    role="tabpanel"
                                    id={panelDomId(`${baseId}-section`, selectedSection)}
                                    aria-labelledby={tabDomId(`${baseId}-section`, selectedSection)}
                                    tabIndex={0}
                                    className="mt-8"
                                >
                                    {selectedSection === "claims" && backingAtomId !== null ? (
                                        <AgentClaims
                                            atomId={backingAtomId}
                                            name={view.name ?? `Token ${view.tokenId}`}
                                        />
                                    ) : null}
                                    {selectedSection === "endpoints" ? (
                                        <AgentEndpoints registrationFile={view.registrationFile} />
                                    ) : null}
                                    {selectedSection === "ratings" ? (
                                        shouldUseTabs(view.rows) ? (
                                            <TabbedClaims
                                                view={view}
                                                baseId={baseId}
                                                requestedTab={searchParams.get(TAB_PARAM)}
                                                onSelectTab={handleSelectTab}
                                                session={sessionQuery.data}
                                            />
                                        ) : (
                                            <StackedClaims
                                                view={view}
                                                session={sessionQuery.data}
                                            />
                                        )
                                    ) : null}
                                    {selectedSection === "capabilities" ? (
                                        <CapabilitySection
                                            groups={view.capabilities}
                                            count={view.capabilityCount}
                                        />
                                    ) : null}
                                    {selectedSection === "unread" ? (
                                        <UnreadSources view={view} />
                                    ) : null}
                                </div>
                            </div>

                            <p className="border-t border-[color:var(--color-rule)] pt-5 font-mono text-[length:var(--text-label)] text-[color:var(--color-steel)]">
                                Graph read from {chain.graphqlUrl}
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
