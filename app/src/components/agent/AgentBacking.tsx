import type {Hex} from "viem";
import {useAccount} from "wagmi";

import {useStakeSession} from "../../hooks/use-stake-session";
import {useTermShape} from "../../hooks/use-term-shape";
import {useTermVault} from "../../hooks/use-term-vault";
import {curveLabelOf} from "../../services/tool-catalog";
import {formatTrust, truncateMiddle} from "../../services/trust-format";
import {TermShapePanel} from "../tool/TermShapePanel";
import {StakeControl} from "./StakeControl";
import {WithdrawControl} from "./WithdrawControl";

/**
 * The market on the agent itself: what is deposited on its atom, and both directions out of it.
 *
 * **A market, not a signal**, in the user's own words — _« soit on mise sur un agent soit on retire
 * notre mise »_. You buy in or you take your money back out, and the number on screen is the price
 * of doing so. That is why `WithdrawControl` is in here and not a later task: a deposit nobody can
 * withdraw is a donation, and a one-directional market is a collection box.
 *
 * Consequences of taking that literally, each of which this file obeys:
 *
 * - It is **not** reputation and no copy here may call it that. The atom carries no assertion, so
 *   nothing can contradict a deposit on it — ADR `0046` §2's reasoning, which this surface accepts
 *   rather than overturns. What changed is that the thing is named instead of forbidden.
 * - It is **not a payment to the agent**: the deposit stays the depositor's.
 * - It is **live, never cumulative**. What it holds now, which can fall because somebody left.
 *   ADR `0046` §3 — "50 TRUST staked since the beginning" is false if 40 were withdrawn, and with
 *   an exit on the page that stops being hypothetical.
 * - It is **never added** to the count of clients who declared using the agent. Two different
 *   facts, and a total erases both (`rules/claims.md` §2).
 *
 * Two reads, because they answer different questions and the page needs both. The chain's vault
 * gives what is in there right now and what the connected account holds of it; the indexer's shape
 * gives how many backers and over what span, which no `eth_call` can answer.
 */
export function AgentBacking({
    atomTermId,
    name,
    nameIsId,
}: {
    atomTermId: Hex;
    name: string;
    /** True when `name` is an id, so the confirmation sets it in mono. */
    nameIsId: boolean;
}) {
    const {address} = useAccount();
    const {data: session, error: sessionError} = useStakeSession();
    const vaultQuery = useTermVault({
        termId: atomTermId,
        curveId: session?.curveId ?? null,
        account: address ?? null,
    });
    /**
     * Nothing is read until the curve is known.
     *
     * Not defaulted to 1 while the session loads: it would re-key and silently redraw with
     * different numbers once the real `defaultCurveId` arrived, and a figure that changes under
     * the reader without its label changing is worse than one that arrives late.
     */
    const shapeQuery = useTermShape(
        session === undefined ? null : atomTermId,
        Number(session?.curveId ?? 1n),
    );

    const vault = vaultQuery.data;
    const positionCount = shapeQuery.data?.shape.positionCount ?? null;

    return (
        <section>
            <h3 className="font-medium">Backing</h3>

            <dl className="mt-4 flex flex-wrap gap-x-10 gap-y-3 text-[length:var(--text-body-sm)]">
                <div>
                    <dt className="font-mono uppercase tracking-wider text-[length:var(--text-label)] text-[color:var(--color-fg-60)]">
                        Deposited
                    </dt>
                    <dd className="mt-1 font-mono tabular-nums">
                        {vault === undefined ? "—" : `${formatTrust(vault.totalAssets)} TRUST`}
                    </dd>
                </div>
                <div>
                    <dt className="font-mono uppercase tracking-wider text-[length:var(--text-label)] text-[color:var(--color-fg-60)]">
                        Backers
                    </dt>
                    <dd className="mt-1 font-mono tabular-nums">
                        {positionCount === null ? "—" : positionCount}
                    </dd>
                </div>
                <div>
                    <dt className="font-mono uppercase tracking-wider text-[length:var(--text-label)] text-[color:var(--color-fg-60)]">
                        Yours
                    </dt>
                    <dd className="mt-1 font-mono tabular-nums">
                        {vault === undefined || vault.shares === null
                            ? "—"
                            : formatTrust(vault.shares)}
                    </dd>
                </div>
                <div>
                    <dt className="font-mono uppercase tracking-wider text-[length:var(--text-label)] text-[color:var(--color-fg-60)]">
                        Vault
                    </dt>
                    <dd className="mt-1 font-mono">{truncateMiddle(atomTermId, 10, 6)}</dd>
                </div>
            </dl>

            {shapeQuery.data === undefined ? null : (
                <div className="mt-8">
                    <TermShapePanel
                        shape={shapeQuery.data.shape}
                        curve={shapeQuery.data.curve}
                        curveLabel={curveLabelOf(shapeQuery.data.shape.curveId)}
                    />
                </div>
            )}

            <div className="mt-8">
                <StakeControl
                    claim={{
                        target: {kind: "atom", atomId: atomTermId},
                        heading: "Back this agent",
                        subject: name,
                        subjectIsId: nameIsId,
                        blurb: "A deposit on the agent's own atom. It has no other side, and it stays yours — a position you can redeem, not a payment to the agent.",
                        market: {
                            support: {positionCount},
                            // No opposition vault exists for an atom. `null` says that; a zero
                            // would say one exists and is empty.
                            opposition: null,
                        },
                    }}
                    session={session}
                    sessionError={sessionError}
                    onSettled={() => {
                        void vaultQuery.refetch();
                        void shapeQuery.refetch();
                    }}
                />

                {/* Absent until the account holds something here, so the two directions are not
                    symmetrical on screen: anyone can buy in, only a holder can get out. */}
                <WithdrawControl
                    termId={atomTermId}
                    curveId={session?.curveId}
                    heldShares={vault?.shares ?? null}
                    onSettled={() => {
                        void vaultQuery.refetch();
                        void shapeQuery.refetch();
                    }}
                />
            </div>
        </section>
    );
}
