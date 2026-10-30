/**
 * The operator's agent, as this browser can see it: the local feed's events, relayed into the
 * activity log, and each transaction the agent reports confirmed by reading the chain directly.
 *
 * The browser cannot read `.arp/` — the feed (`apps/mcp/src/activity-feed.ts`) streams it from
 * 127.0.0.1. Everything it sends is a local program's record, so a `sent` line is the signer's word;
 * the chain's word is the `confirmed` entry appended once this browser has read the receipt itself.
 *
 * No React. The hook owns the lifecycle; this holds the events and decides what an entry says.
 */
import {
    activityFromWire,
    orderActivity,
    type ActivityEvent as AgentEvent,
    type DecodedCall,
} from "@arp-protocol/core";
import type {Hex} from "viem";

import type {ActivityInput, ActivityLog} from "./activity-log";

export type FeedStatus = "off" | "connecting" | "live" | "offline";

/** The browser's `EventSource`, as narrow as this module uses it, so a test passes its own. */
export type EventSourceLike = {
    onopen: ((event: Event) => void) | null;
    onmessage: ((event: MessageEvent<string>) => void) | null;
    onerror: ((event: Event) => void) | null;
    close(): void;
};

/** What reading a receipt returns, reduced to what an entry shows. */
export type ReceiptRead = {status: "success" | "reverted"; block: bigint; costWei: bigint} | null;
export type ReadReceipt = (chainId: number, hash: Hex) => Promise<ReceiptRead>;

const short = (value: string): string => (value.length > 14 ? `${value.slice(0, 10)}…` : value);

/** Atom id → the name the agent invoked it by, learnt from the hook's refs and the receipts. */
export function namesOf(events: readonly AgentEvent[]): Map<string, string> {
    const names = new Map<string, string>();
    for (const event of events) {
        if (event.source === "session" && event.ref !== null)
            names.set(event.ref.toLowerCase(), event.name);
        if (event.source === "receipt" && event.atom !== null)
            names.set(event.atom.toLowerCase(), event.name);
    }
    return names;
}

function callSummary(
    decoded: DecodedCall,
    names: ReadonlyMap<string, string>,
): {label: string; detail?: string} {
    const named = (id: string) => names.get(id.toLowerCase()) ?? short(id);
    switch (decoded.fn) {
        case "createTriples": {
            const [first, ...rest] = decoded.objects;
            if (first === undefined) return {label: "uses"};
            return {
                label: "uses",
                detail: `→ ${named(first)}${rest.length > 0 ? ` +${rest.length}` : ""}`,
            };
        }
        case "deposit":
            return {
                label: "position",
                detail: `on ${short(decoded.termId)} · curve ${decoded.curveId}`,
            };
        case "createAtoms":
            return {label: "atoms", detail: `${decoded.count}`};
        case "redeem":
            return {label: "redeem", detail: short(decoded.termId)};
        default:
            return {
                label: "call",
                ...(decoded.selector === null ? {} : {detail: decoded.selector}),
            };
    }
}

/** The key that makes two deliveries of one event the same entry. */
export function agentEventKey(event: AgentEvent): string {
    switch (event.source) {
        case "session":
            return `agent:session:${event.session ?? ""}:${event.call ?? `${event.at}:${event.name}`}`;
        case "receipt":
            return `agent:receipt:${event.at}:${event.name}`;
        case "sent":
            return event.hash === null
                ? `agent:dry:${event.at}:${event.why}:${JSON.stringify(event.decoded)}`
                : `agent:sent:${event.hash}`;
    }
}

