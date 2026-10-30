import {useEffect} from "react";
import {useQuery} from "@tanstack/react-query";
import type {Hex} from "viem";

import {useChainChoice} from "../lib/chain-choice";
import {activityLog, type ActivityLog} from "../services/activity-log";
import {recentQueryOptions, type RecentFetcher} from "./use-recent-declarations";

/**
 * Feed the activity log with declarations that landed on the chain, whoever wrote them.
 *
 * It **reuses** `recentQueryOptions` rather than polling the indexer itself: the same read already
 * exists for the landing page, and a second query against the same URL with its own cadence would
 * double the indexer traffic to show the same rows.
 *
 * ## What this stream can and cannot carry
 *
 * The declaration, and nothing about how it was arrived at. The chain holds
 * `(agent, uses, tool)` — not the receipt, not the hook's log, not the discovery query. So an entry
 * here is always `landed` and never `receipt` or `invocation`: those exist only for what this
 * browser did, which is the `mine` stream.
 *
 * Saying that is the point of having two streams. A chain feed on its own would show the last step
 * of the mechanism and none of the rest.
 *
 * ## Why the refetch interval is short and the staleTime is not
 *
 * `recentQueryOptions` sets a minute of staleness, which is right for a page that renders the list
 * once. A panel that is supposed to look live wants to notice a write sooner, so this overrides the
 * interval and leaves the cache shared — the landing page keeps serving from the same rows.
 */
const POLL_MS = 15_000;

export function useChainActivity(
    options: {
        log?: ActivityLog;
        limit?: number;
        fetchRecent?: RecentFetcher;
        enabled?: boolean;
    } = {},
) {
    const chain = useChainChoice();
    const log = options.log ?? activityLog;
    const limit = options.limit ?? 8;

    const query = useQuery({
        ...recentQueryOptions(chain, limit, options.fetchRecent),
        refetchInterval: POLL_MS,
        enabled: options.enabled ?? true,
    });

    useEffect(() => {
        const rows = query.data;
        if (rows === undefined) return;
        // Oldest first, so appending in order leaves the panel reading top to bottom like the rest
        // of the log. The indexer returns newest first.
        for (const row of [...rows].reverse()) {
            // Keyed on the triple id, which every row has, rather than on `txHash`, which can be
            // null — and every poll re-reads a window that overlaps the last one.
            if (log.has(row.tripleId)) continue;
            const at = Date.parse(row.at);
            log.append({
                stream: "chain",
                step: "landed",
                label: "uses",
                // The chain's own values, nothing composed: who, what, and what stands behind it.
                // `positions` and never the amount — a term is born holding `minShare`, so an
                // unbacked claim still reports a non-zero figure (ADR `0042`).
                detail: `${row.subject.label ?? row.subject.atomId} → ${
                    row.object.label ?? row.object.atomId
                } · ${row.positions} position${row.positions === 1 ? "" : "s"}`,
                key: row.tripleId,
                // The chain it was read on, always, so the bar can follow the toggle; and the
                // indexer's own record of the transaction, so the line opens on the explorer.
                chainId: chain.chainId,
                ...(row.txHash !== null && /^0x[0-9a-fA-F]{64}$/.test(row.txHash)
                    ? // Matched against a 32-byte hex pattern on the line above.
                      {tx: row.txHash as Hex}
                    : {}),
                ...(Number.isNaN(at) ? {} : {at}),
            });
        }
    }, [query.data, log, chain.chainId]);

    return query;
}
