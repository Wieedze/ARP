import {createGraphqlTransport, type GraphqlTransport} from "./sources/intuition/graphql.js";
import {defaultFetch, type FetchLike} from "./http.js";
import {isRecord, readNumber, readString} from "./json.js";

/**
 * The domain tree, read off the chain and traversed both ways.
 *
 * This is what lets a caller ask by **need** rather than by atom id. `listTools` answers "what
 * tools exist"; nothing answered "what tools are for taking a payment", and that gap is the one
 * thing standing between the registry and an agent that can use it.
 *
 * Two traversals, over one set of triples (`docs/18_THE_DOMAIN_TREE.md`):
 *
 *   - **down** — a domain to every tool under it, at any depth. What a search needs.
 *   - **up** — a domain to the root, triple by triple. The witness an agent presents, because the
 *     MultiVault has no reverse index and the contract cannot discover the path itself.
 *
 * No chain constant and no deployment lookup: the caller passes `graphqlUrl` and the predicates,
 * because this package must stay portable (`rules/portability.md` rule 1) and because the
 * hierarchy predicate exists on testnet 13579 and nowhere on mainnet 1155 as of 2026-10-28.
 */

const DEFAULT_TIMEOUT_MS = 10_000;

/** The indexer's hard page cap, re-stated here rather than imported to keep this module free of a
 *  dependency on the tool listing. See `tool-listing.ts` for how it was probed. */
const MAX_PAGE = 250;
/** Eight pages at the cap. ARP holds ~700 tag positions on 13579 today and the set grows. */
const DEFAULT_MAX_TAGGED = 2_000;

/**
 * **Our** tree: the hierarchy triples the attestor holds a position on.
 *
 * It starts from the positions, not from the predicate, and that inversion is the whole design
 * (the user, 2026-10-28): _« on crée ou on se positionne, et ça nous permet de faire le scope des
 * domaines existants dans ARP »_. Creating a term with `cost + minDeposit` gives the creator a
 * position, so **create and back are the same act** as far as the tree is concerned — and creating
 * with `cost` alone gives zero positions, so such a term is on the chain and not in the tree.
 *
 * Measured on testnet 13579, 2026-10-28: the predicate carries 60 triples, 18 of which carry an ARP
 * position. Reading from the positions returns those 18 and nothing else — no `governance`, no
 * `rehearsal`, no `motion design`, with no filtering logic at all. Reading from the predicate
 * returned all 60 and needed a rule to sort them out, which is the rule this replaces.
 *
 * It also scales with **our** tree rather than with the predicate's popularity, which is why it is
 * the default path and not an optimisation.
 *
 * **`shares > 0` is load-bearing, not hygiene.** Redeeming a position in full leaves the row behind
 * with `shares: "0"` rather than removing it — verified on testnet 13579 on 2026-10-28 immediately
 * after retiring `card-payment is a sub-domain of payment`. Without this clause the tree still
 * contained the triple whose position had just been redeemed, so the one mechanism that makes the
 * tree editable would have silently done nothing. Liquid-Demo's `attestorShares > 0n` is the same
 * check, one layer down.
 */
const OUR_HIERARCHY_QUERY = `query($pid: String!, $who: String!, $limit: Int!, $offset: Int!) {
  positions(
    where: {
      account_id: {_eq: $who}
      shares: {_gt: "0"}
      term: {triple: {predicate_id: {_eq: $pid}}}
    }
    limit: $limit
    offset: $offset
    order_by: {id: asc}
  ) {
    shares
    term {
      triple {
        term_id
        subject { term_id data label }
        object { term_id data label }
      }
    }
  }
}`;

/** Every hierarchy triple on the chain, whoever published it. The unfiltered view, for showing a
 *  reader what else exists beside our reading — never for building the tree. */
