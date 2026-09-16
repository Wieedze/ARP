import {useAccount} from "wagmi";

import {useClaimVaults} from "../../hooks/use-claim-vaults";
import type {TrustRow} from "../../services/agent-trust";
import {describeFetchError} from "../../services/trust-format";
import type {StakeSession} from "../../services/trust-stake";

import {EvidenceRail} from "./EvidenceRail";
import {MarketPanel} from "./MarketPanel";
import {SCORE_SIZE_CLASS, SCORE_TONE_CLASS} from "./evidence-scale";
import {StakeControl} from "./StakeControl";
import {FreshnessLine, SignatureLine} from "./VerdictLines";

/**
 * One provider's assessment of this agent, with the market on the claim that
 * the provider is worth listening to.
 *
 * Score and reviewer count are given the same footing, which is the panel's
 * whole argument: the number is set at the size its evidence earns, and the
 * rail underneath it shows that evidence before the reader has parsed a digit.
 */
export function AssessmentRow({
    row,
    session,
    sessionError,
}: {
    row: TrustRow;
    session: StakeSession | undefined;
    sessionError: Error | null;
}) {
    const {address} = useAccount();
    const vaultsQuery = useClaimVaults({
        tripleId: row.tripleId,
        curveId: session?.curveId ?? null,
        account: address ?? null,
    });

    const isMismatch = row.assessment?.signature.status === "mismatch";

    return (
        <article
            className={`pl-5 border-l ${
                isMismatch
                    ? "border-l-2 border-l-[color:var(--color-alarm)]"
                    : "border-l-[color:var(--color-border-strong)]"
            }`}
        >
            <header className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
                <h3 className="text-[length:var(--text-body)] font-medium">{row.providerName}</h3>
                {row.providerUrl !== null ? (
                    <a
                        href={row.providerUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="font-mono text-[length:var(--text-body-sm)] text-[color:var(--color-fg-60)] break-all"
                    >
                        {row.providerUrl} ↗
                    </a>
                ) : null}
            </header>

            {row.providerMatch === "label-prefix" ? (
                <p className="mt-2 text-[length:var(--text-body-sm)] text-[color:var(--color-fg-60)] max-w-[60ch]">
                    Document matched to this provider by the assessment atom's label, because the
                    document itself could not be read. A naming convention, not a proof.
                </p>
            ) : null}

            <div className="mt-5 grid lg:grid-cols-[minmax(0,15rem)_minmax(0,1fr)] gap-x-10 gap-y-6">
                <div>
                    {row.score !== null ? (
                        <>
                            <p
                                className={`score-numeral ${SCORE_SIZE_CLASS[row.weight]} ${SCORE_TONE_CLASS[row.weight]}`}
                            >
                                {row.score}
                            </p>
                            <p className="mt-2 font-mono uppercase tracking-wider text-[length:var(--text-label)] text-[color:var(--color-fg-60)]">
                                score{row.scoreScale !== null ? ` · ${row.scoreScale}` : ""}
                                {row.riskLevel !== null ? ` · risk ${row.riskLevel}` : ""}
                            </p>
                        </>
                    ) : (
                        <p className="text-[length:var(--text-body-sm)] text-[color:var(--color-fg-60)] max-w-[40ch]">
                            No score in this document.
                        </p>
                    )}
                    <EvidenceRail basis={row.reviewers} weight={row.weight} />
                </div>

                <div className="flex flex-col gap-5">
                    {row.assessment === null ? (
                        <p className="text-[length:var(--text-body-sm)] text-[color:var(--color-fg-60)] max-w-[60ch]">
                            This provider is declared in the graph but publishes no{" "}
                            <span className="font-mono">has trust assessment</span> edge, so there
                            is no document to check. The market below is still live.
                        </p>
                    ) : (
                        <>
                            {row.documentError !== null ? (
                                <p className="text-[length:var(--text-body-sm)] max-w-[60ch]">
                                    {describeFetchError(row.documentError)} Everything below the
                                    provider's own document is missing for that reason — the row is
                                    not broken, the source is unreachable.
                                </p>
                            ) : null}
                            <SignatureLine verdict={row.assessment.signature} />
                            <FreshnessLine verdict={row.assessment.freshness} />
                            {row.dimensions.length > 0 ? (
                                <div>
                                    <p className="font-mono uppercase tracking-wider text-[length:var(--text-label)] text-[color:var(--color-fg-60)]">
                                        Dimensions
                                    </p>
                                    <dl className="mt-2 grid grid-cols-[1fr_auto] gap-x-6 text-[length:var(--text-body-sm)] max-w-[24rem]">
                                        {row.dimensions.map((dimension) => (
                                            <div key={dimension.name} className="contents">
                                                <dt className="text-[color:var(--color-fg-60)] truncate">
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

            <StakeControl
                row={row}
                session={session}
                sessionError={sessionError}
                onSettled={() => {
                    void vaultsQuery.refetch();
                }}
            />
        </article>
    );
}
