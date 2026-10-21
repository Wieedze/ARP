import {useQuery} from "@tanstack/react-query";
import {getTermActivity, getTermShape, type TermActivityBucket} from "@arp-protocol/core";

import {ERC8004_GRAPHQL_URL} from "../services/erc8004-connector";
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

export function termShapeQueryKey(termId: string | null, curveId: number) {
    return ["intuition", "term-shape", termId ?? "none", curveId] as const;
}

export function termShapeQueryOptions(
    termId: string | null,
    curveId: number,
    read: {
        shape: typeof getTermShape;
        activity: typeof getTermActivity;
    } = {shape: getTermShape, activity: getTermActivity},
) {
    return {
        queryKey: termShapeQueryKey(termId, curveId),
        queryFn: async (): Promise<TermInsight> => {
            if (termId === null) throw new Error("no term");
            const [shape, curve] = await Promise.all([
                read.shape(termId, {graphqlUrl: ERC8004_GRAPHQL_URL, curveId}),
                read.activity(termId, {
                    graphqlUrl: ERC8004_GRAPHQL_URL,
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
    return useQuery(termShapeQueryOptions(termId, curveId));
}