const ALL_HIERARCHY_QUERY = `query($pid: String!, $limit: Int!, $offset: Int!) {
  triples(where: {predicate_id: {_eq: $pid}}, limit: $limit, offset: $offset, order_by: {term_id: asc}) {
    term_id
    subject { term_id data label }
    object { term_id data label }
    term { vaults { position_count total_shares } }
  }
}`;

/**
 * The `has tag` triples pointing at a set of domains, with whether the attestor backs each one.
 *
 * **The tag is part of the index, not part of the reputation**, and that distinction decides the
 * filter. A tag says "this tool is about payments" — a filing decision. The quality signal in ARP is
 * the `uses` declaration and the TRUST behind it, which stays open to everybody. An index anybody
 * can write into is not an index: without this, `(anything, has tag, payment)` would appear in a
 * search for payment tools, published by anyone, for the price of one triple.
 *
 * An earlier version read tags openly on the reasoning that other people's claims are the content
 * ARP exists to surface. True of claims, false of filing — and it left the boundary inconsistent:
 * the hierarchy was attestor-scoped, so nobody could move `card` out from under `payment`, while
 * anyone could hang anything under `card`. A locked door beside an open window.
 *
 * It silences nobody. Disagreement with ARP's filing is a deposit on the tag's **counter-triple**,
 * which every triple is born with, and a different filing is a tag under a different attestor. Both
 * are readable here — `attestorBacked` is reported per row rather than used to drop rows, so a
 * caller chooses between ARP's index and the whole graph without either being hidden.
 *
 * Measured on testnet 13579, 2026-10-28: 97 `has tag` triples point at ARP's 53 tool atoms and all
 * 97 carry an ARP position. So the exposure is latent today, and becomes live the first time
 * somebody else uses the registry.
 */
/**
 * **The indexer caps this at 250 rows** whatever `limit` asks for, so it is read page by page.
 *
 * Without `offset` this returned a prefix and said nothing: measured on testnet 13579, 2026-10-29,
 * ARP holds ~700 `has tag` positions, so a reader asking for the root got 250 of them and a tree
 * that silently lost two thirds of its leaves. `order_by: term_id` makes the paging stable —
 * without it two pages can repeat or skip a row and the caller cannot tell which.
 *
 * The cap is **per table**: the same indexer caps `positions` at 100. Neither number may be reused
 * for the other query without measuring it.
 */
const TAGGED_QUERY = `query($pid: String!, $domains: [String!], $limit: Int!, $offset: Int!, $who: String!) {
  triples(
    where: {predicate_id: {_eq: $pid}, object: {data: {_in: $domains}}}
    limit: $limit
    offset: $offset
    order_by: {term_id: asc}
  ) {
    term_id
    subject { term_id label value { thing { url name } } }
    object { data }
    term {
      vaults {
        position_count
        total_shares
        positions(where: {account_id: {_eq: $who}, shares: {_gt: "0"}}) { shares }
      }
    }
  }
}`;

export type DomainsConfig = {
    graphqlUrl: string;
    /**
     * The address whose positions define the tree. **Checksummed**, not lowercased.
     *
     * The indexer is inconsistent about case between its own tables: `atoms.creator_id` comes back
     * lowercase and `positions.account_id` comes back checksummed. A filter written in the wrong
     * case returns **zero rows**, which reads as "nobody has a position" rather than as a bad
     * query — it cost one wrong conclusion on 2026-10-28 before the shape was checked.
     *
     * Omit it to read every hierarchy triple on the chain, whoever published it. That view is for
     * showing a reader what else exists; it is not the tree.
     */
    attestor?: string;
    /** `is a sub-domain of`. Required: it is not the same atom on every chain, and on mainnet 1155
     *  no atom carries the phrase at all. */
    hierarchyPredicate: string;
    /** `has tag`. Required for the same reason — two atoms carry that label. */
    tagPredicate: string;
    /** The label every path climbs to. */
    root: string;
    fetch?: FetchLike;
    timeoutMs?: number;
    transport?: GraphqlTransport;
};

