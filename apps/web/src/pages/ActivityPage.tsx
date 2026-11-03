import {useMemo, useState} from "react";
import {Link, useSearchParams} from "react-router-dom";
import {useAccount} from "wagmi";
import type {Hex} from "viem";

import {Positions} from "../components/activity/Positions";
import {DisplayTabs} from "../components/brand/DisplayTabs";
import {Segmented} from "../components/tool/ToolCatalogControls";
import {useActivityTrace} from "../hooks/use-activity-trace";
import {useAgentActivity} from "../hooks/use-agent-activity";
import {useChainFacts, type ChainReads} from "../hooks/use-chain-facts";
import {useTermLabels} from "../hooks/use-term-labels";
import {useChainChoice} from "../lib/chain-choice";
import {amountOf, explorerTxUrl} from "../lib/chain-amounts";
import {parseToolLabel, primaryNameOf, sourceOf} from "../lib/tool-label";
import {
    timelineRows,
    type AgentFeed,
    type FeedStatus,
    type TimelineRow,
    type TracedInvocation,
} from "../services/agent-feed";
import {FACT_FILTERS, factsOfKind, isOwnFact, type ChainFact} from "../services/chain-facts-view";

const FEED: Record<FeedStatus, string> = {
    off: "No feed configured",
    connecting: "Connecting",
    live: "Live",
    offline: "Offline",
};

const short = (value: string) => `${value.slice(0, 10)}…`;

