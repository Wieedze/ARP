import {useQuery} from "@tanstack/react-query";
import {getRecentStakes, type RecentStake} from "@arp-protocol/core";

import {useChainChoice} from "../lib/chain-choice";
import {chainFacts, type ChainFact} from "../services/chain-facts-view";
import {recentQueryOptions, type RecentFetcher} from "./use-recent-declarations";

export type StakesFetcher = (config: {
    graphqlUrl: string;
    limit?: number;
}) => Promise<RecentStake[]>;

export type ChainReads = {fetchRecent?: RecentFetcher; fetchStakes?: StakesFetcher};

/** The bar polls at this cadence too; a page that claims to be live should not lag it. */
const POLL_MS = 15_000;
const LIMIT = 50;

/**
 * Every identified agent's declarations and stakes on the chosen chain, re-read every fifteen
 * seconds. `status` is `error` when either read failed and `pending` while either is in flight, so
 * rows on screen with `error` beside them are incomplete, not the whole answer.
 */
export function useChainFacts(reads: ChainReads = {}): {
    facts: ChainFact[];
    status: "pending" | "error" | "success";
} {
    const chain = useChainChoice();
    const declarations = useQuery({
        ...recentQueryOptions(chain, LIMIT, reads.fetchRecent),
        refetchInterval: POLL_MS,
    });
    const fetchStakes = reads.fetchStakes ?? getRecentStakes;
    const stakes = useQuery({
        queryKey: ["intuition", chain.chainId, "recent-stakes", LIMIT] as const,
        queryFn: () => fetchStakes({graphqlUrl: chain.graphqlUrl, limit: LIMIT}),
        refetchInterval: POLL_MS,
        retry: 0,
    });
    return {
        facts: chainFacts(declarations.data ?? [], stakes.data ?? [], LIMIT),
        status:
            declarations.status === "error" || stakes.status === "error"
                ? "error"
                : declarations.status === "pending" || stakes.status === "pending"
                  ? "pending"
                  : "success",
    };
}
