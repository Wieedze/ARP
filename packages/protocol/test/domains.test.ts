import {describe, expect, it} from "vitest";

import {DomainTree, readHierarchy, toolsInDomain, type HierarchyTriple} from "../src/domains.js";

const CONFIG = {
    graphqlUrl: "https://testnet.intuition.sh/v1/graphql",
    hierarchyPredicate: "0x9c2e",
    tagPredicate: "0x7ec3",
    root: "tool",
};

/** A hierarchy triple with one position and a share count the caller picks, since the ranking is
 *  on shares and the authorisation is on positions — two different fields, and conflating them is
 *  the defect this file exists to pin down. */
function edge(child: string, parent: string, shares = 1_000n, positions = 1): HierarchyTriple {
    return {tripleId: `0x${child}-${parent}`, child, parent, positions, shares};
}

/** One page of rows, so `readHierarchy`'s paging terminates. */
function transportOf(pages: unknown[][]) {
    const seen: Record<string, unknown>[] = [];
    let call = 0;
    return {
        seen,
        transport: {
            async request(_query: string, variables: Record<string, unknown>) {
                seen.push(variables);
                return {triples: pages[call++] ?? []};
            },
        },
    };
}

describe("DomainTree", () => {
    it("descends to every domain under one, at any depth", () => {
        const tree = DomainTree.from("tool", [
            edge("payment", "tool"),
            edge("card", "payment"),
            edge("database", "tool"),
        ]);
        expect(tree.subtree("payment")).toEqual(["payment", "card"]);
        expect(tree.subtree("tool").sort()).toEqual(["card", "database", "payment", "tool"]);
        expect(tree.subtree("card")).toEqual(["card"]);
    });

    it("climbs to the root and reports the witness", () => {
        const tree = DomainTree.from("tool", [edge("payment", "tool"), edge("card", "payment")]);
        const path = tree.pathToRoot("card");
        expect(path.found).toBe(true);
        if (path.found) expect(path.path).toEqual(["card", "payment", "tool"]);
    });

    it("ignores a triple nobody holds a position on", () => {
        // `assets = cost` alone creates a term with ZERO positions: it exists on the chain and
        // carries no path. The threshold is one, not two — an earlier version used `> 1` and
        // reported four freshly created triples as carrying nothing.
        const tree = DomainTree.from("tool", [
            edge("payment", "tool", 1_000n, 0),
            edge("card", "payment"),
        ]);
        expect(tree.subtree("tool")).toEqual(["tool"]);
        const path = tree.pathToRoot("card");
        expect(path.found).toBe(false);
        if (!path.found) {
            expect(path.reason).toBe("unparented");
            expect(path.at).toBe("payment");
        }
    });

    it("accepts a triple holding exactly one position", () => {
        const tree = DomainTree.from("tool", [edge("payment", "tool", 1n, 1)]);
        expect(tree.pathToRoot("payment").found).toBe(true);
    });

    it("refuses a path through a node whose parents are tied on shares", () => {
        // Not hypothetical: on testnet 13579 `motion design` holds identical shares to two
        // different parents, because both triples were created the same way and nobody has
        // deposited since. Picking the first one the indexer returned is the owner rule wearing
        // the stake rule's name.
        const tree = DomainTree.from("tool", [
            edge("motion", "design", 500n),
            edge("motion", "ux", 500n),
            edge("design", "tool"),
            edge("ux", "tool"),
        ]);
        const path = tree.pathToRoot("motion");
        expect(path.found).toBe(false);
        if (!path.found) {
            expect(path.reason).toBe("tied");
            expect(path.at).toBe("motion");
        }
        const [contested] = tree.contested();
        expect(contested?.domain).toBe("motion");
        expect(contested?.settled).toBe(false);
    });

    it("takes the best-funded parent when one is ahead, and keeps the rest as dissent", () => {
        const tree = DomainTree.from("tool", [
            edge("motion", "design", 900n),
            edge("motion", "ux", 100n),
            edge("design", "tool"),
        ]);
        const path = tree.pathToRoot("motion");
        expect(path.found).toBe(true);
        if (path.found) expect(path.path).toEqual(["motion", "design", "tool"]);
        const [contested] = tree.contested();
        expect(contested?.settled).toBe(true);
        expect(contested?.parents.map((entry) => entry.parent)).toEqual(["design", "ux"]);
    });

    it("cuts a cycle instead of recursing for ever", () => {
        // Nothing stops anyone publishing one, and nothing can remove it afterwards.
        const tree = DomainTree.from("tool", [edge("a", "b"), edge("b", "a")]);
        expect(tree.subtree("a").sort()).toEqual(["a", "b"]);
        const path = tree.pathToRoot("a");
        expect(path.found).toBe(false);
        if (!path.found) expect(path.reason).toBe("cycle");
    });

    it("says `unknown` for a domain no triple mentions", () => {
        const tree = DomainTree.from("tool", [edge("payment", "tool")]);
        const path = tree.pathToRoot("quantum");
        expect(path.found).toBe(false);
        if (!path.found) expect(path.reason).toBe("unknown");
    });
});

