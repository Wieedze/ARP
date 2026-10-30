import {keepPreviousData, useQuery} from "@tanstack/react-query";
import {useChainChoice} from "../lib/chain-choice";
import type {AgentListOrder, AgentPage, ListAgentsOptions} from "@arp-protocol/core";

import {buildCohortView, type CohortView} from "../services/agent-cohort";
import {fetchAgentCohort} from "../services/erc8004-connector";

/**
 * The directory's read.
 *
 * Lifecycle here, work in the services: the hook calls the connector and hands
 * the page to `buildCohortView`. The options are exported separately so the
 * key, the paging and the mapping are testable without a DOM.
 */

export type AgentCohortFetcher = (
    options: ListAgentsOptions,
    graphqlUrl?: string,
) => Promise<AgentPage>;

/** 25 rows — dense enough to show the shape of the cohort, small enough to stay one read. */
export const COHORT_PAGE_SIZE = 25;

/**
 * Order and offset are both in the key.
 *
 * Two orders of the same cohort are two different sequences, not two views of
 * one, so a page from one must never be served from cache for the other.
 */
/**
 * The chain is in the key. Without it, switching serves the other chain's answer from cache under
 * the new label — `rules/claims.md` §2 as a page (`lib/chain-choice.ts`).
 */
export function agentCohortQueryKey(chainId: number, order: AgentListOrder, offset: number) {
    return ["erc8004", chainId, "agent-cohort", order, COHORT_PAGE_SIZE, offset] as const;
}

export function agentCohortQueryOptions(
    chain: {chainId: number; graphqlUrl: string; symbol: string},
    order: AgentListOrder,
    offset: number,
    fetchCohort: AgentCohortFetcher = fetchAgentCohort,
) {
    return {
        queryKey: agentCohortQueryKey(chain.chainId, order, offset),
        queryFn: async (): Promise<CohortView> =>
            buildCohortView(
                await fetchCohort({order, limit: COHORT_PAGE_SIZE, offset}, chain.graphqlUrl),
                chain.symbol,
            ),
        // One graph read per page, and the cohort moves on the order of days.
        staleTime: 60_000,
        retry: 1,
        // Paging keeps the previous page on screen rather than replacing a list
        // with a loading state on every click.
        placeholderData: keepPreviousData,
    };
}

export function useAgentCohort(order: AgentListOrder, offset: number) {
    const chain = useChainChoice();
    return useQuery(agentCohortQueryOptions(chain, order, offset));
}
