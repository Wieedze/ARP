import {useId} from "react";
import {useChainChoice} from "../../lib/chain-choice";
import type {Hex} from "viem";
import {useAccount} from "wagmi";

import {useStakeSession} from "../../hooks/use-stake-session";
import {useTermShape} from "../../hooks/use-term-shape";
import {useTermBackers} from "../../hooks/use-term-backers";
import {useTermValue} from "../../hooks/use-term-value";
import {useTermVault} from "../../hooks/use-term-vault";
import {curveLabelOf} from "../../services/tool-catalog";
import {formatTrust, truncateMiddle} from "../../services/trust-format";
import {Link} from "react-router-dom";

import {linkClass} from "../../lib/control-class";
import {Sparkline} from "../Sparkline";
import {TermShapePanel} from "../tool/TermShapePanel";
import {StakeControl} from "../agent/StakeControl";
import {WithdrawControl} from "../agent/WithdrawControl";

/**
 * The market on an atom: what is deposited on it, and both directions out of it.
 *
 * **It was `AgentBacking`, in `components/agent/`, and the name was the only thing agent-specific
 * about it.** Everything here took `atomTermId` and worked on any atom, so a tool, a tag or a
 * protocol had a vault and no way to reach it. ADR `0056`'s own trigger quote is _« juste une
 * bourse d'agents **et d'outils** »_ — the "et d'outils" half was never wired, and renaming was
 * most of the work. The agent panel renders it unchanged.
 *
 * **A tool atom needs no new authorisation and a `uses` edge does.** This path already deposits on
 * an agent's identity atom on mainnet under ADR `0056`, which allowed what ADR `0046` §2 had
 * forbidden; the ADR is about the *shape* of the target, not the chain, and a tool's atom is the
 * same shape. Creating a `(agent, uses, tool)` triple is a different act and is gated separately
 * (`services/declare-use.ts`).
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
export function AtomMarket({
    atomTermId,
    name,
    nameIsId,
    backHeading = "Support this agent",
    heading = "Support",
}: {
    atomTermId: Hex;
    name: string;
    /** True when `name` is an id, so the confirmation sets it in mono. */
    nameIsId: boolean;
    /**
     * The deposit control's own heading. The only string here that was ever agent-specific.
     *
     * Defaulted to the agent wording so the panel that has rendered it for weeks is untouched by
     * the generalisation — a rename should not change a word on an existing screen.
     */
    backHeading?: string;
    /**
     * The section's own heading, or `null` for none.
     *
     * `null` where a disclosure already names the section: nested under one, this rendered
     * "Back this atom, or withdraw" → "Backing" → "Back this atom", three headings for one thing.
     * The section keeps an accessible name either way — `aria-label` stands in for the `h2`.
     */
    heading?: string | null;
}) {
    const {address} = useAccount();
    const chain = useChainChoice();
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

    const backersQuery = useTermBackers(
        session === undefined ? null : atomTermId,
        session?.curveId,
    );
    const valueQuery = useTermValue(session === undefined ? null : atomTermId, session?.curveId);
    const vault = vaultQuery.data;
    const positionCount = shapeQuery.data?.shape.positionCount ?? null;
    const headingId = useId();

    return (
        <section
            {...(heading === null
                ? {"aria-label": `Support for ${name}`}
                : {"aria-labelledby": headingId})}
        >
            {/* `h2`, not `h3`. The panel's `h1` is the agent's name and the next heading in DOM
                order used to be the sr-only `h2` that exists to stop the outline jumping — putting
                this section above it at `h3` reintroduced exactly that jump. The two controls take
                their level as a prop for the same reason. */}
            {heading === null ? null : (
                <h2 id={headingId} className="font-medium">
                    {heading}
                </h2>
            )}

            <dl className="flex flex-wrap gap-x-10 gap-y-3 text-[length:var(--text-body-sm)]">
                <div>
                    <dt className="font-mono uppercase tracking-wider text-[length:var(--text-label)] text-[color:var(--color-steel)]">
                        Deposited
                    </dt>
                    <dd className="mt-1 font-mono tabular-nums">
                        {vault === undefined
                            ? "—"
                            : `${formatTrust(vault.totalAssets)} ${chain.symbol}`}
                    </dd>
                </div>
                <div>
                    <dt className="font-mono uppercase tracking-wider text-[length:var(--text-label)] text-[color:var(--color-steel)]">
                        Support
                    </dt>
                    <dd className="mt-1 font-mono tabular-nums">
                        {positionCount === null ? "—" : positionCount}
                    </dd>
                </div>
                <div>
                    <dt className="font-mono uppercase tracking-wider text-[length:var(--text-label)] text-[color:var(--color-steel)]">
                        Yours
                    </dt>
                    <dd className="mt-1 font-mono tabular-nums">
                        {vault === undefined || vault.shares === null ? (
                            "—"
                        ) : (
                            <>
                                {formatTrust(vault.shares)}{" "}
                                <span className="font-sans text-[color:var(--color-steel)]">
                                    shares
                                </span>
                            </>
                        )}
                    </dd>
                </div>
                <div>
                    <dt className="font-mono uppercase tracking-wider text-[length:var(--text-label)] text-[color:var(--color-steel)]">
                        Vault
                    </dt>
                    <dd className="mt-1 font-mono">{truncateMiddle(atomTermId, 10, 6)}</dd>
                </div>
            </dl>

            {/* The value line, and the number it ends at.
                Reconstructed from the vault's signals — `deposit_id` set means TRUST entered,
                `redemption_id` means it left — so it **falls when somebody exits**. That is the
                distinction ADR `0046` §3 draws and the reason this is not `getTermActivity`'s
                volume, which is absolute and would draw an exit as an arrival.

                Verified to reconcile rather than assumed: on testnet, six signals on
                `Trail of Bits — secure-workflow-guide` sum to 0.00588000 against the vault's own
                `total_assets` of 0.00588000. Exact.

                Absent below two points, where a line says less than the figure above it. */}
            {(valueQuery.data?.length ?? 0) < 2 ? null : (
                <div className="mt-6">
                    <Sparkline
                        height={120}
                        points={(valueQuery.data ?? []).map((point) => ({
                            label: point.at.slice(0, 10),
                            value: point.value,
                        }))}
                        describe={(value) => `${formatTrust(value)} ${chain.symbol}`}
                    />
                </div>
            )}

            {/* **Who holds it**, which `TermShapePanel` answers only in aggregate. The user asked
                for the list and for it to be clickable, so each row leads somewhere real: the
                account's own atom when the graph has one — keeping the reader in the app and the
                graph walkable both ways — and the block explorer otherwise, where a 20-byte address
                does resolve (unlike a 32-byte term id, which is `tasks/28` item 38).

                The length is **not** the count: the indexer caps `positions` at 100 rows, where
                `atoms` and `triples` cap at 250. `Positions` in the shape panel below comes from an
                aggregate and is the exact figure. */}
            {(backersQuery.data?.length ?? 0) === 0 ? null : (
                <div className="mt-8">
                    <h3 className="text-[length:var(--text-label)] uppercase tracking-wider text-[color:var(--color-steel)]">
                        Support
                    </h3>
                    <ul className="mt-3">
                        {(backersQuery.data ?? []).map((backer) => (
                            <li
                                key={backer.account}
                                className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b border-[color:var(--color-rule)] py-2 text-[length:var(--text-body-sm)]"
                            >
                                {backer.atomId === null ? (
                                    <a
                                        href={`${chain.explorerUrl}/address/${backer.account}`}
                                        target="_blank"
                                        rel="noreferrer"
                                        className={`font-mono ${linkClass}`}
                                    >
                                        {backer.label ?? truncateMiddle(backer.account, 10, 6)}
                                    </a>
                                ) : (
                                    <Link
                                        to={`/atom/${backer.atomId}`}
                                        className={`font-mono ${linkClass}`}
                                    >
                                        {backer.label ?? truncateMiddle(backer.account, 10, 6)}
                                    </Link>
                                )}
                                <span className="flex items-baseline gap-4 font-mono tabular-nums">
                                    {/* What it took to open and hold, not what it would fetch
                                        today — the second needs the curve and is the shape
                                        panel's question. `redeemed` is shown only when it is
                                        non-zero, because "took nothing back" is the ordinary
                                        case and a zero beside every row says nothing. */}
                                    <span>
                                        {formatTrust(backer.deposited)} {chain.symbol}
                                    </span>
                                    {backer.redeemed === 0n ? null : (
                                        <span className="text-[color:var(--color-steel)]">
                                            −{formatTrust(backer.redeemed)}
                                        </span>
                                    )}
                                </span>
                            </li>
                        ))}
                    </ul>
                </div>
            )}

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
                        heading: backHeading,
                        subject: name,
                        subjectIsId: nameIsId,
                        market: {
                            support: {positionCount},
                            // No opposition vault exists for an atom. `null` says that; a zero
                            // would say one exists and is empty.
                            opposition: null,
                        },
                    }}
                    session={session}
                    sessionError={sessionError}
                    // **The level follows the section, not the component.** With `heading` set
                    // there is an `h2` above these and `h3` is right; with it `null` — how
                    // `/atom/:atomId` renders it, the card standing alone — `h3` would skip a
                    // level from the page's `h1`. The same mechanism the agent page's sibling
                    // documents, and the third time it has bitten on this surface.
                    headingLevel={heading === null ? "h2" : "h3"}
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
                    headingLevel={heading === null ? "h2" : "h3"}
                    onSettled={() => {
                        void vaultQuery.refetch();
                        void shapeQuery.refetch();
                    }}
                />
            </div>
        </section>
    );
}
