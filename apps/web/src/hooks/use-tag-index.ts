import {useQuery} from "@tanstack/react-query";
import {toolsInDomain, type DomainTree} from "@arp-protocol/core";

import {useChainChoice} from "../lib/chain-choice";
import {domainsConfigFor, DOMAIN_ROOT} from "../services/domain-filter";

/**
 * Every tagged tool, grouped by the domain it is filed under — read **once**.
 *
 * One query for the whole index rather than one per domain, and that is what makes a multi-select
 * rail possible at all: a reader ticking a fourth domain gets an instant answer instead of a fourth
 * round trip, and every domain can show its count without 21 queries to fill a sidebar.
 *
 * `toolsInDomain` asked for the root returns every tool under it with its own domain on each row,
 * so the grouping costs nothing extra. It pages — the indexer caps `triples` at 250 and ARP holds
 * ~700 tag positions, so a single request would have returned a third of the index with nothing to
 * say so.
 *
 * Lifecycle here, work in the protocol package (`rules/portability.md`).
 */

export type TagIndex = {
    /** Domain label → the atom ids filed directly under it. */
    byDomain: Map<string, Set<string>>;
    /** How many tools are filed under a domain **and everything beneath it**. */
    countFor: (domain: string, tree: DomainTree | undefined) => number;
    /** The atom ids under any of `domains`, subtrees included. `null` when nothing is picked. */
    idsUnder: (domains: readonly string[], tree: DomainTree | undefined) => Set<string> | null;
};

function emptyIndex(): TagIndex {
    return {byDomain: new Map(), countFor: () => 0, idsUnder: () => null};
}

function indexOf(byDomain: Map<string, Set<string>>): TagIndex {
    const union = (domains: readonly string[], tree: DomainTree | undefined): Set<string> => {
        const out = new Set<string>();
        for (const domain of domains) {
            // A domain stands for its subtree: ticking `payment` has to include `card`, which is
            // the only reason the hierarchy is on chain at all.
            const labels = tree === undefined ? [domain] : tree.subtree(domain);
            for (const label of labels) {
                for (const id of byDomain.get(label) ?? []) out.add(id);
            }
        }
        return out;
    };
    return {
        byDomain,
        countFor: (domain, tree) => union([domain], tree).size,
        idsUnder: (domains, tree) => (domains.length === 0 ? null : union(domains, tree)),
    };
}

export function useTagIndex(tree: DomainTree | undefined) {
    const chain = useChainChoice();
    const query = useQuery({
        queryKey: ["tag-index", chain.graphqlUrl],
        queryFn: async () => {
            if (tree === undefined) return new Map<string, Set<string>>();
            const {tools} = await toolsInDomain(domainsConfigFor(chain.graphqlUrl), DOMAIN_ROOT, {
                tree,
            });
            const byDomain = new Map<string, Set<string>>();
            for (const tool of tools) {
                const set = byDomain.get(tool.domain) ?? new Set<string>();
                set.add(tool.atomId.toLowerCase());
                byDomain.set(tool.domain, set);
            }
            return byDomain;
        },
        enabled: tree !== undefined,
        // Tags move when ARP files one, which is rare. The catalogue's own figures move faster.
        staleTime: 5 * 60 * 1000,
    });
    return {
        index: query.data === undefined ? emptyIndex() : indexOf(query.data),
        isLoading: query.isLoading,
        error: query.error instanceof Error ? query.error : null,
    };
}
