import {useQuery} from "@tanstack/react-query";
import {getAtomStanding, type AtomStanding} from "@arp-protocol/core";

import {useChainChoice} from "../lib/chain-choice";
import {DOMAIN_ATTESTOR} from "../services/domain-filter";
import {buildAtomView, type AtomView} from "../services/atom-standing-view";

/**
 * One atom and everything pointing at it.
 *
 * Same shape as the other read hooks: the lifecycle lives here, the work lives in the package and
 * the view service, and the query options are exported separately so the key and the mapping are
 * unit-testable without a DOM.
 */

export type AtomStandingFetcher = (
    atomId: string,
    config: {graphqlUrl: string; limit?: number; attestor?: string},
) => Promise<AtomStanding>;

/** `0x` + 32 bytes. Anything else is a bad route param, not an atom nobody points at. */
export function isAtomId(value: string | undefined): value is string {
    return typeof value === "string" && /^0x[0-9a-fA-F]{64}$/.test(value);
}

/**
 * The chain leads the key.
 *
 * An atom's **id** is chain-independent — `keccak(atomData)` — while its vault and its edges are
 * per chain, so the same id names a different market on each. Without the chain in the key,
 * switching serves the other chain's answer under the new label (`rules/claims.md` §2 in its UI
 * form, and `lib/chain-choice.ts` on why that trap is invisible).
 */
export function atomStandingQueryKey(chainId: number, atomId: string | null) {
    // The attestor is in the key: it decides which outgoing claims come back, so a cached answer
    // read through one address must not be served under another.
    return ["intuition", chainId, "atom-standing", atomId, DOMAIN_ATTESTOR] as const;
}

export function atomStandingQueryOptions(
    chain: {chainId: number; graphqlUrl: string; symbol: string},
    atomId: string | null,
    fetchStanding: AtomStandingFetcher = getAtomStanding,
) {
    return {
        queryKey: atomStandingQueryKey(chain.chainId, atomId),
        queryFn: async (): Promise<AtomView> => {
            if (atomId === null) throw new Error("No atom to read.");
            return buildAtomView(
                await fetchStanding(atomId, {
                    graphqlUrl: chain.graphqlUrl,
                    // Whose positions decide which outgoing claims are ARP's ontology. The same
                    // address `/tools` and the MCP node read through, and not a per-request choice
                    // — a reader who could swap it could make the index say anything.
                    attestor: DOMAIN_ATTESTOR,
                }),
                chain.symbol,
            );
        },
        enabled: atomId !== null,
        // One graph round trip. The edges move when somebody writes or stakes, which is rare enough
        // that a minute of staleness is cheaper than re-asking the indexer on every remount.
        staleTime: 60_000,
        retry: 0,
    };
}

export function useAtomStanding(atomId: string | null) {
    const chain = useChainChoice();
    return useQuery(atomStandingQueryOptions(chain, atomId));
}
