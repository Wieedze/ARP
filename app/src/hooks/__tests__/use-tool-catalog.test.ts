import {describe, expect, it, vi} from "vitest";
import type {
    RegisteredTool,
    RegisteredToolsPage,
    ToolListing,
    ToolListingPage,
} from "@arp-protocol/core";

import {toolCatalogQueryKey, toolCatalogQueryOptions} from "../use-tool-catalog";

function tool(atomId: string, overrides: Partial<ToolListing> = {}): ToolListing {
    return {
        atomId,
        label: "Trail of Bits — guidelines-advisor",
        uri: "ipfs://bafkreie5h7fovc2ytr43kyzoh634txokyt4yjw4mu2v724zqxbbment6cy",
        hostedAt: null,
        type: "Thing",
        edgeCount: 1,
        pricedEdges: 1,
        supportAssetsSum: 1_980_000_001_000_000n,
        opposeAssetsSum: 1_000_000n,
        ...overrides,
    };
}

function pageOf(): ToolListingPage {
    return {curveId: 1, edgesRead: 1, truncated: false, tools: [tool("0xba5844b5")]};
}

function registered(atomId: string, overrides: Partial<RegisteredTool> = {}): RegisteredTool {
    return {
        atomId,
        label: "github.com/crytic/slither",
        uri: "ipfs://bafkreidf2beugrdbzvidlwibi46fhyanrh7v3noaucjahsllu2xjqtas44",
        url: "https://github.com/crytic/slither",
        positionCount: 1,
        assets: 9_825_000_000_000_000n,
        declarations: 0,
        ...overrides,
    };
}

function registeredPageOf(tools: RegisteredTool[]): RegisteredToolsPage {
    return {curveId: 1, truncated: false, tools};
}

/** Nothing registered — the live state on both chains as of 2026-10-21. */
const noneRegistered = async () => registeredPageOf([]);

describe("toolCatalogQueryKey", () => {
    it("keys on the order, because two orders are two sequences", () => {
        // A page from one order must never be served from cache for the other.
        expect(toolCatalogQueryKey(1155, "priced-edges", 1)).not.toEqual(
            toolCatalogQueryKey(1155, "conviction", 1),
        );
        // The two curves are two markets, so one must never be served from the other's cache.
        expect(toolCatalogQueryKey(1155, "priced-edges", 1)).not.toEqual(
            toolCatalogQueryKey(1155, "priced-edges", 2),
        );
    });

    /**
     * The chain is the one that cannot be left out. ARP's own three `uses` edges are on 13579 while
     * the cohort is on 1155, so a reader switches to see them — and a shared key would serve the
     * other chain's rows from cache under the new label.
     */
    it("keys on the chain, so one chain's rows never render under the other's name", () => {
        expect(toolCatalogQueryKey(1155, "priced-edges", 1)).not.toEqual(
            toolCatalogQueryKey(13579, "priced-edges", 1),
        );
    });
});

/** Either chain, named at the call site so the key assertions above stay readable. */
const MAINNET = {chainId: 1155, graphqlUrl: "https://mainnet.intuition.sh/v1/graphql"};

describe("toolCatalogQueryOptions", () => {
    it("passes the order through and maps the page to rows", async () => {
        const fetchListing = vi.fn(async () => pageOf());
        const options = toolCatalogQueryOptions(MAINNET, "conviction", 2, fetchListing, noneRegistered);
        const view = await options.queryFn();

        expect(fetchListing).toHaveBeenCalledWith("conviction", 2);
        expect(view.rows).toHaveLength(1);
        expect(view.rows[0]?.name).toBe("Trail of Bits — guidelines-advisor");
        expect(view.rows[0]?.href).toBe("/atom/0xba5844b5");
        // The counter vault's creation dust is above zero, so the cell is populated.
        expect(view.rows[0]?.opposeTrust).not.toBeNull();
    });

    it("keeps the previous page while a new order loads", () => {
        // Switching order is the same rows in a different sequence, so replacing the list with a
        // loading state on every click would be a worse answer than a stale one.
        const options = toolCatalogQueryOptions(
            MAINNET,
            "priced-edges",
            1,
            async () => pageOf(),
            noneRegistered,
        );
        expect(options.placeholderData).toBeDefined();
    });

    it("lets a failed read surface rather than retrying indefinitely", () => {
        const options = toolCatalogQueryOptions(
            MAINNET,
            "priced-edges",
            1,
            async () => pageOf(),
            noneRegistered,
        );
        expect(options.retry).toBe(1);
    });

    it("shows registered tools beside declared ones, each marked for what it is", async () => {
        /**
         * The two populations, and why there are two rather than one widened filter.
         *
         * `listTools` keeps only `uses` edges whose subject carries a `same as` edge — the only
         * proof on the graph that a subject is a real ERC-8004 agent. Measured on mainnet
         * 2026-10-21, **0 of 185** edges pass it, so a catalogue of declarations alone has nothing
         * to show. A registered tool is an **atom**, not an edge, so it never passes through that
         * query and a person can create one without being an agent.
         */
        const options = toolCatalogQueryOptions(
            MAINNET,
            "conviction",
            1,
            async () => pageOf(),
            async () => registeredPageOf([registered("0xfeed")]),
        );
        const view = await options.queryFn();

        expect(view.rows.map((row) => row.provenance)).toEqual(["declared", "registered"]);
        expect(view.rows[1]?.name).toBe("github.com/crytic/slither");
        // Positions on the tool's own atom. Not folded into `paidDeclarations`, which counts edges
        // carrying a position — summing the two would be ADR `0023`'s per-vault-versus-across-edges
        // error.
        expect(view.rows[1]?.stakers).toBe(1);
        expect(view.rows[0]?.stakers).toBeNull();
    });

    it("keeps the declared row when a tool is in both populations", async () => {
        // A tool can be registered by a person and declared by an agent. The declared row carries
        // the per-edge market this page is about; the atom-vault figures answer the other question
        // and are on the tool's own page.
        const options = toolCatalogQueryOptions(
            MAINNET,
            "conviction",
            1,
            async () => pageOf(),
            async () => registeredPageOf([registered("0xBA5844B5", {label: "should not appear"})]),
        );
        const view = await options.queryFn();

        expect(view.rows).toHaveLength(1);
        expect(view.rows[0]?.provenance).toBe("declared");
    });

    it("reports truncation from either read", async () => {
        const options = toolCatalogQueryOptions(
            MAINNET,
            "conviction",
            1,
            async () => pageOf(),
            async () => ({
                ...registeredPageOf([]),
                truncated: true,
            }),
        );
        expect((await options.queryFn()).truncated).toBe(true);
    });
});
