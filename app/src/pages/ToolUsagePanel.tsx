import {useParams} from "react-router-dom";

import {useToolUsage, isToolAtomId} from "../hooks/use-tool-usage";
import {formatTrust} from "../services/trust-format";
import {type ToolUsageView} from "../services/tool-usage-view";
import {DeclaredUses} from "../components/usage/DeclaredUses";
import {useChainChoice} from "../lib/chain-choice";

/**
 * An atom and what declares using it (`/tool/atom/:atomId`).
 *
 * The half of `docs/12` that did not exist. The trust panel makes one provider's opinion of one
 * agent checkable; this makes a subject's standing legible, and legible specifically as **who paid
 * what to say so**.
 *
 * **The route's name is a leftover and the page is not tool-specific.** `getToolUsage` takes an
 * atom, so for a tool's atom the edges are "which agents used this tool" and for an agent's atom
 * they are "which agents used this agent" — the same read either way. The edge list lives in
 * `DeclaredUses` and the trust panel renders it as a section of the agent, which is where a reader
 * looking at an agent expects it (user, 2026-10-27). What is left here is the **aside**: the atom
 * itself, what is pinned to it, and the summed market.
 *
 * It replaced `/tool/:id`, which was keyed on a `ModuleRegistry` id and read the atom's own vault;
 * `ModuleRegistry` is not going to mainnet (ADR `0025`) and is retired (ADR `0051`).
 */
export function ToolUsagePanel() {
    const {atomId} = useParams();
    const valid = isToolAtomId(atomId);
    const query = useToolUsage(valid ? atomId : null);

    if (!valid) {
        return (
            <section>
                <h1 className="text-[length:var(--text-display)] leading-[var(--leading-display)] tracking-tight font-semibold">
                    Not an atom id
                </h1>
                <p className="mt-4 max-w-[60ch] text-[color:var(--color-steel)]">
                    An atom is addressed by its Intuition id — 0x followed by 32 bytes. Got{" "}
                    <span className="font-mono">{atomId ?? "nothing"}</span>.
                </p>
            </section>
        );
    }

    return (
        <section className="mt-10 grid gap-x-12 gap-y-10 md:grid-cols-[18rem_1fr] md:items-start">
            {/* The aside waits for the read; the edge list runs its own. Both call `useToolUsage`
                with the same key, so react-query serves one fetch to the two of them. */}
            <aside>
                {query.data === undefined ? (
                    <h1 className="text-[length:var(--text-display)] leading-[var(--leading-display)] tracking-tight font-semibold text-[color:var(--color-steel)]">
                        Atom
                    </h1>
                ) : (
                    <Identity view={query.data} />
                )}
            </aside>

            <div className="min-w-0">
                <DeclaredUses atomId={atomId} />
            </div>
        </section>
    );
}

function Identity({view}: {view: ToolUsageView}) {
    const chain = useChainChoice();
    return (
        <>
            <h1 className="text-[length:var(--text-display)] leading-[var(--leading-display)] tracking-tight font-semibold break-words">
                {view.label ?? "Unnamed atom"}
            </h1>
            <dl className="mt-6 border-t border-[color:var(--color-rule)] pt-4 text-[length:var(--text-body-sm)]">
                <dt className="text-[color:var(--color-steel)] text-[length:var(--text-label)] uppercase tracking-wider">
                    Atom
                </dt>
                <dd className="mt-1 font-mono break-all">{view.toolAtomId}</dd>
                {view.pinnedUri === null ? null : (
                    <>
                        <dt className="mt-4 text-[color:var(--color-steel)] text-[length:var(--text-label)] uppercase tracking-wider">
                            Pinned at
                        </dt>
                        <dd className="mt-1 font-mono break-all">{view.pinnedUri}</dd>
                    </>
                )}
                <dt className="mt-4 text-[color:var(--color-steel)] text-[length:var(--text-label)] uppercase tracking-wider">
                    Declared uses
                </dt>
                <dd className="mt-1 font-mono tabular-nums">{view.edges.length}</dd>
            </dl>

            {/* Gated on the POSITION count, not on `isEmpty`. `scripts/measure/tool-page-states.ts`
                counts which state every tool atom would render: on mainnet 2026-10-19, 64 of 84
                render the sidebar and **20 have it gated** — 19 entirely free plus the one
                off-curve atom — because every edge carries creation dust (ADR 0042). Rendering
                it for those printed "Staked for <0.00000001 across 0 positions" beside the
                banner saying nobody has staked anything: two statements on one screen that
                cannot both be true. */}
            {view.totals.supportPositions > 0 || view.totals.opposePositions > 0 ? (
                <Totals view={view} />
            ) : null}

            <a
                href={`${chain.explorerUrl}/address/${view.toolAtomId}`}
                target="_blank"
                rel="noreferrer"
                className="mt-6 inline-block text-[length:var(--text-body-sm)] text-[color:var(--color-accent)]"
            >
                Explorer →
            </a>
        </>
    );
}

/**
 * The summed market, and never the sum alone.
 *
 * `ToolUsage.totals` carries the position counts for exactly this reason: summing assets across
 * edges without them turns a handful of convictions into something that reads like liquidity.
 *
 * **Not `StakerCount` here, and that is the trap ADR `0023` predicted in writing.** Its accessible
 * name is "N distinct stakers", which is true of a `MarketSide` scoped to one vault — ADR `0023`
 * says so outright — and **false of a sum across edges**, where one account backing two tools is
 * counted twice. The rows in `DeclaredUses` use `StakerCount` because each is a single vault; this
 * says "positions" because that is all a sum can claim.
 */
function Totals({view}: {view: ToolUsageView}) {
    const chain = useChainChoice();
    return (
        <dl className="mt-6 border-t border-[color:var(--color-rule)] pt-4 text-[length:var(--text-body-sm)]">
            {view.totals.supportPositions > 0 ? (
                <>
                    <dt className="text-[color:var(--color-steel)] text-[length:var(--text-label)] uppercase tracking-wider">
                        Staked for
                    </dt>
                    <dd className="mt-1 font-mono tabular-nums">
                        {formatTrust(view.totals.supportAssets)} {chain.symbol}{" "}
                        <span className="text-[color:var(--color-steel)]">
                            across {view.totals.supportPositions}{" "}
                            {view.totals.supportPositions === 1 ? "position" : "positions"}
                        </span>
                    </dd>
                    <dd className="mt-1 max-w-[30ch] font-sans text-[length:var(--text-label)] text-[color:var(--color-steel)]">
                        Amounts cover every curve; the counts cover one.
                    </dd>
                </>
            ) : null}
            {view.totals.opposePositions > 0 ? (
                <>
                    <dt className="mt-4 text-[color:var(--color-steel)] text-[length:var(--text-label)] uppercase tracking-wider">
                        Staked against
                    </dt>
                    <dd className="mt-1 font-mono tabular-nums">
                        {formatTrust(view.totals.opposeAssets)} {chain.symbol}{" "}
                        <span className="text-[color:var(--color-steel)]">
                            across {view.totals.opposePositions}{" "}
                            {view.totals.opposePositions === 1 ? "position" : "positions"}
                        </span>
                    </dd>
                </>
            ) : null}
        </dl>
    );
}
