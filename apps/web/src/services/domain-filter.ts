import {
    DomainTree,
    INTUITION_HAS_TAG_MAINNET,
    INTUITION_IS_A_SUB_DOMAIN_OF,
    type DomainsConfig,
} from "@arp-protocol/core";

/**
 * The domain filter on `/tools` — narrowing the catalogue by what a tool is **for**.
 *
 * The one read on this page that answers a question no other listing can. npm's search for
 * "payment" returns 25,501 rows ranked on the string, including `@types/payment`; the MCP registry
 * holds 11,582 servers with no field for what they do. Here a reader names a need and the subtree
 * under it is walked before anything is ranked.
 *
 * **It is the same function the MCP node calls.** `toolsInDomain` lives in the protocol package
 * (`rules/portability.md`), so an agent asking `arp_find_tools { domain }` and a human moving this
 * control get the same answer from the same code. No second implementation to drift.
 *
 * Lifecycle in the hook, work here: this module is pure TypeScript and imports no React.
 */

/**
 * The address whose positions define the index this app reads.
 *
 * **Not a user-facing choice**, and that is the safety net (the user, 2026-10-28): `has tag` and the
 * hierarchy are permissionless to write, so the filings are only an index when read through one
 * chosen set of positions. A reader who could swap the attestor could make the index say anything.
 * The MCP node holds the same value under `ARP_DOMAIN_ATTESTOR`, and the two must not drift.
 *
 * Checksummed, because the indexer's `positions.account_id` is and a lowercase filter returns zero
 * rows — which reads as "ARP has filed nothing" rather than as a bad query.
 */
export const DOMAIN_ATTESTOR = "0x906f3A52ec089f8D4E9127F91C6bE5Ae0d18f91f";

/** The label every domain path climbs to. A convention, and the one arbitrary choice here. */
export const DOMAIN_ROOT = "tool";

/** `all` is not a domain — it is the absence of the filter, and it is the default. */
export type DomainChoice = string | "all";

export function domainsConfigFor(graphqlUrl: string): DomainsConfig {
    return {
        graphqlUrl,
        hierarchyPredicate: INTUITION_IS_A_SUB_DOMAIN_OF,
        // The `Keywords` atom, on both chains. Measured 2026-10-28: it carries 58,064 edges on
        // mainnet and 52,781 on testnet, against 1,285 and 311 for the other atom with that label.
        tagPredicate: INTUITION_HAS_TAG_MAINNET,
        root: DOMAIN_ROOT,
        attestor: DOMAIN_ATTESTOR,
    };
}

/**
 * The domains a reader can pick, flattened from the tree and ordered for a list rather than for a
 * traversal: depth first from the root, so a child sits under its parent.
 *
 * `depth` is carried rather than rendered as indentation by the caller guessing: a flat `<select>`
 * cannot show a tree, and prefixing a child's label is the only honest way to say `card` is under
 * `payment` in one line of text.
 */
export type DomainOption = {label: string; depth: number};

export function domainOptionsOf(tree: DomainTree, root: string = DOMAIN_ROOT): DomainOption[] {
    const out: DomainOption[] = [];
    // `subtree` is already ancestry-bounded, so a cycle cannot hang this. Depth comes from the
    // path rather than from the walk, because `subtree` flattens and does not report it.
    for (const label of tree.subtree(root)) {
        if (label === root) continue;
        const path = tree.pathToRoot(label);
        out.push({label, depth: path.found ? path.path.length - 1 : 1});
    }
    return out.sort((left, right) => left.label.localeCompare(right.label));
}
