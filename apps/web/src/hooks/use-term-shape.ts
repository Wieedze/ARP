import {useQuery} from "@tanstack/react-query";
import {getTermActivity, getTermShape, type TermActivityBucket} from "@arp-protocol/core";

import {useChainChoice} from "../lib/chain-choice";
import {buildTermShapeView, type TermShapeView} from "../services/term-shape-view";

/**
 * A claim's shape and its curve, read together.
 *
 * Two queries because they answer two questions and either is useful without the other, but one
 * hook because a page that showed the concentration before the curve arrived would reflow twice.
 *
 * Not fetched on mount of the catalogue — only on a tool's own page. The shape read costs one
 * aggregate plus one batched breadth request per term, and running it for every row of a list would
 * be a fan-out nobody asked for.
 */
export type TermInsight = {shape: TermShapeView; curve: TermActivityBucket[]};

/** The chain is in the key: the same term id names two different vaults (see `chain-choice`). */
export function termShapeQueryKey(chainId: number, termId: string | null, curveId: number) {
    return ["intuition", chainId, "term-shape", termId ?? "none", curveId] as const;
}

export function termShapeQueryOptions(
    chain: {chainId: number; graphqlUrl: string},
    termId: string | null,
    curveId: number,
    read: {
        shape: typeof getTermShape;
        activity: typeof getTermActivity;
    } = {shape: getTermShape, activity: getTermActivity},
) {
    return {
        queryKey: termShapeQueryKey(chain.chainId, termId, curveId),
        queryFn: async (): Promise<TermInsight> => {
            if (termId === null) throw new Error("no term");
            const [shape, curve] = await Promise.all([
                read.shape(termId, {graphqlUrl: chain.graphqlUrl, curveId}),
                read.activity(termId, {
                    graphqlUrl: chain.graphqlUrl,
                    curveId,
                    grain: "week",
                    buckets: 26,
                }),
            ]);
            return {shape: buildTermShapeView(shape), curve};
        },
        enabled: termId !== null,
        staleTime: 120_000,
        retry: 1,
    };
}

export function useTermShape(termId: string | null, curveId: number) {
    const chain = useChainChoice();
    return useQuery(termShapeQueryOptions(chain, termId, curveId));
}
