import {useEffect, useSyncExternalStore} from "react";

import type {ActivityEvent as AgentEvent} from "@arp-protocol/core";

import type {AgentFeed, FeedStatus} from "../services/agent-feed";
import {agentFeed} from "../services/agent-feed-live";

/**
 * The agent's events and the feed's state, re-rendering on each. Mounting it opens the shared
 * connection; the last component to unmount closes it.
 *
 * `feed` defaults to the app's one instance so a test can pass its own.
 */
export function useAgentActivity(feed: AgentFeed = agentFeed): {
    events: readonly AgentEvent[];
    status: FeedStatus;
} {
    useEffect(() => feed.start(), [feed]);
    const events = useSyncExternalStore(
        (onChange) => feed.subscribe(onChange),
        () => feed.all(),
        () => EMPTY,
    );
    const status = useSyncExternalStore(
        (onChange) => feed.subscribe(onChange),
        () => feed.status(),
        () => "off" as const,
    );
    return {events, status};
}

const EMPTY: readonly AgentEvent[] = [];
