import {useEffect, useRef, useState} from "react";
import {Link} from "react-router-dom";

import {useActivityLog} from "../../hooks/use-activity-log";
import {useAgentActivity} from "../../hooks/use-agent-activity";
import {useChainActivity} from "../../hooks/use-chain-activity";
import {amountOf, explorerTxUrl} from "../../lib/chain-amounts";
import {useChainChoice} from "../../lib/chain-choice";
import {intuitionTestnet} from "../../lib/chains";
import type {ActivityEvent, ActivityLog as Store} from "../../services/activity-log";
import type {AgentFeed, FeedStatus} from "../../services/agent-feed";

/**
 * A console at the foot of the page: what this browser did, and what landed on the chain.
 *
 * It renders **events with the values they happened with** and never a verdict of ours. A line
 * reading `receipt  signed 0x8A18… · sha256 8cfb86…` is a fact somebody can check; a line reading
 * "receipt verified" is the app talking about itself, and the user's standing instruction — given
 * six times — is that this app is an index and not a display of our reasoning. The store's own
 * docstring holds that line too, so it survives a rewrite of this file.
 *
 * ## Three weights, because they are three kinds of evidence
 *
 * `mine` carries the whole loop — discovery, access, receipt, invocation, declaration — and is
 * marked with the accent, which ADR `0057` reserves for the viewer's own position. `agent` is the
 * operator's agent, relayed from the local feed (`services/agent-feed.ts`): the same loop, recorded
 * by the hook, the fetcher and the signer on this machine, at full weight and without the accent —
 * it is not this browser's act. `chain` carries only what landed, dimmer, because the chain holds
 * the declaration and nothing about how it was arrived at.
 *
 * ## Collapsed by default
 *
 * It is fixed to the bottom of every page, so expanded-by-default would take a strip off every
 * layout for a surface most visits do not need. The choice is remembered per browser, which is the
 * kind of per-viewer convenience `localStorage` is for — and every access is wrapped, because a
 * private window throws rather than returning empty.
 */
const STORAGE_KEY = "arp.activity.open";

function readOpen(): boolean {
    try {
        return window.localStorage.getItem(STORAGE_KEY) === "1";
    } catch {
        return false;
    }
}

function writeOpen(open: boolean): void {
    try {
        window.localStorage.setItem(STORAGE_KEY, open ? "1" : "0");
    } catch {
        // A private window refuses. The panel still works; the choice is just not remembered.
    }
}