/** One feed event as one log entry: the values it happened with, and no commentary. */
export function entryFor(event: AgentEvent, names: ReadonlyMap<string, string>): ActivityInput {
    const at = Date.parse(event.at);
    const base = {
        stream: "agent" as const,
        key: agentEventKey(event),
        ...(Number.isNaN(at) ? {} : {at}),
    };
    switch (event.source) {
        case "session": {
            const parts = [
                event.kind,
                ...(event.outcome !== null && event.outcome !== "ok" ? [event.outcome] : []),
                ...(event.ms !== null ? [`${event.ms}ms`] : []),
                ...(event.ref !== null ? [short(event.ref)] : []),
            ];
            return {
                ...base,
                step: event.outcome !== null && event.outcome !== "ok" ? "refused" : "invocation",
                label: event.name,
                detail: parts.join(" · "),
            };
        }
        case "receipt":
            return {
                ...base,
                step: "receipt",
                label: event.name,
                detail: [
                    ...(event.signer !== null ? [`signed ${short(event.signer)}`] : []),
                    ...(event.atom !== null ? [`atom ${short(event.atom)}`] : []),
                ].join(" · "),
            };
        case "sent": {
            const summary = callSummary(event.decoded, names);
            const step =
                event.status === "dry"
                    ? "simulated"
                    : event.status === "reverted"
                      ? "refused"
                      : event.decoded.fn === "deposit"
                        ? "stake"
                        : "declaration";
            return {
                ...base,
                step,
                label: summary.label,
                ...(summary.detail === undefined ? {} : {detail: summary.detail}),
                ...(event.hash === null ? {} : {tx: event.hash}),
                costWei: event.value,
                chainId: event.chainId,
            };
        }
    }
}

export type AgentFeedOptions = {
    url: string | undefined;
    open: (url: string) => EventSourceLike;
    readReceipt: ReadReceipt;
};

/**
 * The agent's events, one connection however many components read them.
 *
 * A class for the reason `ActivityLog` is one: identity, state and behaviour together, and a test
 * builds its own instance.
 */
export class AgentFeed {
    private events: AgentEvent[] = [];
    private readonly seen = new Set<string>();
    private readonly confirming = new Set<string>();
    private statusValue: FeedStatus = "off";
    private source: EventSourceLike | null = null;
    private users = 0;
    private readonly listeners = new Set<() => void>();

    private readonly log: ActivityLog;
    private readonly options: AgentFeedOptions;

    constructor(log: ActivityLog, options: AgentFeedOptions) {
        this.log = log;
        this.options = options;
    }

    /** Ordered oldest first. A new array identity on every change, for `useSyncExternalStore`. */
    all(): readonly AgentEvent[] {
        return this.events;
    }

    status(): FeedStatus {
        return this.statusValue;
    }

    subscribe(listener: () => void): () => void {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    }

    /** Counted: the connection opens with the first reader and closes with the last. */
    start(): () => void {
        this.users += 1;
        if (this.users === 1) this.connect();
        return () => {
            this.users -= 1;
            if (this.users === 0) this.disconnect();
        };
    }

    /** Takes one event off the wire. Public so a test feeds it without a socket. */
    receive(raw: unknown): void {
        const event = activityFromWire(raw);
        if (event === null) return;
        const key = agentEventKey(event);
        if (this.seen.has(key)) return;
        this.seen.add(key);
        this.events = orderActivity([...this.events, event]);
        if (!this.log.has(key)) this.log.append(entryFor(event, namesOf(this.events)));
        this.emit();
        if (event.source === "sent" && event.hash !== null)
            void this.confirm(event.chainId, event.hash);
    }

    private async confirm(chainId: number, hash: Hex): Promise<void> {
        const key = `agent:confirmed:${hash}`;
        if (this.confirming.has(key) || this.log.has(key)) return;
        this.confirming.add(key);
        let read: ReceiptRead;
        try {
            read = await this.options.readReceipt(chainId, hash);
        } catch {
            // The RPC refused or timed out. Nothing is appended, so the row stays the signer's word.
            this.confirming.delete(key);
            return;
        }
        if (read === null) {
            this.confirming.delete(key);
            return;
        }
        this.log.append({
            stream: "agent",
            step: read.status === "success" ? "confirmed" : "refused",
            label: read.status === "success" ? `block ${read.block}` : "reverted",
            tx: hash,
            costWei: read.costWei.toString(),
            chainId,
            key,
        });
    }

    private connect(): void {
        const url = this.options.url;
        if (url === undefined) return;
        this.setStatus("connecting");
        let source: EventSourceLike;
        try {
            source = this.options.open(url);
        } catch {
            // No `EventSource` in this environment, or a URL it refuses: the feed is simply absent.
            this.setStatus("offline");
            return;
        }
        source.onopen = () => this.setStatus("live");
        source.onerror = () => this.setStatus("offline");
        source.onmessage = (message) => {
            try {
                this.receive(JSON.parse(message.data));
            } catch {
                // A frame that is not JSON is not an event. The stream goes on.
            }
        };
        this.source = source;
    }