function clock(at: string): string {
    const d = new Date(at);
    if (Number.isNaN(d.getTime())) return "—";
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/** `30 Oct 13:17:27`, local: the chain list spans days, so the clock alone is not enough. */
function stamp(at: string): string {
    const d = new Date(at);
    if (Number.isNaN(d.getTime())) return "—";
    return `${d.toLocaleDateString("en-GB", {day: "2-digit", month: "short"})} ${clock(at)}`;
}

function Fact({label, children}: {label: string; children: React.ReactNode}) {
    return (
        <div className="flex min-w-[7.5rem] flex-col gap-1.5 px-5 py-3.5 [&+&]:border-l [&+&]:border-l-[color:var(--color-rule)]">
            <dt className="font-mono text-[length:var(--text-label)] uppercase tracking-[0.06em] text-[color:var(--color-steel)]">
                {label}
            </dt>
            <dd className="type-face text-[26px] leading-none tabular-nums">{children}</dd>
        </div>
    );
}

function TxLink({chainId, hash}: {chainId: number; hash: Hex | null}) {
    if (hash === null) return <span className="text-[color:var(--color-steel)]">dry run</span>;
    return (
        <a
            href={explorerTxUrl(chainId, hash)}
            target="_blank"
            rel="noreferrer"
            aria-label={`Transaction ${hash} on the explorer, opens in a new tab`}
            className="tabular-nums"
        >
            {short(hash)} <span aria-hidden="true">↗</span>
        </a>
    );
}

const LABEL =
    "font-mono text-[length:var(--text-label)] uppercase tracking-[0.06em] text-[color:var(--color-steel)]";
const CELL = "font-mono text-[length:var(--text-body-sm)] leading-[1.6]";
const TH = `${LABEL} pb-2 pr-4 text-left font-normal`;
const TD = `${CELL} border-t border-[color:var(--color-rule)] py-2 pr-4 align-top`;

function InvocationRow({row}: {row: TracedInvocation}) {
    return (
        <tr>
            <td className={`${TD} text-[color:var(--color-steel)] tabular-nums`}>
                {clock(row.lastAt)}
            </td>
            <td className={`${TD} uppercase text-[color:var(--color-steel)]`}>{row.kind}</td>
            <td className={`${TD} text-[color:var(--color-fg)]`}>{row.name}</td>
            <td className={`${TD} tabular-nums text-[color:var(--color-silver)]`}>
                {`×${row.calls}`}
                {row.failed > 0 ? ` · ${row.failed} failed` : ""}
            </td>
            <td className={`${TD} text-[color:var(--color-silver)]`}>
                {row.declaration === null ? (
                    <span className="text-[color:var(--color-steel)]">
                        {row.ref === null ? "not listed" : "—"}
                    </span>
                ) : (
                    <TxLink chainId={row.declaration.chainId} hash={row.declaration.hash} />
                )}
            </td>
            <td className={`${TD} text-[color:var(--color-silver)]`}>
                {row.stakes.length === 0 ? (
                    <span className="text-[color:var(--color-steel)]">—</span>
                ) : (
                    row.stakes.map((stake, index) => (
                        <span key={`${stake.hash ?? "dry"}-${index}`} className="block">
                            <span className="tabular-nums">
                                {amountOf(stake.value, stake.chainId)}
                            </span>{" "}
                            <TxLink chainId={stake.chainId} hash={stake.hash} />
                        </span>
                    ))
                )}
            </td>
        </tr>
    );
}

const VERB: Record<ChainFact["kind"], string> = {
    declared: "declared",
    deposit: "supported",
    redeem: "withdrew",
};

/** A timeline consequence, in the operator's words; the row's `label` stays the feed's own value. */
const CONSEQUENCE: Record<TimelineRow["consequences"][number]["label"], string> = {
    declared: "declared",
    staked: "supported",
};

/**
 * A tool as the rest of the app names it: the skill or `owner/repo`, with the repository under a
 * skill, and a link to its page. It printed the whole URL, `github.com/obra/superpowers?skill=…`,
 * and was not a link (task 48).
 */
function ToolName({label, atomId}: {label: string; atomId: string}) {
    const parsed = parseToolLabel(label);
    const source = sourceOf(parsed);
    // Banged: the unlayered `a { color; text-decoration }` in `index.css` beats an unbanged colour
    // or underline utility, which rendered these names silver with no hover mark.
    return (
        <Link
            to={`/atom/${atomId}`}
            className="block text-[color:var(--color-fg)]! hover:underline! underline-offset-4"
        >
            <span className="break-all">{primaryNameOf(parsed)}</span>
            {source === null ? null : (
                <span className="block text-[length:var(--text-label)] text-[color:var(--color-steel)]">
                    {source}
                </span>
            )}
        </Link>
    );
}

function ChainLine({fact, chainId}: {fact: ChainFact; chainId: number}) {
    return (
        <tr>
            <td className={`${TD} whitespace-nowrap text-[color:var(--color-steel)] tabular-nums`}>
                {stamp(fact.at)}
            </td>
            <td className={TD}>
                {/* Banged for the same reason as `ToolName`'s link. */}
                <Link
                    to={`/atom/${fact.agentAtomId}`}
                    className="text-[color:var(--color-fg)]! hover:underline! underline-offset-4"
                >
                    {fact.agent}
                </Link>
            </td>
            <td className={`${TD} text-[color:var(--color-silver)]`}>
                {VERB[fact.kind]}
                {fact.assets === null ? null : (
                    <span className="tabular-nums">{` ${amountOf(fact.assets, chainId)}`}</span>
                )}
                {fact.account === null ? null : (
                    <span className="block text-[color:var(--color-steel)]" title={fact.account}>
                        {`by ${fact.account.slice(0, 6)}…${fact.account.slice(-4)}`}
                    </span>
                )}
            </td>
            <td className={TD}>
                <ToolName label={fact.tool} atomId={fact.toolAtomId} />
            </td>
            <td className={`${TD} text-right`}>
                {fact.tx === null ? null : <TxLink chainId={chainId} hash={fact.tx} />}
            </td>
        </tr>
    );
}

function TimelineLine({row}: {row: TimelineRow}) {
    return (
        <tr>
            <td className={`${TD} text-[color:var(--color-steel)] tabular-nums`}>
                {clock(row.at)}
            </td>
            <td className={`${TD} text-[color:var(--color-fg)]`}>{row.who}</td>
            <td
                className={`${TD} ${row.lane === "off" ? "text-[color:var(--color-fg)]" : "text-[color:var(--color-steel)]"}`}
            >
                {row.off ?? "—"}
            </td>
            <td
                className={`${TD} ${row.lane === "on" ? "text-[color:var(--color-fg)]" : "text-[color:var(--color-silver)]"}`}
            >
                {row.on !== null ? (
                    row.on
                ) : row.consequences.length === 0 ? (
                    <span className="text-[color:var(--color-steel)]">—</span>
                ) : (
                    row.consequences.map((consequence, index) => (
                        <span key={`${consequence.label}-${index}`} className="mr-3 inline-block">
                            {`${CONSEQUENCE[consequence.label]} `}
                            <TxLink chainId={consequence.chainId} hash={consequence.hash} />
                        </span>
                    ))
                )}
            </td>
            <td className={`${TD} text-right`}>
                {row.tx === null ? null : <TxLink chainId={row.tx.chainId} hash={row.tx.hash} />}
            </td>
        </tr>
    );
}

/** The public rows, one table for either view. */
function FactsTable({
    facts,
    chainId,
    labelledBy,
}: {
    facts: readonly ChainFact[];
    chainId: number;
    labelledBy: string;
}) {
    return (
        <table aria-labelledby={labelledBy} className="w-full border-collapse">
            <thead>
                <tr>
                    <th scope="col" className={`${TH} w-[9.5rem]`}>
                        Time
                    </th>
                    <th scope="col" className={`${TH} w-[12rem]`}>
                        Agent
                    </th>
                    <th scope="col" className={`${TH} w-[14rem]`}>
                        Did
                    </th>
                    <th scope="col" className={TH}>
                        On
                    </th>
                    <th scope="col" className={`${TH} w-[8rem] text-right`}>
                        Transaction
                    </th>
                </tr>
            </thead>
            <tbody>
                {facts.map((fact) => (
                    <ChainLine key={fact.key} fact={fact} chainId={chainId} />
                ))}
            </tbody>
        </table>
    );
}

type ActivityView = "yours" | "everyone";
const VIEW_PARAM = "view";
type FactFilter = (typeof FACT_FILTERS)[number]["id"];

/**
 * What happens on ARP, live, in two views (task 46c, the user's choice of variant A).
 *
 * **Everyone** is the public table: every identified agent's declarations and the support on them,
 * read from the indexer and re-read every fifteen seconds, the same for every visitor.
 *
 * **Yours** is what belongs to the reader: the positions the connected wallet holds (which was
 * `/profile`, `docs/tasks/35` §0), the public rows it signed or holds (`isOwnFact`), and **this
 * machine**, the local runtime relayed by `arp-session-log --serve`, in memory only. Its
 * invocations are one row per skill or MCP server called, joined to the declaration that names it
 * (`traceInvocations`); its timeline is every event once (`timelineRows`). A connected wallet
 * opens on Yours.
 *
 * The public read is the newest rows for everyone, not a query by wallet, so Yours finds the
 * wallet's rows **among those** and says so when it finds none. All of it is newest first.
 */
export function ActivityPage({feed, reads}: {feed?: AgentFeed; reads?: ChainReads} = {}) {
    const chain = useChainChoice();
    const onChain = useChainFacts(reads);
    const {address, isConnected} = useAccount();
    const [searchParams, setSearchParams] = useSearchParams();
    const requested = searchParams.get(VIEW_PARAM);
    // **Yours, then everyone** (task 46c, variant A): the reader's own agents and wallet apart from
    // the global activity. Without a link naming one, a connected wallet opens on its own.
    const view: ActivityView =
        requested === "yours" || requested === "everyone"
            ? requested
            : isConnected
              ? "yours"
              : "everyone";
    // `replace`: a view is a way of looking at one page, not a place Back should walk through.
    const chooseView = (next: ActivityView) =>
        setSearchParams(
            (current) => {
                const params = new URLSearchParams(current);
                params.set(VIEW_PARAM, next);
                return params;
            },
            {replace: true},
        );
    const [kind, setKind] = useState<FactFilter>("all");
    const ownFacts = onChain.facts.filter((fact) => isOwnFact(fact, address));
    const {events: all, status} = useAgentActivity(feed);
    // The toggle decides which chain's transactions are shown. Off-chain events belong to no chain
    // and stay on both.
    const events = useMemo(
        () => all.filter((event) => event.source !== "sent" || event.chainId === chain.chainId),
        [all, chain.chainId],
    );
    const {trace, tripleIdOf} = useActivityTrace(events);
    const ids = events.flatMap((event) =>
        event.source === "sent"
            ? event.decoded.fn === "createTriples"
                ? [...event.decoded.subjects, ...event.decoded.objects]
                : event.decoded.fn === "deposit"
                  ? [event.decoded.termId]
                  : []
            : event.source === "session" && event.ref !== null && event.ref.startsWith("0x")
              ? [event.ref]
              : [],
    );
    const names = useTermLabels(ids);
    const timeline = timelineRows(events, {chainId: chain.chainId, names, tripleIdOf});
    // The feed's agent, as the rows name it: by identity on a chain where it has one, else by wallet.
    const agent =
        timeline.find((row) => row.lane === "on")?.who ??
        timeline.find((row) => row.off?.startsWith("invoked") === true)?.who ??
        "—";
    const declared = trace.filter((row) => row.declaration?.status === "success").length;
    const staked = trace.filter((row) =>
        row.stakes.some((stake) => stake.status === "success"),
    ).length;
    const shown = factsOfKind(view === "yours" ? ownFacts : onChain.facts, kind);

    return (
        <section>
            <header className="grid items-end gap-x-8 gap-y-6 pt-14 pb-10 md:grid-cols-[minmax(0,1fr)_auto]">
                <div className="flex flex-wrap items-end gap-x-10 gap-y-4">
                    <h1 className="type-display">Activity</h1>
                    <DisplayTabs
                        label="Whose activity"
                        options={[
                            {
                                id: "yours",
                                label: "Yours",
                                // The rows the two Yours tables show at All: the wallet's public
                                // rows and the local invocations. Unknown while the read is out.
                                count: !isConnected
                                    ? trace.length
                                    : onChain.status === "pending"
                                      ? null
                                      : ownFacts.length + trace.length,
                            },
                            {
                                id: "everyone",
                                label: "Everyone",
                                count: onChain.status === "pending" ? null : onChain.facts.length,
                            },
                        ]}
                        selected={view}
                        onChange={chooseView}
                    />
                </div>
                <dl className="flex overflow-hidden rounded-[var(--radius-card)] border border-[color:var(--color-rule)]">
                    <Fact label="Chain">
                        <span className="text-[18px]">{chain.label}</span>
                    </Fact>
                    <Fact label="Feed">
                        <span className="text-[18px]">{FEED[status]}</span>
                    </Fact>
                </dl>
            </header>

            {/* What the connected wallet holds, moved from `/profile` (`docs/tasks/35` §0). Only
                under Yours: it is the reader's own and has no place in the global view. */}
            {view === "yours" ? <Positions /> : null}

            {/* Under Yours without a wallet, the positions above already ask for one; a second
                "connect a wallet" over an empty table would say it twice. */}
            {view === "yours" && !isConnected ? null : (
                <>
                    <div className="mb-4 flex flex-wrap items-center gap-x-6 gap-y-3 border-y border-[color:var(--color-rule)] py-3.5">
                        <Segmented
                            label="Show"
                            selected={kind}
                            onChange={setKind}
                            options={FACT_FILTERS}
                        />
                    </div>

                    <h2 className={`${LABEL} mb-2`} id="activity-chain">
                        {`${view === "yours" ? "Public · yours" : "Public · every agent"}${
                            onChain.status === "error" && onChain.facts.length > 0
                                ? " · incomplete, one read failed"
                                : ""
                        }`}
                    </h2>
                    {shown.length === 0 ? (
                        <p
                            className={`${CELL} border-t border-[color:var(--color-rule)] py-3 text-[color:var(--color-steel)]`}
                        >
                            {onChain.status === "pending"
                                ? "Reading the indexer"
                                : onChain.status === "error" && onChain.facts.length === 0
                                  ? "The indexer did not answer. It is asked again every 15 seconds."
                                  : kind !== "all"
                                    ? "None of this kind among the latest public rows."
                                    : view === "yours"
                                      ? "Nothing signed by or held for this wallet among the latest public rows."
                                      : `Nothing declared on ${chain.label} yet. Each declaration an identified agent writes appears here.`}
                        </p>
                    ) : (
                        <FactsTable
                            facts={shown}
                            chainId={chain.chainId}
                            labelledBy="activity-chain"
                        />
                    )}
                </>
            )}

            {/* The local runtime's own record is the reader's by definition: it runs on this
                machine. So it belongs to Yours and nowhere else. */}
            {view === "yours" ? (
                <>
                    <h2 className={`${LABEL} mt-14 mb-2`}>
                        {`This machine · ${agent} · ${trace.length} invoked · ${declared} declared · ${staked} supported`}
                    </h2>

                    <h3 className={`${LABEL} mt-6 mb-2`} id="activity-invocations">
                        Invocations
                    </h3>
                    {trace.length === 0 ? (
                        <p
                            className={`${CELL} border-t border-[color:var(--color-rule)] py-3 text-[color:var(--color-steel)]`}
                        >
                            {status === "off"
                                ? "Start the feed with arp-session-log --serve in the agent's directory, then reload."
                                : "No skill or MCP call recorded yet. Each one the agent's runtime makes appears here."}
                        </p>
                    ) : (
                        <table
                            aria-labelledby="activity-invocations"
                            className="w-full border-collapse"
                        >
                            <thead>
                                <tr>
                                    <th scope="col" className={`${TH} w-[5.5rem]`}>
                                        Last
                                    </th>
                                    <th scope="col" className={`${TH} w-[4.5rem]`}>
                                        Kind
                                    </th>
                                    <th scope="col" className={TH}>
                                        Name
                                    </th>
                                    <th scope="col" className={`${TH} w-[8rem]`}>
                                        Calls
                                    </th>
                                    <th scope="col" className={`${TH} w-[10rem]`}>
                                        Declared
                                    </th>
                                    <th scope="col" className={`${TH} w-[16rem]`}>
                                        Supported
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {trace.map((row) => (
                                    <InvocationRow
                                        key={`${row.kind}:${row.ref ?? row.name}`}
                                        row={row}
                                    />
                                ))}
                            </tbody>
                        </table>
                    )}

                    {/* Headers over no rows read as a failed read; the invocations above
                        already say when nothing has run. */}
                    {timeline.length === 0 ? null : (
                        <>
                            <h3 className={`${LABEL} mt-10 mb-2`} id="activity-timeline">
                                Timeline
                            </h3>
                            <table
                                aria-labelledby="activity-timeline"
                                className="w-full border-collapse"
                            >
                                <thead>
                                    <tr>
                                        <th scope="col" className={`${TH} w-[5.5rem]`}>
                                            Time
                                        </th>
                                        <th scope="col" className={`${TH} w-[12rem]`}>
                                            Who
                                        </th>
                                        <th scope="col" className={TH}>
                                            Local
                                        </th>
                                        <th scope="col" className={TH}>
                                            Public
                                        </th>
                                        <th scope="col" className={`${TH} w-[8rem] text-right`}>
                                            Transaction
                                        </th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {timeline.map((row) => (
                                        <TimelineLine key={row.key} row={row} />
                                    ))}
                                </tbody>
                            </table>
                        </>
                    )}
                </>
            ) : null}
        </section>
    );
}