describe("readHierarchy, reading from the attestor's positions", () => {
    const ATTESTOR = "0x906f3A52ec089f8D4E9127F91C6bE5Ae0d18f91f";

    /** One page of position rows, the shape the `attestor` path reads. */
    function positionsOf(rows: unknown[]) {
        const seen: Record<string, unknown>[] = [];
        let call = 0;
        return {
            seen,
            transport: {
                async request(_query: string, variables: Record<string, unknown>) {
                    seen.push(variables);
                    return {positions: call++ === 0 ? rows : []};
                },
            },
        };
    }

    it("builds the tree out of positions and carries the attestor into the query", async () => {
        const {transport, seen} = positionsOf([
            {
                shares: "990000000000000",
                term: {
                    triple: {
                        term_id: "0x1",
                        subject: {data: "payment"},
                        object: {data: "tool"},
                    },
                },
            },
        ]);
        const triples = await readHierarchy({...CONFIG, attestor: ATTESTOR, transport});
        expect(triples).toEqual([
            {
                tripleId: "0x1",
                child: "payment",
                parent: "tool",
                positions: 1,
                shares: 990000000000000n,
            },
        ]);
        expect(seen[0]?.["who"]).toBe(ATTESTOR);
    });

    it("skips a position that is on an atom rather than a triple", async () => {
        // Creating a tool atom with a deposit leaves a position too, and it has no triple.
        const {transport} = positionsOf([{shares: "1", term: {triple: null}}, {shares: "1"}]);
        expect(await readHierarchy({...CONFIG, attestor: ATTESTOR, transport})).toEqual([]);
    });
});

describe("readHierarchy", () => {
    it("reads a domain's label from `data`, not from `label`", async () => {
        // `data` holds the plain string the atom was created from, which is what the normalisation
        // rule governs and what the id derives from. `label` is the indexer's display field.
        const {transport} = transportOf([
            [
                {
                    term_id: "0x1",
                    subject: {data: "payment", label: "Payment (display)"},
                    object: {data: "tool", label: "Tool"},
                    term: {vaults: [{position_count: 1, total_shares: "980"}]},
                },
            ],
        ]);
        const triples = await readHierarchy({...CONFIG, transport});
        expect(triples).toEqual([
            {tripleId: "0x1", child: "payment", parent: "tool", positions: 1, shares: 980n},
        ]);
    });

    it("stops paging on a short page", async () => {
        const {transport, seen} = transportOf([[]]);
        await readHierarchy({...CONFIG, transport});
        expect(seen).toHaveLength(1);
        expect(seen[0]?.["offset"]).toBe(0);
    });
});

describe("toolsInDomain", () => {
    it("asks for the whole subtree in one tag query and treats the string \"null\" as no host", async () => {
        const tree = DomainTree.from("tool", [edge("payment", "tool"), edge("card", "payment")]);
        const {transport, seen} = transportOf([
            [
                {
                    term_id: "0xt1",
                    subject: {
                        term_id: "0xaa",
                        label: "stripe",
                        value: {thing: {url: "https://github.com/stripe/agent-toolkit"}},
                    },
                    object: {data: "card"},
                    term: {vaults: [{position_count: 1, total_shares: "1"}]},
                },
                {
                    term_id: "0xt2",
                    subject: {term_id: "0xbb", label: "paypal", value: {thing: {url: "null"}}},
                    object: {data: "payment"},
                    term: {vaults: [{position_count: 2, total_shares: "2"}]},
                },
            ],
        ]);

        const {domains, tools} = await toolsInDomain({...CONFIG, transport}, "payment", {tree});

        expect(domains).toEqual(["payment", "card"]);
        // One query, with the subtree as an `_in` filter — the saving ADR 0074 buys.
        expect(seen).toHaveLength(1);
        expect(seen[0]?.["domains"]).toEqual(["payment", "card"]);
        expect(tools.map((tool) => tool.hostedAt)).toEqual([
            "https://github.com/stripe/agent-toolkit",
            null,
        ]);
        // No attestor configured, so no row can be backed — reported as false rather than passed
        // through silently. `has tag` is permissionless, and the index is the one thing that is not.
        expect(tools.map((tool) => tool.attestorBacked)).toEqual([false, false]);
        // The tag names the deepest domain, never an ancestor (ADR 0074).
        expect(tools.map((tool) => tool.domain)).toEqual(["card", "payment"]);
    });

    it("marks a filing the attestor holds a position on", async () => {
        const tree = DomainTree.from("tool", [edge("payment", "tool")]);
        const {transport, seen} = transportOf([
            [
                {
                    term_id: "0xours",
                    subject: {term_id: "0xaa", value: {thing: {url: "https://x/ours"}}},
                    object: {data: "payment"},
                    term: {vaults: [{position_count: 1, total_shares: "1", positions: [{shares: "9"}]}]},
                },
                {
                    term_id: "0xtheirs",
                    subject: {term_id: "0xbb", value: {thing: {url: "https://x/theirs"}}},
                    object: {data: "payment"},
                    term: {vaults: [{position_count: 1, total_shares: "1", positions: []}]},
                },
            ],
        ]);
        const {tools} = await toolsInDomain(
            {...CONFIG, attestor: "0xATTESTOR", transport},
            "payment",
            {tree},
        );
        expect(tools.map((tool) => tool.attestorBacked)).toEqual([true, false]);
        expect(seen[0]?.["who"]).toBe("0xATTESTOR");
    });

    it("sends no tag query for a domain the hierarchy does not reach", async () => {
        const tree = DomainTree.from("tool", [edge("payment", "tool")]);
        const {transport, seen} = transportOf([[]]);
        const {domains, tools} = await toolsInDomain({...CONFIG, transport}, "payment", {tree});
        expect(domains).toEqual(["payment"]);
        expect(tools).toEqual([]);
        expect(seen).toHaveLength(1);
    });
});