/** One hierarchy triple, with what stands behind it. */
export type HierarchyTriple = {
    tripleId: string;
    child: string;
    parent: string;
    positions: number;
    shares: bigint;
};

/** A tool found under a domain. */
export type TaggedTool = {
    atomId: string;
    /** The domain whose `has tag` triple named it — the deepest one, never an ancestor (ADR 0074). */
    domain: string;
    hostedAt: string | null;
    label: string | null;
    tripleId: string;
    positions: number;
    /** Does the attestor back this filing? False means somebody else published it. */
    attestorBacked: boolean;
};

export type PathResult =
    | {found: true; path: string[]}
    | {found: false; reason: "unknown" | "unparented" | "tied" | "cycle"; at: string; detail: string};

/**
 * Does this triple carry a path?
 *
 * **At least one position, not more than one.** `assets = cost + minDeposit` gives the creator
 * exactly one position and `assets = cost` gives zero (`declare/multivault.ts`, measured on testnet
 * 13579 2026-10-20), so one is what separates "somebody paid for this triple" from "this triple was
 * created and abandoned". The first version of this rule used `> 1` and reported four freshly
 * created triples as carrying nothing.
 *
 * Counter-triples are excluded by the query, not here: a counter-triple holds its own term id and a
 * filter on `predicate_id` does not return it.
 */
function authorises(triple: HierarchyTriple): boolean {
    return triple.positions >= 1;
}

export class DomainTree {
    private readonly parents = new Map<string, HierarchyTriple[]>();
    private readonly children = new Map<string, string[]>();

    private constructor(
        private readonly root: string,
        readonly triples: readonly HierarchyTriple[],
    ) {
        for (const triple of triples) {
            if (!authorises(triple)) continue;
            this.parents.set(triple.child, [...(this.parents.get(triple.child) ?? []), triple]);
            this.children.set(triple.parent, [...(this.children.get(triple.parent) ?? []), triple.child]);
        }
        // Best-funded parent first. The ranking input is shares, not position count: two triples
        // can both hold one position and differ by an order of magnitude in what backs them.
        for (const list of this.parents.values()) {
            list.sort((left, right) => (right.shares > left.shares ? 1 : right.shares < left.shares ? -1 : 0));
        }
    }

    static from(root: string, triples: readonly HierarchyTriple[]): DomainTree {
        return new DomainTree(root, triples);
    }

    /** Every domain whose parent triples disagree, best-funded first. */
    contested(): {domain: string; parents: HierarchyTriple[]; settled: boolean}[] {
        return [...this.parents.entries()]
            .filter(([, list]) => list.length > 1)
            .map(([domain, parents]) => ({domain, parents, settled: this.settled(parents)}));
    }

    /**
     * Is the best parent actually ahead of the second?
     *
     * A tie is not a parent. `docs/18` states the rule that way and the first implementation picked
     * whichever the indexer returned first anyway — testnet supplied the case immediately, with
     * `motion design` holding identical shares to two different parents. Breaking a tie silently is
     * the owner rule wearing the stake rule's name.
     */
    private settled(list: readonly HierarchyTriple[]): boolean {
        if (list.length === 0) return false;
        if (list.length === 1) return true;
        return (list[0] as HierarchyTriple).shares > (list[1] as HierarchyTriple).shares;
    }

    /** This domain and everything under it, nearest first. Bounded by ancestry — the graph can
     *  carry a cycle, because nothing stops anyone publishing one. */
    subtree(domain: string, seen: Set<string> = new Set()): string[] {
        if (seen.has(domain)) return [];
        seen.add(domain);
        const out = [domain];
        for (const child of this.children.get(domain) ?? []) out.push(...this.subtree(child, seen));
        return out;
    }