/** `21:42:18`, local, seconds included because two steps of one loop land in the same minute. */
function clockOf(at: number): string {
    const d = new Date(at);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

const STEP_LABEL: Record<ActivityEvent["step"], string> = {
    discovery: "discovery",
    access: "access",
    receipt: "receipt",
    invocation: "invoked",
    declaration: "declared",
    stake: "staked",
    simulated: "dry run",
    sent: "sent",
    confirmed: "confirmed",
    landed: "on chain",
    refused: "refused",
};

const FEED_LABEL: Record<FeedStatus, string> = {
    off: "",
    connecting: "agent …",
    live: "agent live",
    offline: "agent offline",
};

function Row({entry}: {entry: ActivityEvent}) {
    const mine = entry.stream === "mine";
    return (
        // The transaction link has its own column, pinned to the right edge, so every hash lines up
        // in one place whatever the row says (user, 2026-10-30). The fixed width is a hash's.
        <li
            className={`grid grid-cols-[4.5rem_7rem_minmax(0,1fr)_7.5rem] gap-x-3 px-4 py-[3px] ${
                entry.stream === "chain" ? "opacity-70" : ""
            }`}
        >
            <span className="font-mono text-[10px] leading-[1.7] text-[color:var(--color-steel)] tabular-nums">
                {clockOf(entry.at)}
            </span>
            <span
                className={`font-mono text-[10px] leading-[1.7] tracking-[0.06em] uppercase ${
                    mine ? "text-[color:var(--color-accent)]" : "text-[color:var(--color-steel)]"
                }`}
            >
                {STEP_LABEL[entry.step]}
            </span>
            <span className="min-w-0 truncate font-mono text-[11px] leading-[1.7] text-[color:var(--color-silver)]">
                <span className="text-[color:var(--color-fg)]">{entry.label}</span>
                {entry.detail === undefined ? null : <span>{`  ${entry.detail}`}</span>}
                {entry.costWei === undefined ? null : (
                    <span className="text-[color:var(--color-steel)]">{`  ${amountOf(entry.costWei, entry.chainId ?? intuitionTestnet.id)}`}</span>
                )}
            </span>
            <span className="text-right font-mono text-[11px] leading-[1.7] tabular-nums">
                {entry.tx === undefined ? null : (
                    <a
                        href={explorerTxUrl(entry.chainId ?? intuitionTestnet.id, entry.tx)}
                        target="_blank"
                        rel="noreferrer"
                        aria-label={`Transaction ${entry.tx} on the explorer, opens in a new tab`}
                        // `!` because the base-layer `a` rule beats a plain utility (`rules/ui.md`, Gates).
                        className="text-[color:var(--color-steel)]! hover:text-[color:var(--color-fg)]!"
                    >
                        {`${entry.tx.slice(0, 10)}…`}
                        <span aria-hidden="true"> ↗</span>
                    </a>
                )}
            </span>
        </li>
    );
}

export function ActivityLog({store, feed}: {store?: Store; feed?: AgentFeed} = {}) {
    const [open, setOpen] = useState(readOpen);
    const chain = useChainChoice();
    const logged = useActivityLog(store);
    // The toggle decides which chain's transactions show. An entry with no chain — an invocation, a
    // receipt — happened off chain and shows on both.
    const entries = logged.filter(
        (entry) => entry.chainId === undefined || entry.chainId === chain.chainId,
    );
    // Always connected, open or not: the bar's count is how a demo shows the agent acted.
    const agent = useAgentActivity(feed);
    // The ambient half. Polled only while the panel is open: a closed panel nobody reads is not a
    // reason to ask the indexer every fifteen seconds.
    useChainActivity({log: store, enabled: open});

    const foot = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (!open) return;
        // A console reads oldest at the top, so the newest line is the one to keep in view.
        foot.current?.scrollIntoView({block: "end"});
    }, [entries, open]);

    const mine = entries.filter((entry) => entry.stream === "mine").length;
    const fromAgent = entries.filter((entry) => entry.stream === "agent").length;
    const latest = entries[entries.length - 1];

    return (
        <aside className="fixed inset-x-0 bottom-0 z-40 border-t border-[color:var(--color-rule)] bg-[color:var(--color-bg)]">
            <div className="flex items-baseline gap-3 px-4">
                <button
                    type="button"
                    aria-expanded={open}
                    aria-controls="arp-activity-list"
                    onClick={() => {
                        const next = !open;
                        setOpen(next);
                        writeOpen(next);
                    }}
                    className="flex min-w-0 flex-1 items-baseline gap-3 rounded-none! border-0! bg-transparent py-2 text-left"
                >
                    <span className="font-mono text-[10px] tracking-[0.12em] uppercase text-[color:var(--color-steel)]">
                        activity
                    </span>
                    <span className="font-mono text-[10px] text-[color:var(--color-steel)] tabular-nums">
                        {entries.length === 0
                            ? "—"
                            : `${entries.length} · ${mine} yours · ${fromAgent} agent`}
                    </span>
                    {/* Closed, the bar still says what just happened, which is most of what a
                        demo's audience needs from it. */}
                    {!open && latest !== undefined ? (
                        <span className="min-w-0 truncate font-mono text-[10px] text-[color:var(--color-silver)]">
                            {`${STEP_LABEL[latest.step]}  ${latest.label}`}
                        </span>
                    ) : null}
                    <span className="ml-auto font-mono text-[10px] text-[color:var(--color-steel)]">
                        {open ? "close" : "open"}
                    </span>
                </button>
                {agent.status === "off" ? null : (
                    <span
                        className={`font-mono text-[10px] ${
                            agent.status === "live"
                                ? "text-[color:var(--color-fg)]"
                                : "text-[color:var(--color-steel)]"
                        }`}
                    >
                        {FEED_LABEL[agent.status]}
                    </span>
                )}
                <Link
                    to="/activity"
                    className="font-mono text-[10px] tracking-[0.06em] uppercase text-[color:var(--color-steel)]"
                >
                    trace
                </Link>
            </div>

            {open ? (
                <div
                    id="arp-activity-list"
                    className="max-h-[14rem] overflow-y-auto border-t border-[color:var(--color-rule)]"
                >
                    {entries.length === 0 ? (
                        <p className="px-4 py-3 font-mono text-[11px] leading-[1.7] text-[color:var(--color-steel)]">
                            Nothing yet. Declaring a use or taking a position writes here step by
                            step, and so does your agent once its feed runs; other agents&rsquo;
                            writes appear as they land.
                        </p>
                    ) : (
                        <ol className="py-1">
                            {entries.map((entry) => (
                                <Row key={entry.id} entry={entry} />
                            ))}
                        </ol>
                    )}
                    <div ref={foot} />
                </div>
            ) : null}
        </aside>
    );
}
