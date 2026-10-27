import {useAccount} from "wagmi";

import {useClaimVaults} from "../../hooks/use-claim-vaults";
import type {TrustRow} from "../../services/agent-trust";
import {describeFetchError} from "../../services/trust-format";
import type {StakeSession} from "../../services/trust-stake";

import {EvidenceRail} from "./EvidenceRail";
import {MarketPanel} from "./MarketPanel";
import {SCORE_SIZE_CLASS, SCORE_TONE_CLASS} from "./evidence-scale";
import {FreshnessLine, SignatureLine} from "./VerdictLines";

/**
 * One provider's rating of this agent, and the market that already exists on it.
 *
 * Score and reviewer count are given the same footing, which is the panel's
 * whole argument: the number is set at the size its evidence earns, and the
 * rail underneath it shows that evidence before the reader has parsed a digit.
 *
 * ## No stake control here any more (user, 2026-10-27)
 *
 * It carried one. The claim it let you bet on is `(agent, has trust provider, provider)` — "is this
 * provider worth listening to about this agent" — and the user's objection was that he could not see
 * why anybody would need it: _« je comprends pas pourquoi on en aurait besoin »_.
 *
 * He is right, and ADR `0056` had already answered it: **the market is on the agent's atom.** A
 * second market, one layer removed, asking about a third party's opinion rather than about the
 * agent, competed for the same attention and the same wallet. Measured on mainnet, Deep3 holds
 * 99.99% of these edges, so in practice it was one market about one company's opinion.
 *
 * The **display stays**, because who vouches for an agent is real information and it is read for
 * free. What is gone is the invitation to price it. `MarketPanel` still shows the positions anyone
 * took while the control existed — removing the control does not unmake them.
 */
export function RatingRow({
    row,
    session,
}: {
    row: TrustRow;
    /** For the curve the market figures are read at. No longer for a deposit — see above. */
    session: StakeSession | undefined;
}) {
    const {address} = useAccount();
    const vaultsQuery = useClaimVaults({
        tripleId: row.tripleId,
        curveId: session?.curveId ?? null,
        account: address ?? null,
    });

    const isMismatch = row.rating?.signature.status === "mismatch";

    return (
        <article
            className={`pl-5 border-l ${
                isMismatch
                    ? "border-l-2 border-l-[color:var(--color-alarm)]"
                    : "border-l-[color:var(--color-rule-strong)]"
            }`}
        >
            <header className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
                <h3 className="text-[length:var(--text-body)] font-medium">{row.providerName}</h3>
                {row.providerUrl !== null ? (
                    <a
                        href={row.providerUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="font-mono text-[length:var(--text-body-sm)] text-[color:var(--color-steel)] break-all"
                    >
                        {row.providerUrl} ↗
                    </a>
                ) : null}
            </header>

            <div className="mt-5 grid lg:grid-cols-[minmax(0,15rem)_minmax(0,1fr)] gap-x-10 gap-y-6">
                <div>
                    {row.score !== null ? (
                        <>
                            <p
                                className={`score-numeral ${SCORE_SIZE_CLASS[row.weight]} ${SCORE_TONE_CLASS[row.weight]}`}
                            >
                                {row.score}
                            </p>
                            <p className="mt-2 font-mono uppercase tracking-wider text-[length:var(--text-label)] text-[color:var(--color-steel)]">
                                score{row.scoreScale !== null ? ` · ${row.scoreScale}` : ""}
                                {row.riskLevel !== null ? ` · risk ${row.riskLevel}` : ""}
                            </p>
                        </>
                    ) : (
                        <p className="text-[length:var(--text-body-sm)] text-[color:var(--color-steel)] max-w-[40ch]">
                            No score in this document.
                        </p>
                    )}
                    <EvidenceRail basis={row.reviewers} weight={row.weight} />
                </div>

                <div className="flex flex-col gap-5">
                    {row.rating === null ? (
                        <p className="text-[length:var(--text-body-sm)] text-[color:var(--color-steel)] max-w-[60ch]">
                            No <span className="font-mono">has trust assessment</span> edge, so
                            there is no document to check.
                        </p>
                    ) : (
                        <>
                            {row.documentError !== null ? (
                                <p className="text-[length:var(--text-body-sm)] max-w-[60ch]">
                                    {describeFetchError(row.documentError)}
                                </p>
                            ) : null}
                            <SignatureLine verdict={row.rating.signature} />
                            <FreshnessLine verdict={row.rating.freshness} />
                            {row.dimensions.length > 0 ? (
                                <div>
                                    <p className="font-mono uppercase tracking-wider text-[length:var(--text-label)] text-[color:var(--color-steel)]">
                                        Dimensions
                                    </p>
                                    <dl className="mt-2 grid grid-cols-[1fr_auto] gap-x-6 text-[length:var(--text-body-sm)] max-w-[24rem]">
                                        {row.dimensions.map((dimension) => (
                                            <div key={dimension.name} className="contents">
                                                <dt className="text-[color:var(--color-steel)] truncate">
                                                    {dimension.name}
                                                </dt>
                                                <dd className="font-mono tabular-nums text-right">
                                                    {dimension.value}
                                                </dd>
                                            </div>
                                        ))}
                                    </dl>
                                </div>
                            ) : null}
                            {row.documentUrl !== null ? (
                                <p className="text-[length:var(--text-body-sm)]">
                                    <a
                                        href={row.documentUrl}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="font-mono text-[color:var(--color-accent)] break-all"
                                    >
                                        raw document ↗
                                    </a>
                                </p>
                            ) : null}
                        </>
                    )}
                </div>
            </div>

            <div className="mt-6">
                <MarketPanel
                    row={row}
                    vaults={vaultsQuery.data}
                    isLoading={vaultsQuery.isLoading}
                    error={vaultsQuery.error}
                />
            </div>
        </article>
    );
}
