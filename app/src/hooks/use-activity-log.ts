import {useSyncExternalStore} from "react";

import {activityLog, type ActivityEvent, type ActivityLog} from "../services/activity-log";

/**
 * The log's entries, re-rendering when something is appended.
 *
 * The only thing in this file: `rules/code.md` says a hook is the one place allowed to bridge a
 * service to React, and it owns lifecycle and nothing else. The store decides what an entry is, the
 * component decides how it reads, and neither knows about the other.
 *
 * `useSyncExternalStore` rather than `useState` + an effect, because the store is already a
 * subscribable and re-implementing that in an effect is how a render ends up one append behind.
 * It compares the snapshot by reference, which is why `ActivityLog.append` hands out a new array.
 *
 * `log` is a parameter with the singleton as its default so a test can pass its own instance
 * without touching the app's.
 */
export function useActivityLog(log: ActivityLog = activityLog): readonly ActivityEvent[] {
    return useSyncExternalStore(
        (onChange) => log.subscribe(onChange),
        () => log.all(),
        // The server snapshot. The app does not render on a server, and returning the same empty
        // array keeps this honest if it ever does — a fresh `[]` here would loop on hydration.
        () => EMPTY,
    );
}

const EMPTY: readonly ActivityEvent[] = [];
