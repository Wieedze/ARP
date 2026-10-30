/**
 * What the app has done, and what the chain has done, as one ordered list.
 *
 * A class rather than a module of functions because it is the case `rules/code.md` names: identity,
 * state and behaviour that travel together, and a test needs to make its own instance rather than
 * reset a module. No React here and no formatting — it holds **values**, and the component decides
 * how they read.
 *
 * ## Two streams, deliberately not merged into one kind
 *
 * `mine` is what this browser did, step by step. `chain` is what landed on 13579 regardless of who
 * did it. They are not the same evidence and the panel does not render them at the same weight:
 * only `mine` can carry the receipt and the invocation, because **the chain carries neither** — it
 * holds the declaration and nothing about how the declaration was arrived at.
 *
 * That asymmetry is the reason the panel exists at all. A chain feed alone would show the last step
 * of the mechanism and none of the rest.
 *
 * ## It records events, never commentary
 *
 * Every entry is something that happened, with the values it happened with: an atom id, a digest, a
 * transaction hash, a cost in wei. **No entry explains a design choice, and none renders a verdict
 * of ours.** The user's standing instruction, given six times — the app is an index, not a display
 * of our reasoning. A line reading `reçu  signé 0x8A18… · sha256 8cfb86…` is a fact. A line reading
 * "receipt verified ✓" is us talking about ourselves, and it does not belong here.
 */
import type {Hex} from "viem";

/** Where an entry came from. `mine` is this browser; `chain` is anybody. */
export type ActivityStream = "mine" | "chain";

/**
 * Which moment of the loop an entry belongs to.
 *
 * The first four are `docs/12`'s own sequence and exist only on `mine`. `confirmed` is a receipt
 * from the chain for something `mine` sent. `landed` is somebody else's write, seen from outside.
 */
export type ActivityStep =
    | "discovery"
    | "access"
    | "receipt"
    | "invocation"
    | "declaration"
    | "confirmed"
    | "landed"
    | "refused";

export type ActivityEvent = {
    /** Monotonic within one store, so a list key is stable across appends. */
    readonly id: number;
    /** Unix milliseconds, from the clock passed in — never `Date.now()` inside a render. */
    readonly at: number;
    readonly stream: ActivityStream;
    readonly step: ActivityStep;
    /** What happened. Two or three words, lowercase, no sentence. */
    readonly label: string;
    /** The values it happened with, already stringified by whoever knew them. */
    readonly detail?: string;
    readonly tx?: Hex;
    /** Wei, as a decimal string. A number would lose precision on any real figure. */
    readonly costWei?: string;
    /**
     * What makes this entry the same event as another one, for a producer that re-reads.
     *
     * Not `tx`: the chain stream comes from the indexer, which reports a triple id and no
     * transaction hash at all. So the key is whatever the producer can recognise — a triple id
     * there, a transaction hash for our own sends — and `tx` stays a display field.
     */
    readonly key?: string;
};

/** What a producer passes. The store assigns the id and the time. */
export type ActivityInput = Omit<ActivityEvent, "id" | "at"> & {at?: number};

/**
 * The newest entries, oldest first, bounded.
 *
 * Bounded because a long session would otherwise grow this without limit and the panel renders all
 * of it. 200 is about twenty loops' worth, which is more than anybody scrolls back through.
 */
const DEFAULT_CAPACITY = 200;

export class ActivityLog {
    private readonly capacity: number;
    private readonly now: () => number;
    private entries: ActivityEvent[] = [];
    private nextId = 1;
    private listeners = new Set<() => void>();

    constructor(options: {capacity?: number; now?: () => number} = {}) {
        this.capacity = options.capacity ?? DEFAULT_CAPACITY;
        this.now = options.now ?? (() => Date.now());
    }

    /** Record something that happened. Returns the entry, so a caller can reference its id. */
    append(input: ActivityInput): ActivityEvent {
        const event: ActivityEvent = {
            ...input,
            id: this.nextId,
            at: input.at ?? this.now(),
        };
        this.nextId += 1;
        // A new array rather than a push: `useSyncExternalStore` compares by reference, and
        // mutating in place would leave the panel showing the previous render's list.
        this.entries = [...this.entries, event].slice(-this.capacity);
        this.emit();
        return event;
    }

    /** Oldest first. The same array identity until something is appended. */
    all(): readonly ActivityEvent[] {
        return this.entries;
    }

    /** Only one stream, for a panel that renders them at different weights. */
    of(stream: ActivityStream): readonly ActivityEvent[] {
        return this.entries.filter((entry) => entry.stream === stream);
    }

    /**
     * Whether an entry with this key is already recorded.
     *
     * The chain poller re-reads a window that overlaps what it read last time, so without this it
     * appends the same write on every tick. A producer asks before appending.
     *
     * Case-folded, because a triple id and a transaction hash both arrive spelled either way.
     */
    has(key: string): boolean {
        const lowered = key.toLowerCase();
        return this.entries.some((entry) => entry.key?.toLowerCase() === lowered);
    }

    clear(): void {
        if (this.entries.length === 0) return;
        this.entries = [];
        this.emit();
    }

    /** Returns the unsubscribe, which is the shape `useSyncExternalStore` wants. */
    subscribe(listener: () => void): () => void {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    }

    private emit(): void {
        for (const listener of this.listeners) listener();
    }
}

/**
 * The app's one log.
 *
 * A singleton because it is one surface: a service that produced its own instance would write into
 * a list nobody renders. Tests build their own `new ActivityLog()` rather than clearing this one.
 */
export const activityLog = new ActivityLog();