    private disconnect(): void {
        this.source?.close();
        this.source = null;
        this.setStatus("off");
    }

    private setStatus(status: FeedStatus): void {
        if (status === this.statusValue) return;
        this.statusValue = status;
        this.emit();
    }

    private emit(): void {
        this.events = [...this.events];
        for (const listener of this.listeners) listener();
    }
}

/** One skill or MCP server the agent invoked, and what it went on to say about it on chain. */
export type TracedInvocation = {
    kind: "skill" | "mcp";
    name: string;
    ref: string | null;
    calls: number;
    failed: number;
    lastAt: string;
    /** The create-triple that names `ref` as its object, if the agent sent one. */
    declaration: {
        chainId: number;
        hash: Hex | null;
        status: "dry" | "success" | "reverted";
        subject: Hex;
        predicate: Hex;
        object: Hex;
    } | null;
    /** The deposits on that declaration's triple, once its id is known. */
    stakes: {
        chainId: number;
        hash: Hex | null;
        status: "dry" | "success" | "reverted";
        value: string;
    }[];
};

/**
 * Each invocation, joined to the declaration that names it and the stakes on that declaration.
 *
 * The join is on ids, never on names: an invocation's `ref` against a create-triple's object, and
 * the triple's id against a deposit's term. The triple id is not in the calldata — the chain
 * computes it — so it is passed in, read by the caller from `calculateTripleId`.
 */
export function traceInvocations(
    events: readonly AgentEvent[],
    tripleIdOf: (subject: Hex, predicate: Hex, object: Hex) => Hex | undefined,
): TracedInvocation[] {
    const sent = events.filter((event) => event.source === "sent");
    // A real send outranks a dry run of the same call: it is the later and the stronger record.
    const rank = {dry: 0, reverted: 1, success: 2} as const;
    const byKey = new Map<string, TracedInvocation>();
    for (const event of events) {
        if (event.source !== "session") continue;
        const key = `${event.kind}:${event.ref ?? event.name}`;
        const row = byKey.get(key) ?? {
            kind: event.kind,
            name: event.name,
            ref: event.ref,
            calls: 0,
            failed: 0,
            lastAt: event.at,
            declaration: null,
            stakes: [],
        };
        row.calls += 1;
        if (event.outcome !== null && event.outcome !== "ok") row.failed += 1;
        if (event.at > row.lastAt) row.lastAt = event.at;
        byKey.set(key, row);
    }
    for (const row of byKey.values()) {
        if (row.ref === null) continue;
        const ref = row.ref.toLowerCase();
        for (const event of sent) {
            if (event.decoded.fn !== "createTriples") continue;
            const {subjects, predicates, objects} = event.decoded;
            const index = objects.findIndex((object) => object.toLowerCase() === ref);
            const subject = subjects[index];
            const predicate = predicates[index];
            const object = objects[index];
            if (
                index === -1 ||
                subject === undefined ||
                predicate === undefined ||
                object === undefined
            )
                continue;
            if (row.declaration !== null && rank[row.declaration.status] > rank[event.status])
                continue;
            row.declaration = {
                chainId: event.chainId,
                hash: event.hash,
                status: event.status,
                subject,
                predicate,
                object,
            };
        }
        if (row.declaration === null) continue;
        const triple = tripleIdOf(
            row.declaration.subject,
            row.declaration.predicate,
            row.declaration.object,
        );
        if (triple === undefined) continue;
        row.stakes = sent
            .filter(
                (event) =>
                    event.decoded.fn === "deposit" &&
                    event.decoded.termId.toLowerCase() === triple.toLowerCase(),
            )
            .map((event) => ({
                chainId: event.chainId,
                hash: event.hash,
                status: event.status,
                value: event.value,
            }));
    }
    return [...byKey.values()].sort((a, b) => b.lastAt.localeCompare(a.lastAt));
}
