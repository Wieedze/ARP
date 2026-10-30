/**
 * Serialise requests per host, with a minimum gap between them.
 *
 * **Per host, not global**, and that is not a detail. In the 2026-10-16 sample one operator
 * accounted for 38 of 108 declared endpoints, so a global concurrency limit still points its whole
 * budget at one server. A per-host gate lets the walk stay fast across the cohort while no single
 * recipient sees more than one request at a time.
 *
 * Also the place `429` is honoured: `backOff` marks a host as closed until a deadline, and every
 * later call for that host waits it out. Probing is load somebody else pays for, and a verifier that
 * ignores a back-off signal is not a verifier, it is a nuisance.
 *
 * The clock and the sleep are injected so tests do not wait in real time.
 */
export type HostLimiterOptions = {
    /** Minimum milliseconds between two requests to the same host. */
    minGapMs?: number;
    now?: () => number;
    sleep?: (ms: number) => Promise<void>;
    /** How long a `429` with no `Retry-After` closes a host for. */
    defaultBackOffMs?: number;
};

const DEFAULT_MIN_GAP_MS = 250;
const DEFAULT_BACK_OFF_MS = 60_000;

/** Cap on a server-supplied `Retry-After`, so one bad header cannot stall a walk indefinitely. */
const MAX_BACK_OFF_MS = 10 * 60_000;

export class HostLimiter {
    private readonly minGapMs: number;
    private readonly defaultBackOffMs: number;
    private readonly now: () => number;
    private readonly sleep: (ms: number) => Promise<void>;
    /** Per host: when the next request may go out, and the tail of the queue. */
    private readonly nextFreeAt = new Map<string, number>();
    private readonly queue = new Map<string, Promise<void>>();

    constructor(options: HostLimiterOptions = {}) {
        this.minGapMs = options.minGapMs ?? DEFAULT_MIN_GAP_MS;
        this.defaultBackOffMs = options.defaultBackOffMs ?? DEFAULT_BACK_OFF_MS;
        this.now = options.now ?? (() => Date.now());
        this.sleep = options.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
    }

    /**
     * Run `task` once the host is free, holding the host until it settles.
     *
     * A rejection still releases the host — otherwise one failing endpoint would close its host for
     * the rest of the walk, turning a transport error into a cohort-wide gap.
     */
    async run<T>(url: string, task: () => Promise<T>): Promise<T> {
        const host = hostOf(url);
        const previous = this.queue.get(host) ?? Promise.resolve();
        let release!: () => void;
        const mine = new Promise<void>((resolve) => {
            release = resolve;
        });
        this.queue.set(
            host,
            previous.then(() => mine),
        );

        await previous;
        const waitMs = (this.nextFreeAt.get(host) ?? 0) - this.now();
        if (waitMs > 0) await this.sleep(waitMs);
        try {
            return await task();
        } finally {
            this.nextFreeAt.set(host, this.now() + this.minGapMs);
            release();
        }
    }

    /**
     * Close a host until it is willing to be asked again.
     *
     * `retryAfter` is the header value: seconds, or an HTTP date. An absent or unparseable value
     * falls back to the default rather than being treated as zero — the signal was sent, so it is
     * honoured whether or not we can read the number.
     */
    backOff(url: string, retryAfter?: string | null): void {
        const host = hostOf(url);
        const until = this.now() + this.parseRetryAfter(retryAfter);
        this.nextFreeAt.set(host, Math.max(this.nextFreeAt.get(host) ?? 0, until));
    }

    /** When this host may next be asked. Exposed for reporting a walk's throttle state. */
    nextFreeFor(url: string): number {
        return this.nextFreeAt.get(hostOf(url)) ?? 0;
    }

    private parseRetryAfter(value: string | null | undefined): number {
        if (!value) return this.defaultBackOffMs;
        const seconds = Number(value.trim());
        if (Number.isFinite(seconds) && seconds >= 0) {
            return Math.min(seconds * 1000, MAX_BACK_OFF_MS);
        }
        const date = Date.parse(value);
        if (!Number.isNaN(date)) {
            return Math.min(Math.max(date - this.now(), 0), MAX_BACK_OFF_MS);
        }
        return this.defaultBackOffMs;
    }
}

/**
 * The host a URL addresses, or the raw string when it will not parse.
 *
 * An unparseable value still gets its own bucket rather than sharing one with every other
 * unparseable value, which would serialise unrelated requests behind each other.
 */
export function hostOf(url: string): string {
    try {
        return new URL(url).host.toLowerCase();
    } catch {
        return `unparseable:${url}`;
    }
}
