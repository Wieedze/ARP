import {useQuery} from "@tanstack/react-query";
import {readDomainTree, type DomainTree} from "@arp-protocol/core";

import {useChainChoice} from "../lib/chain-choice";
import {domainOptionsOf, domainsConfigFor, type DomainOption} from "../services/domain-filter";

/**
 * The domain tree, and the tools under one domain.
 *
 * Two queries rather than one, because they have different lifetimes: the tree changes when ARP
 * files a domain, which is rare, while the set of tools under a domain changes whenever anybody
 * tags one. Folding them into a single key would refetch the tree on every pick.
 *
 * Lifecycle here, work in `services/domain-filter.ts` and in the protocol package.
 */

export type DomainTreeQuery = {
    tree: DomainTree | undefined;
    options: DomainOption[];
    error: Error | null;
};

export function useDomainTree(): DomainTreeQuery {
    const chain = useChainChoice();
    const query = useQuery({
        queryKey: ["domain-tree", chain.graphqlUrl],
        queryFn: () => readDomainTree(domainsConfigFor(chain.graphqlUrl)),
        // The tree is 17 triples read through one address's positions. It does not move on its own.
        staleTime: 5 * 60 * 1000,
    });
    return {
        tree: query.data,
        options: query.data === undefined ? [] : domainOptionsOf(query.data),
        error: query.error instanceof Error ? query.error : null,
    };
}
