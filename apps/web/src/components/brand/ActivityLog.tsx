import {useEffect, useRef, useState} from "react";
import {formatEther} from "viem";

import {useActivityLog} from "../../hooks/use-activity-log";
import {useChainActivity} from "../../hooks/use-chain-activity";
import type {ActivityEvent, ActivityLog as Store} from "../../services/activity-log";

/**
 * A console at the foot of the page: what this browser did, and what landed on the chain.
 *
 * It renders **events with the values they happened with** and never a verdict of ours. A line
 * reading `reçu  signé 0x8A18… · sha256 8cfb86…` is a fact somebody can check; a line reading
 * "receipt verified" is the app talking about itself, and the user's standing instruction — given
 * six times — is that this app is an index and not a display of our reasoning. The store's own
 * docstring holds that line too, so it survives a rewrite of this file.
 *
 * ## Two weights, because they are two kinds of evidence
 *
 * `mine` carries the whole loop — discovery, access, receipt, invocation, declaration — and is
 * marked with the accent, which ADR `0057` reserves for the viewer's own position. `chain` carries
 * only what landed, dimmer and indented, because the chain holds the declaration and nothing about
 * how it was arrived at.
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

/** Wei to TRUST, trimmed. Never a float of the wei — any real figure loses precision. */
function costOf(wei: string): string {
    const whole = formatEther(BigInt(wei));
    return `${whole.replace(/0+$/, "").replace(/\.$/, "")} tTRUST`;
}

const STEP_LABEL: Record<ActivityEvent["step"], string> = {
    discovery: "découverte",
    access: "accès",
    receipt: "reçu",
    invocation: "appel",
    declaration: "déclaration",
    confirmed: "confirmé",
    landed: "sur la chaîne",
    refused: "refusé",
};

function Row({entry}: {entry: ActivityEvent}) {
    const mine = entry.stream === "mine";
    return (
        <li
            className={`grid grid-cols-[4.5rem_7rem_1fr] gap-x-3 px-4 py-[3px] ${
                mine ? "" : "opacity-70"
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
            <span className="min-w-0 font-mono text-[11px] leading-[1.7] text-[color:var(--color-silver)]">
                <span className="text-[color:var(--color-fg)]">{entry.label}</span>
                {entry.detail === undefined ? null : <span>{`  ${entry.detail}`}</span>}
                {entry.tx === undefined ? null : (
                    <span className="text-[color:var(--color-steel)]">{`  ${entry.tx.slice(
                        0,
                        10,
                    )}…`}</span>
                )}
                {entry.costWei === undefined ? null : (
                    <span className="text-[color:var(--color-steel)]">{`  ${costOf(
                        entry.costWei,
                    )}`}</span>
                )}
            </span>
        </li>
    );
}

export function ActivityLog({store}: {store?: Store} = {}) {
    const [open, setOpen] = useState(readOpen);
    const entries = useActivityLog(store);
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

    return (
        <aside className="fixed inset-x-0 bottom-0 z-40 border-t border-[color:var(--color-rule)] bg-[color:var(--color-bg)]">
            <button
                type="button"
                aria-expanded={open}
                aria-controls="arp-activity-list"
                onClick={() => {
                    const next = !open;
                    setOpen(next);
                    writeOpen(next);
                }}
                className="flex w-full items-baseline gap-3 rounded-none! border-0! bg-transparent px-4 py-2 text-left"
            >
                <span className="font-mono text-[10px] tracking-[0.12em] uppercase text-[color:var(--color-steel)]">
                    activité
                </span>
                <span className="font-mono text-[10px] text-[color:var(--color-steel)] tabular-nums">
                    {entries.length === 0 ? "—" : `${entries.length} · ${mine} de vous`}
                </span>
                <span className="ml-auto font-mono text-[10px] text-[color:var(--color-steel)]">
                    {open ? "fermer" : "ouvrir"}
                </span>
            </button>

            {open ? (
                <div
                    id="arp-activity-list"
                    className="max-h-[14rem] overflow-y-auto border-t border-[color:var(--color-rule)]"
                >
                    {entries.length === 0 ? (
                        <p className="px-4 py-3 font-mono text-[11px] leading-[1.7] text-[color:var(--color-steel)]">
                            Rien encore. Déclarer un usage ou prendre une position écrit ici, étape
                            par étape ; les écritures d&rsquo;autres agents apparaissent au fur et à
                            mesure.
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