    /** The witness: this domain up to the root, or why there is none. */
    pathToRoot(domain: string): PathResult {
        if (domain === this.root) return {found: true, path: [domain]};
        const path = [domain];
        const seen = new Set([domain]);
        let cursor = domain;
        while (cursor !== this.root) {
            const list = this.parents.get(cursor) ?? [];
            const best = list[0];
            if (best === undefined) {
                return {
                    found: false,
                    reason: path.length === 1 ? "unknown" : "unparented",
                    at: cursor,
                    detail: `no parent triple carrying a position`,
                };
            }
            if (!this.settled(list)) {
                return {
                    found: false,
                    reason: "tied",
                    at: cursor,
                    detail: `${list.length} parents hold equal shares — unsettled`,
                };
            }
            if (seen.has(best.parent)) {
                return {found: false, reason: "cycle", at: best.parent, detail: "cycle in the hierarchy"};
            }
            seen.add(best.parent);
            path.push(best.parent);
            cursor = best.parent;
        }
        return {found: true, path};
    }
}

function sharesOf(term: unknown): {positions: number; shares: bigint} {
    if (!isRecord(term)) return {positions: 0, shares: 0n};
    const vaults = Array.isArray(term["vaults"]) ? term["vaults"] : [];
    let positions = 0;
    let shares = 0n;
    for (const vault of vaults) {
        if (!isRecord(vault)) continue;
        positions = Math.max(positions, readNumber(vault, "position_count") ?? 0);
        const raw = readString(vault, "total_shares");
        if (raw !== null && /^\d+$/.test(raw)) shares += BigInt(raw);
    }
    return {positions, shares};
}

/**
 * A domain atom's label, taken from `data` rather than `label`.
 *
 * `data` holds the plain string a `TextObject` atom was created from, which is the thing the
 * normalisation rule governs and the thing an id is derived from. `label` is the indexer's display
 * field and is not guaranteed to be the atom's bytes.
 */
function labelOf(side: unknown): string | null {
    if (!isRecord(side)) return null;
    return readString(side, "data") ?? readString(side, "label");
}

function transportFor(config: DomainsConfig): GraphqlTransport {
    return (
        config.transport ??
        createGraphqlTransport({
            url: config.graphqlUrl,
            fetch: config.fetch ?? defaultFetch(),
            timeoutMs: config.timeoutMs ?? DEFAULT_TIMEOUT_MS,
        })
    );
}

/**
 * Every hierarchy triple on the chain, paged.
 *
 * It reads **all** of them, including the ones ARP did not publish. Reading only our own would be a
 * test of nothing: the whole claim is that a reading rule makes a tree out of a permissionless
 * graph, and testnet 13579 carries 19 junk triples on this predicate to prove the point.
 */
export async function readHierarchy(config: DomainsConfig): Promise<HierarchyTriple[]> {
    const transport = transportFor(config);
    const attestor = config.attestor;
    const out: HierarchyTriple[] = [];

    for (let offset = 0; ; offset += MAX_PAGE) {
        const data = await transport.request(
            attestor === undefined ? ALL_HIERARCHY_QUERY : OUR_HIERARCHY_QUERY,
            {
                pid: config.hierarchyPredicate,
                limit: MAX_PAGE,
                offset,
                ...(attestor === undefined ? {} : {who: attestor}),
            },
        );

        // Two shapes for one result: reading from the predicate gives triples, reading from the
        // positions gives positions whose term carries the triple. Normalised here so the tree
        // never knows which path produced it.
        const rows = attestor === undefined ? data["triples"] : data["positions"];
        const list = Array.isArray(rows) ? rows : [];

        for (const row of list) {
            if (!isRecord(row)) continue;
            const node = attestor === undefined ? row : tripleOf(row);
            if (node === null) continue;
            const tripleId = readString(node, "term_id");
            const child = labelOf(node["subject"]);
            const parent = labelOf(node["object"]);
            if (tripleId === null || child === null || parent === null) continue;
            // Reading from our own positions, the position IS the authorisation — there is nothing
            // to re-check, and `shares` comes off the position rather than off the vault total.
            const {positions, shares} =
                attestor === undefined
                    ? sharesOf(row["term"])
                    : {positions: 1, shares: bigintOf(readString(row, "shares"))};
            out.push({tripleId, child, parent, positions, shares});
        }
        if (list.length < MAX_PAGE) return out;
    }
}

