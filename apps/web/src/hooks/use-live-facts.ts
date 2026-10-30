import type {QueryClient} from "@tanstack/react-query";

import {fetchFacts, type FactsAnswer} from "../services/facts-api";

/** Where ARP's Worker answers, or undefined when this build has none — then the bundle is used. */
const API_URL: string | undefined = import.meta.env.VITE_ARP_API_URL;

/**
 * The Worker's facts, read once and shared by every hook that wants them, or `null` when there is
 * no Worker or it did not answer. Through the query client, so two hooks on one page make one
 * request, and a failure is remembered for the same five minutes as a success.
 */
export async function liveFacts(client: QueryClient): Promise<FactsAnswer | null> {
    if (API_URL === undefined || API_URL.trim().length === 0) return null;
    return client.fetchQuery({
        queryKey: ["live-facts", API_URL],
        queryFn: async () => {
            try {
                return await fetchFacts(API_URL);
            } catch {
                // The fallback is the bundled copy, and the page prints its date, so a Worker that
                // is down reads as an older figure rather than as an error.
                return null;
            }
        },
        staleTime: 5 * 60 * 1000,
    });
}
