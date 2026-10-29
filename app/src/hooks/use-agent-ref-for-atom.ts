import {useQuery} from "@tanstack/react-query";
import {resolveAgentRefForAtom} from "@arp-protocol/core";

import {useChainChoice} from "../lib/chain-choice";

/**
 * The ERC-8004 identity an atom stands for, when it is an agent's.
 *
 * It exists so an agent has **one** page. The directory knows an agent's `chainId/tokenId` and
 * links to the trust panel; a capability search and the claim field know only its atom id and
 * linked to the atom page — the same agent, two destinations, depending on where you clicked.
 *
 * `null` means "no identity found", **never** "not an agent": ARP's own testnet rig agents have no
 * `same as` edge at all (`tasks/19` step 1b), so on 13579 this answers `null` for agents that
 * plainly are agents. The page degrades to the atom view there, which is a complete view.
 */
export function agentRefForAtomQueryKey(chainId: number, atomId: string | null) {
    return ["intuition", chainId, "agent-ref-for-atom", atomId ?? "none"] as const;
}

export function agentRefForAtomQueryOptions(
    chain: {chainId: number; graphqlUrl: string},
    atomId: string | null,
    read: typeof resolveAgentRefForAtom = resolveAgentRefForAtom,
) {
    return {
        queryKey: agentRefForAtomQueryKey(chain.chainId, atomId),
        queryFn: async () => {
            if (atomId === null) throw new Error("no atom");
            return read(atomId, {graphqlUrl: chain.graphqlUrl});
        },
        enabled: atomId !== null,
        // An atom's identity does not change: the id is a pure function of the atom's data and the
        // `same as` edge, once written, is permanent (Intuition has no deletion).
        staleTime: Number.POSITIVE_INFINITY,
        retry: 1,
    };
}

export function useAgentRefForAtom(atomId: string | null) {
    const chain = useChainChoice();
    return useQuery(agentRefForAtomQueryOptions(chain, atomId));
}