/** A position row's triple, or null when the position is on an atom rather than a triple. */
function tripleOf(position: Record<string, unknown>): Record<string, unknown> | null {
    const term = position["term"];
    if (!isRecord(term)) return null;
    const triple = term["triple"];
    return isRecord(triple) ? triple : null;
}

function bigintOf(raw: string | null): bigint {
    return raw !== null && /^\d+$/.test(raw) ? BigInt(raw) : 0n;
}

/** The tree, built from the chain in one call. */
export async function readDomainTree(config: DomainsConfig): Promise<DomainTree> {
    return DomainTree.from(config.root, await readHierarchy(config));
}

/**
 * The tools under a domain, at any depth.
 *
 * Two round trips, not N: one to read the hierarchy, one `has tag` query with the whole subtree as
 * an `_in` filter. That is what ADR `0074` buys — a tool carries one tag at its deepest domain and
 * the ancestors are derived, so finding everything under `payment` means descending first and then
 * asking once.
 */
export async function toolsInDomain(
    config: DomainsConfig,
    domain: string,
    options: {
        tree?: DomainTree;
        /** Rows per request, clamped at the indexer's cap. */
        limit?: number;
        /** Ceiling on the whole walk, not a page size. */
        maxRows?: number;
    } = {},
): Promise<{domains: string[]; tools: TaggedTool[]}> {
    const tree = options.tree ?? (await readDomainTree(config));
    const domains = tree.subtree(domain);
    if (domains.length === 0) return {domains: [], tools: []};

    const transport = transportFor(config);
    const limit = Math.min(options.limit ?? MAX_PAGE, MAX_PAGE);
    const maxRows = options.maxRows ?? DEFAULT_MAX_TAGGED;
    const rows: unknown[] = [];
    for (let offset = 0; ; offset += limit) {
        const data = await transport.request(TAGGED_QUERY, {
            pid: config.tagPredicate,
            domains,
            limit,
            offset,
            // An address that cannot hold a position, when no attestor is configured: every row then
            // comes back `attestorBacked: false`, which is the truth rather than a silent pass.
            who: config.attestor ?? "0x0000000000000000000000000000000000000000",
        });
        const page = Array.isArray(data["triples"]) ? data["triples"] : [];
        rows.push(...page);
        if (page.length < limit || rows.length >= maxRows) break;
    }
    const tools: TaggedTool[] = [];
    for (const row of rows) {
        if (!isRecord(row)) continue;
        const subject = row["subject"];
        const tripleId = readString(row, "term_id");
        if (!isRecord(subject) || tripleId === null) continue;
        const atomId = readString(subject, "term_id");
        if (atomId === null) continue;
        const value = subject["value"];
        const thing = isRecord(value) ? value["thing"] : null;
        const rawUrl = isRecord(thing) ? readString(thing, "url") : null;
        // The literal string "null" is treated as absent — measured on 9 mainnet tool atoms.
        const hostedAt =
            rawUrl === null || rawUrl.trim().length === 0 || rawUrl.trim() === "null"
                ? null
                : rawUrl.trim();
        const term = row["term"];
        const vaults = isRecord(term) && Array.isArray(term["vaults"]) ? term["vaults"] : [];
        const attestorBacked = vaults.some(
            (vault) =>
                isRecord(vault) && Array.isArray(vault["positions"]) && vault["positions"].length > 0,
        );
        tools.push({
            atomId,
            domain: labelOf(row["object"]) ?? domain,
            hostedAt,
            label: readString(subject, "label"),
            tripleId,
            positions: sharesOf(term).positions,
            attestorBacked,
        });
    }
    return {domains, tools};
}
