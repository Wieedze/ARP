import {useQuery} from "@tanstack/react-query";
import {getTermValueHistory, type TermValuePoint} from "@arp-protocol/core";

import {useChainChoice} from "../lib/chain-choice";

/**
 * A vault's value over time — the line beside the number.
 *
 * Separate from `useTermShape`, which reads the shape and the **activity**. Those answer "who holds
 * this and how busy is it"; this answers "what is it worth", and the two cannot share a query
 * because activity's volume is absolute — a redemption adds to it — while value needs the
 * direction. Keeping them apart also means a term with no value line still renders its shape.
 *
 * The chain is in the key: the same term id names a different vault on each (`chain-choice`).
 */
export function termValueQueryKey(chainId: number, termId: string | null, curveId: string) {
    return ["intuition", chainId, "term-value", termId ?? "none", curveId] as const;
}

export function termValueQueryOptions(
    chain: {chainId: number; graphqlUrl: string},
    termId: string | null,
    curveId: bigint | undefined,
    read: typeof getTermValueHistory = getTermValueHistory,
) {
    return {
        queryKey: termValueQueryKey(chain.chainId, termId, String(curveId ?? "none")),
        queryFn: async (): Promise<TermValuePoint[]> => {
            if (termId === null || curveId === undefined) throw new Error("no term");
            return read(termId, curveId, {graphqlUrl: chain.graphqlUrl});
        },
        // Nothing is read until the curve is known. Defaulting to 1 while the session loads would
        // draw one curve's line and then silently redraw it as another's — the reason
        // `AtomMarket` already waits for `session` before its shape read.
        enabled: termId !== null && curveId !== undefined,
        staleTime: 120_000,
        retry: 1,
    };
}

export function useTermValue(termId: string | null, curveId: bigint | undefined) {
    const chain = useChainChoice();
    return useQuery(termValueQueryOptions(chain, termId, curveId));
}
