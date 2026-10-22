import {useState} from "react";
import {Link} from "react-router-dom";
import {useAccount} from "wagmi";

import {MainnetNotice} from "../components/agent/MainnetNotice";
import {Sparkline} from "../components/Sparkline";
import {CurveControl} from "../components/tool/ToolCatalogControls";
import {useProfile} from "../hooks/use-profile";
import {linkClass} from "../lib/control-class";
import type {ProfileView} from "../services/account-profile";
import {formatTrust, truncateMiddle} from "../services/trust-format";

/**
 * Your own page (`/me`).
 *
 * What the chain says you did, and **no score**. ARP composes none (ADR `0046`), and an account page
 * is the most tempting place to invent one — "your reputation: 72" would be a number ARP made up
 * about a person, which is the whole thing this protocol exists not to do.
 *
 * Two readings kept apart, because they are two different acts (ADR `0039`): a deposit on an **atom**
 * prices the tool, a deposit on a **triple** backs somebody's claim about it. "Your positions" as one
 * number would cover two unrelated statements.
 *
 * The figure that leads is **net** — deposited minus redeemed — because that is what you are still
 * standing behind. A page leading with "deposited" would flatter anyone who has since withdrawn.
 */
export function Profile() {
    const {address, isConnected} = useAccount();
    const [curveId, setCurveId] = useState(1);
    const query = useProfile(address, curveId);

    return (
        <section>
            <MainnetNotice />

            <header className="mt-8 mb-10 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-3">
                <div>
                    {/* Not `--text-display`: the net figure below uses it, and two elements at the
                        page's largest size means neither leads. `docs/05` reserves the display size
                        for one hero moment, and on this page that is the money. */}
                    <h1 className="text-[length:var(--text-body)] font-semibold tracking-tight">
                        Your positions
                    </h1>
                    <p className="mt-2 max-w-[64ch] text-[color:var(--color-steel)]">
                        {isConnected ? (
                            <>
                                <span className="font-mono">{truncateMiddle(address ?? "")}</span>
                            </>
                        ) : (
                            "Connect a wallet to see what you hold."
                        )}
                    </p>
                </div>
                {isConnected ? <CurveControl curveId={curveId} onChange={setCurveId} /> : null}
            </header>

            {!isConnected ? null : query.isPending ? (
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
                <Positions view={query.data} />
            )}
        </section>
    );
}

function Positions({view}: {view: ProfileView}) {
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
                    <Link to="/register" className={linkClass}>
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
                <p className="mt-1 font-mono text-[length:var(--text-display)] leading-[var(--leading-display)] tabular-nums">
                    {view.netTrust}
                    <span className="text-[length:var(--text-body)] text-[color:var(--color-steel)]">
                        {" "}
                        TRUST
                    </span>
                </p>

                {view.curve.length < 2 ? null : (
                    <div className="mt-6">
                        <Sparkline
                            points={view.curve}
                            // `formatTrust`, so the accessible summary does not read
                            // "0.12345678901234568 TRUST" and so both sparklines format alike.
                            describe={(value) => `${formatTrust(value)} TRUST`}
                        />
                    </div>
                )}

                {view.curveTruncated ? (
                    // The curve starts from a real opening balance rather than from zero, and that
                    // is only visible if it is said: the alternative was a line that looked like
                    // the account began at its hundredth-last deposit.
                    <p className="mt-3 max-w-[60ch] text-[length:var(--text-label)] text-[color:var(--color-steel)]">
                        Recent deposits only, starting from{" "}
                        <span className="font-mono">{view.openingTrust} TRUST</span> already held.
                    </p>
                ) : null}
            </div>

            <dl className="grid grid-cols-[1fr_auto] gap-y-3 gap-x-6 self-start text-[length:var(--text-body-sm)] lg:border-l lg:border-[color:var(--color-rule)] lg:pl-8">
                <Row label="Terms you hold" value={view.termsHeld.toLocaleString("en-US")} />
                <Row label="Deposited" value={`${view.depositedTrust} TRUST`} />
                {/* Absent rather than zero: "redeemed 0" reads as a fact about your behaviour that
                    a first deposit has not had time to be. */}
                {view.hasRedeemed ? (
                    <Row label="Redeemed" value={`${view.redeemedTrust} TRUST`} />
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
