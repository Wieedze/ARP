import {useMemo} from "react";
import type {Hex} from "viem";

import {useActivityTrace} from "../hooks/use-activity-trace";
import {useAgentActivity} from "../hooks/use-agent-activity";
import {useTermLabels} from "../hooks/use-term-labels";
import {useChainChoice} from "../lib/chain-choice";
import {amountOf, explorerTxUrl} from "../lib/chain-amounts";
import {
    timelineRows,
    type AgentFeed,
    type FeedStatus,
    type TimelineRow,
    type TracedInvocation,
} from "../services/agent-feed";

/**
 * What the operator's agent triggered, and what it said about it on chain.
 *
 * Two parts. **Invocations** is one row per skill or MCP server the runtime called, joined on ids
 * to the declaration that names it and the stakes on that declaration (`traceInvocations`). Below
 * it, **the record** is the same events unjoined, in two columns: what never touches a chain
 * (the hook's lines, the content receipts) beside what was signed for one.
 *
 * Everything is newest first, the three lists alike: a demo watches the top of the page.
 *
 * Everything here is relayed from the local feed, so it is a local program's record. The
 * explorer link on each hash is how a reader takes the chain's word instead.
 */
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

function Fact({label, children}: {label: string; children: React.ReactNode}) {
    return (
        <div className="flex min-w-[7.5rem] flex-col gap-1.5 px-5 py-3.5 [&+&]:border-l [&+&]:border-l-[color:var(--color-rule)]">
            <dt className="font-mono text-[10px] uppercase tracking-[0.06em] text-[color:var(--color-steel)]">
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

const LABEL = "font-mono text-[10px] uppercase tracking-[0.06em] text-[color:var(--color-steel)]";
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
                        {row.ref === null ? "no atom" : "—"}
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
                            {`${consequence.label} `}
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

export function ActivityPage({feed}: {feed?: AgentFeed} = {}) {
    const chain = useChainChoice();
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

    return (
        <section>
            <header className="grid items-end gap-x-8 gap-y-6 pt-14 pb-10 md:grid-cols-[minmax(0,1fr)_auto]">
                <h1 className="type-display">Activity</h1>
                <dl className="flex overflow-hidden rounded-[var(--radius-card)] border border-[color:var(--color-rule)]">
                    <Fact label="Agent">
                        <span className="text-[18px]">{agent}</span>
                    </Fact>
                    <Fact label="Chain">
                        <span className="text-[18px]">{chain.label}</span>
                    </Fact>
                    <Fact label="Invoked">{trace.length}</Fact>
                    <Fact label="Declared">{declared}</Fact>
                    <Fact label="Staked">{staked}</Fact>
                    <Fact label="Feed">
                        <span className="text-[18px]">{FEED[status]}</span>
                    </Fact>
                </dl>
            </header>

            <h2 className={`${LABEL} mb-2`} id="activity-invocations">
                Invocations
            </h2>
            {trace.length === 0 ? (
                <p
                    className={`${CELL} border-t border-[color:var(--color-rule)] py-3 text-[color:var(--color-steel)]`}
                >
                    {status === "off"
                        ? "Start the feed with arp-session-log --serve in the agent's directory, then reload."
                        : "No skill or MCP call recorded yet. Each one the agent's runtime makes appears here."}
                </p>
            ) : (
                <table aria-labelledby="activity-invocations" className="w-full border-collapse">
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
                                Staked
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {trace.map((row) => (
                            <InvocationRow key={`${row.kind}:${row.ref ?? row.name}`} row={row} />
                        ))}
                    </tbody>
                </table>
            )}

            <h2 className={`${LABEL} mt-14 mb-2`} id="activity-timeline">
                Timeline
            </h2>
            <table aria-labelledby="activity-timeline" className="w-full border-collapse">
                <thead>
                    <tr>
                        <th scope="col" className={`${TH} w-[5.5rem]`}>
                            Time
                        </th>
                        <th scope="col" className={`${TH} w-[12rem]`}>
                            Who
                        </th>
                        <th scope="col" className={TH}>
                            Off chain
                        </th>
                        <th scope="col" className={TH}>
                            On chain
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
        </section>
    );
}
