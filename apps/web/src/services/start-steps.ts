/**
 * The steps of each `/start/<profile>` path, and which of them ARP can see done (task 53b).
 *
 * A step ticks itself only from something a program recorded: the local feed is reachable, a skill
 * was served with a receipt, the hook recorded a call, a declaration was sent. Nothing ticks
 * because the visitor clicked. A step nothing can observe carries `done: null` and shows no tick.
 *
 * No React: the page owns the feed's lifecycle and passes what it reads.
 */
import type {ActivityEvent} from "@arp-protocol/core";

import type {StartProfile} from "../lib/start-paths";
import type {FeedStatus} from "./agent-feed";

export type StartStep = {
    id: string;
    title: string;
    /** `null` when nothing ARP reads can show the step done. */
    done: boolean | null;
    command?: string;
    /** Words to say to Claude, not a shell command. */
    prompt?: string;
    link?: {to: string; label: string};
    hint?: string;
};

export type StartSignals = {
    feed: FeedStatus;
    events: readonly ActivityEvent[];
};

/** An everyday need the catalogue covers, from the demo plan (`docs/26` §3). */
export const EXAMPLE_PROMPT = "Make me a YouTube thumbnail for a video about sourdough bread.";

/** No chain word: the Claude path promises none on screen (task 45, `docs/tasks/53` §3). */
const FREE: StartStep = {id: "free", title: "Free for now. Nothing to pay.", done: true};

function declared(events: readonly ActivityEvent[]): boolean {
    return events.some(
        (event) =>
            event.source === "sent" &&
            event.status === "success" &&
            (event.decoded.fn === "createTriples" || event.decoded.fn === "deposit"),
    );
}

export function stepsFor(profile: StartProfile, signals: StartSignals): StartStep[] {
    const live = signals.feed === "live";
    const has = (source: ActivityEvent["source"]) =>
        signals.events.some((event) => event.source === source);

    switch (profile) {
        case "claude":
            return [
                FREE,
                {
                    id: "connect",
                    title: "Add ARP to Claude, and connect your agent",
                    done: live,
                    command: "arp init --project --sponsored --runtime claude",
                    hint: "Not published yet: ARP runs from a local build, in Claude Code or as a Desktop extension.",
                },
                {
                    id: "ask",
                    title: "Ask Claude for something it cannot do alone",
                    done: has("receipt"),
                    prompt: EXAMPLE_PROMPT,
                },
                {
                    id: "declare",
                    title: "Your first declaration",
                    done: declared(signals.events),
                    link: {to: "/activity", label: "See it in activity"},
                },
            ];
        case "agent":
            return [
                FREE,
                {
                    id: "init",
                    title: "Install ARP in your project",
                    done: live,
                    command: "arp init --project --sponsored",
                    hint: "The CLI is not on npm yet: it runs from a local build.",
                },
                {
                    id: "run",
                    title: "Run your agent. The hook records each call on your machine.",
                    done: has("session"),
                },
                {
                    id: "status",
                    title: "Is it you, or is it broken for everyone?",
                    done: null,
                    command: "arp status",
                },
            ];
        case "tool":
            return [
                FREE,
                {
                    id: "find",
                    title: "Find your tool by its URL",
                    // Submitting leaves this page for `/search`, so nothing here can see it done.
                    done: null,
                },
                {
                    id: "add",
                    title: "Not listed yet? Add it",
                    // The form answers in place (task 53c); the step itself observes nothing.
                    done: null,
                },
            ];
    }
}
