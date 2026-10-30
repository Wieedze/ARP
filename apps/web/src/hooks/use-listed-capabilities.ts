import {useQuery} from "@tanstack/react-query";
import {getListedCapabilitiesFor} from "@arp-protocol/core";

import {useChainChoice} from "../lib/chain-choice";

/** One agent's glyph input, read the way the directory reads its rows' (`getListedCapabilitiesFor`). */
export function useListedCapabilities(subjectId: string | null) {
    const chain = useChainChoice();
    return useQuery({
        queryKey: ["intuition", chain.chainId, "listed-capabilities", subjectId],
        queryFn: async () =>
            subjectId === null
                ? []
                : getListedCapabilitiesFor(subjectId, {graphqlUrl: chain.graphqlUrl}),
        enabled: subjectId !== null,
        staleTime: 120_000,
        retry: 1,
    });
}
