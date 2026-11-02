import {useState} from "react";
import {Link} from "react-router-dom";
import {useAccount} from "wagmi";

import {useProfile} from "../../hooks/use-profile";
import {useChainChoice} from "../../lib/chain-choice";
import {linkClass} from "../../lib/control-class";
import type {ProfileView} from "../../services/account-profile";
import {formatTrust} from "../../services/trust-format";
import {Sparkline} from "../Sparkline";
import {CurveControl} from "../tool/ToolCatalogControls";

/**
 * The connected wallet's positions, on `/activity`. They were `/profile` ("Your positions"), which
 * the user removed (2026-10-30, `docs/tasks/35` §0): what an operator holds is something that
 * happened, so it sits with the rest of what happened, and `/account` keeps only what was
 * authorised.
 *
 * What the chain says you did, and **no score**. ARP composes none (ADR `0046`).
 *
 * Two readings kept apart, because they are two different acts (ADR `0039`): a deposit on an **atom**
 * prices the tool, a deposit on a **triple** backs somebody's claim about it.
 *
 * The figure that leads is **net**, deposited minus redeemed, because that is what you are still
 * standing behind. Leading with "deposited" would flatter anyone who has since withdrawn.
 */
const LABEL = "font-mono text-[10px] uppercase tracking-[0.06em] text-[color:var(--color-steel)]";

export function Positions() {
    const {address, isConnected} = useAccount();
    const [curveId, setCurveId] = useState(1);
    const query = useProfile(address, curveId);

    return (
        <div className="mb-14">
            <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-3">
                <h2 className={LABEL} id="activity-positions">
                    Positions
                </h2>
                {isConnected ? <CurveControl curveId={curveId} onChange={setCurveId} /> : null}
            </div>
            {!isConnected ? (
                <p className="border-t border-[color:var(--color-rule)] py-3 font-mono text-[length:var(--text-body-sm)] text-[color:var(--color-steel)]">
                    Connect a wallet to see what it holds.
                </p>
            ) : query.isPending ? (
                <p aria-live="polite" aria-busy className="text-[color:var(--color-steel)]">
                    Reading your positions…
                </p>
            ) : query.isError ? (
                <div aria-live="polite">
                    <p className="font-medium">The read failed</p>
                    <p className="mt-2 max-w-[60ch] text-[length:var(--text-body-sm)] text-[color:var(--color-steel)]">
                        {query.error instanceof Error ? query.error.message : String(query.error)}
                    </p>
                </div>
            ) : (
                <PositionsView view={query.data} />
            )}
        </div>
    );
}

function PositionsView({view}: {view: ProfileView}) {
    const chain = useChainChoice();
    if (view.termsHeld === 0 && view.curve.length === 0) {
        return (
            <div className="max-w-[60ch]">
                <p className="font-mono text-[length:var(--text-body-sm)] text-[color:var(--color-steel)]">
                    nothing held on this curve
                </p>
                {/* Says what would fill it, per `rules/ui.md`. The two links below are the two
                    ways in, so the sentence does not need to name them a second time. */}
                <p className="mt-3 text-[length:var(--text-body-sm)] text-[color:var(--color-steel)]">
                    A position appears when you back a tool or an agent.
                </p>
                <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2">
                    <Link to="/register?what=tool" className={linkClass}>
                        Register a tool →
                    </Link>
                    <Link to="/tools" className={linkClass}>
                        Find a claim to back →
                    </Link>
                </div>
            </div>
        );
    }

    return (
        /* `rules/ui.md` says "metadata on the left, content on the right" and this is the other way
           round, deliberately: the lead figure is the content, and it has to come first in reading
           order *and* first in the DOM for a screen reader. Putting the metadata column first would
           make a keyboard or screen-reader user traverse five secondary numbers before reaching the
           one the page is about. `workflow.md` allows a rule to be broken with cause as long as the
           break is recorded, so it is recorded here. */
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_20rem] gap-x-12 gap-y-10">
            <div className="min-w-0">
                {/* The label changes rather than the number being hidden: redeeming an appreciated
                    position returns more than went in, so a negative net is a real state and
                    "Still committed: -0.5 TRUST" is not a sentence. */}
                <p className="text-[length:var(--text-label)] uppercase tracking-wider text-[color:var(--color-steel)]">
                    {view.isNetNegative ? "Taken out, net of deposits" : "Still committed"}
                </p>
                <p className="mt-1 font-mono text-[length:var(--text-title)] leading-[var(--leading-title)] tabular-nums">
                    {view.netTrust}
                    <span className="text-[length:var(--text-body)] text-[color:var(--color-steel)]">
                        {" "}
                        {chain.symbol}
                    </span>
                </p>

                {view.curve.length < 2 ? null : (
                    <div className="mt-6">
                        <Sparkline
                            points={view.curve}
                            // `formatTrust`, so the accessible summary does not read
                            // "0.12345678901234568" at full precision, and so both sparklines format alike.
                            describe={(value) => `${formatTrust(value)} ${chain.symbol}`}
                        />
                    </div>
                )}

                {view.curveTruncated ? (
                    // The curve starts from a real opening balance rather than from zero, and that
                    // is only visible if it is said: the alternative was a line that looked like
                    // the account began at its hundredth-last deposit.
                    <p className="mt-3 max-w-[60ch] text-[length:var(--text-label)] text-[color:var(--color-steel)]">
                        Recent deposits only, starting from{" "}
                        <span className="font-mono">
                            {view.openingTrust} {chain.symbol}
                        </span>{" "}
                        already held.
                    </p>
                ) : null}
            </div>

            <dl className="grid grid-cols-[1fr_auto] gap-y-3 gap-x-6 self-start text-[length:var(--text-body-sm)] lg:border-l lg:border-[color:var(--color-rule)] lg:pl-8">
                <Row label="Terms you hold" value={view.termsHeld.toLocaleString("en-US")} />
                <Row label="Deposited" value={`${view.depositedTrust} ${chain.symbol}`} />
                {/* Absent rather than zero: "redeemed 0" reads as a fact about your behaviour that
                    a first deposit has not had time to be. */}
                {view.hasRedeemed ? (
                    <Row label="Redeemed" value={`${view.redeemedTrust} ${chain.symbol}`} />
                ) : null}
                <Row
                    label="Tools you priced"
                    value={view.toolsPriced.toLocaleString("en-US")}
                    note="deposits on a tool's own vault"
                />
                <Row
                    label="Claims you backed"
                    value={view.claimsBacked.toLocaleString("en-US")}
                    note="deposits on an agent's declaration"
                />
            </dl>
        </div>
    );
}

function Row({label, value, note}: {label: string; value: string; note?: string}) {
    return (
        <>
            <dt className="text-[color:var(--color-steel)]">
                {label}
                {note === undefined ? null : (
                    <span className="block text-[length:var(--text-label)]">{note}</span>
                )}
            </dt>
            <dd className="font-mono tabular-nums text-right">{value}</dd>
        </>
    );
}
