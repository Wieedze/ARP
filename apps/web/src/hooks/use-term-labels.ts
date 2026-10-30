import {useQuery} from "@tanstack/react-query";
import {getTermLabels} from "@arp-protocol/core";

import {useChainChoice} from "../lib/chain-choice";
import type {TermName} from "../services/agent-feed";

const NONE: ReadonlyMap<string, TermName> = new Map();

/**
 * What the chosen chain's indexer calls each id — `Agent 13579:8`, or a triple's three labels.
 * Read on the chain the toggle names, so switching it renames everything in one move.
 */
export function useTermLabels(ids: readonly string[]): ReadonlyMap<string, TermName> {
    const chain = useChainChoice();
    const sorted = [...new Set(ids.map((id) => id.toLowerCase()))].sort();
    const query = useQuery({
        queryKey: ["term-labels", chain.chainId, sorted.join(",")],
        queryFn: () => getTermLabels(sorted, {graphqlUrl: chain.graphqlUrl}),
        enabled: sorted.length > 0,
        // A label is set when the atom is created and does not change.
        staleTime: Infinity,
    });
    return query.data ?? NONE;
}
