import {useState} from "react";
import {Link, useParams} from "react-router-dom";

import {AgentIdentityPanel} from "../components/agent/AgentIdentityPanel";
import {AssessmentRow} from "../components/agent/AssessmentRow";
import {CapabilitySection} from "../components/agent/CapabilitySection";
import {MainnetNotice} from "../components/agent/MainnetNotice";
import {useAgentProfile} from "../hooks/use-agent-profile";
import {useStakeSession} from "../hooks/use-stake-session";
import {ERC8004_GRAPHQL_URL} from "../services/erc8004-connector";

/**
 * `/agent/:chainId/:tokenId` — the trust panel.
 *
 * One view of everything that is known about an ERC-8004 agent and, just as
 * importantly, of what could not be established: which signatures actually
 * check out, which documents are past the window their own publisher declared,
 * which providers could not be reached at all, and how thin the market on each
 * claim really is.
 *
 * Every read here is Intuition **mainnet**, regardless of the wallet's chain.
 */

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

    // The market numbers and the vault a stake lands in must be the same curve.
    // Until the chain read resolves this is undefined and the package default is
    // used, which is correct on mainnet today; if the chain ever reports another
    // curve the query key changes and the profile refetches against it.
    const sessionQuery = useStakeSession();
    const profileQuery = useAgentProfile(ref, sessionQuery.data?.curveId);
    const view = profileQuery.data;

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
                            <section>
                                <h2 className="font-medium">Assessments</h2>
                                {view.rows.length === 0 ? (
                                    <p className="mt-6 text-[length:var(--text-body-sm)] text-[color:var(--color-fg-60)] max-w-[60ch]">
                                        No trust provider has written an edge about this agent. With
                                        99.99% of the cohort covered by one provider, an agent with
                                        none is unusual — and there is nothing here to take a
                                        position on.
                                    </p>
                                ) : (
                                    <div className="mt-8 flex flex-col gap-14">
                                        {view.rows.map((row) => (
                                            <AssessmentRow
                                                key={row.id}
                                                row={row}
                                                session={sessionQuery.data}
                                                sessionError={sessionQuery.error}
                                            />
                                        ))}
                                    </div>
                                )}

                                <ArpRow />
                            </section>

                            <section className="mt-16">
                                <h2 className="font-medium">Capabilities</h2>
                                <div className="mt-6">
                                    <CapabilitySection
                                        groups={view.capabilities}
                                        count={view.capabilityCount}
                                    />
                                </div>
                            </section>

                            {view.sourceErrors.length > 0 || view.conflicts.length > 0 ? (
                                <section className="mt-16">
                                    <h2 className="font-medium">What could not be read</h2>
                                    <ul className="mt-4 flex flex-col gap-2 text-[length:var(--text-body-sm)] text-[color:var(--color-fg-60)]">
                                        {view.sourceErrors.map((error, index) => (
                                            <li key={`${error.sourceId}-${index}`}>
                                                <span className="font-mono">{error.sourceId}</span>{" "}
                                                failed at{" "}
                                                <span className="font-mono">{error.step}</span>:{" "}
                                                {error.message}
                                            </li>
                                        ))}
                                        {view.conflicts.map((conflict, index) => (
                                            <li key={`${conflict.field}-${index}`}>
                                                Sources disagree on{" "}
                                                <span className="font-mono">{conflict.field}</span>:{" "}
                                                {conflict.entries
                                                    .map(
                                                        (entry) =>
                                                            `${entry.sourceId} says ${entry.value ?? "nothing"}`,
                                                    )
                                                    .join("; ")}
                                                . Both answers kept.
                                            </li>
                                        ))}
                                    </ul>
                                </section>
                            ) : null}

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

/**
 * ARP's own row. It has no assessment to publish yet and says so, rather than
 * occupying the slot with a number it has not earned. Phase 3 is where this
 * changes, and it changes by ARP staking on its own reads first.
 */
function ArpRow() {
    return (
        <article className="mt-14 pl-5 border-l border-l-[color:var(--color-border-strong)]">
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
 * A loading state shaped like the answer: the reads that are in flight, named.
 * Not a grey block on a grey background.
 */
function LoadingShape({chainId, tokenId}: {chainId: number; tokenId: string}) {
    return (
        <section className="mt-10" aria-live="polite">
            <h1 className="text-[length:var(--text-display)] leading-[var(--leading-display)] tracking-tight font-semibold text-[color:var(--color-fg-60)]">
                Resolving {chainId}:{tokenId}
            </h1>
            <ul className="mt-6 flex flex-col gap-2 font-mono text-[length:var(--text-body-sm)] text-[color:var(--color-fg-60)]">
                <li>intuition graph — identity, trust edges, capabilities, markets</li>
                <li>erc-8004 registry on chain {chainId} — owner, registration file</li>
                <li>each provider's resolver — document, signature, freshness window</li>
            </ul>
        </section>
    );
}
