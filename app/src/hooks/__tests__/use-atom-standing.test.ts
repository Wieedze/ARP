import {describe, expect, it, vi} from "vitest";
import type {AtomStanding} from "@arp-protocol/core";

import {atomStandingQueryKey, atomStandingQueryOptions, isAtomId} from "../use-atom-standing";
import {DOMAIN_ATTESTOR} from "../../services/domain-filter";

const ATOM = `0x${"ab".repeat(32)}`;

const MAINNET = {
    chainId: 1155,
    graphqlUrl: "https://mainnet.intuition.sh/v1/graphql",
    symbol: "TRUST",
};
const TESTNET = {
    chainId: 13579,
    graphqlUrl: "https://testnet.intuition.sh/v1/graphql",
    symbol: "tTRUST",
};

const standing = (): AtomStanding =>
    ({
        atomId: ATOM,
        label: "AI",
        type: "Thing",
        pinnedUri: null,
        market: null,
        exists: true,
        claims: [],
        groups: [],
        edgeCount: 0,
        truncated: false,
        provenance: {source: "intuition", kind: "claim", origin: ATOM},
    }) as unknown as AtomStanding;

describe("isAtomId", () => {
    it("accepts 0x plus 32 bytes, in either case", () => {
        expect(isAtomId(ATOM)).toBe(true);
        expect(isAtomId(ATOM.toUpperCase().replace("0X", "0x"))).toBe(true);
    });

    it("rejects anything else, so a bad route param is not read as a quiet atom", () => {
        // The distinction the page turns on: a malformed id is a broken link, a well-formed one
        // with no edges is the ordinary state of almost every atom, and an id the graph does not
        // hold is a third thing again (`exists: false`). Collapsing any two of them tells the
        // reader something false about the graph.
        for (const bad of [
            undefined,
            "",
            "0x",
            "42",
            `0x${"ab".repeat(31)}`,
            `0x${"zz".repeat(32)}`,
        ]) {
            expect(isAtomId(bad)).toBe(false);
        }
    });
});

describe("atomStandingQueryKey", () => {
    it("puts the chain ahead of the atom", () => {
        // An atom id is `keccak(atomData)` and so the SAME on both chains, while its vault and its
        // edges are per chain. Without the chain in the key, switching serves the other chain's
        // answer under the new label — and the figures would be labelled `tTRUST` while coming
        // from 1155. `rules/claims.md` §2 in its UI form.
        expect(atomStandingQueryKey(1155, ATOM)).not.toEqual(atomStandingQueryKey(13579, ATOM));
        expect(atomStandingQueryKey(1155, ATOM)[1]).toBe(1155);
    });

    it("keys a null atom distinctly, so a disabled query cannot collide", () => {
        expect(atomStandingQueryKey(1155, null)).not.toEqual(atomStandingQueryKey(1155, ATOM));
    });
});

describe("atomStandingQueryOptions", () => {
    it("is disabled without an atom, and refuses to fetch if forced", async () => {
        const fetcher = vi.fn();
        const options = atomStandingQueryOptions(MAINNET, null, fetcher);
        expect(options.enabled).toBe(false);
        await expect((options.queryFn as () => Promise<unknown>)()).rejects.toThrow(
            /No atom to read/,
        );
        expect(fetcher).not.toHaveBeenCalled();
    });

    it("passes the selected chain's endpoint, not a default", async () => {
        const fetcher = vi.fn().mockResolvedValue(standing());
        await (
            atomStandingQueryOptions(TESTNET, ATOM, fetcher).queryFn as () => Promise<unknown>
        )();
        // The attestor rides along: it decides which OUTGOING claims come back, because an atom's
        // outgoing edges are where it sits in an ontology and an ontology is somebody's. Without
        // it the page showed `design is a sub-domain of governance` from an unrelated project as
        // if ARP had filed it there.
        expect(fetcher).toHaveBeenCalledWith(ATOM, {
            graphqlUrl: TESTNET.graphqlUrl,
            attestor: DOMAIN_ATTESTOR,
        });
    });

    it("labels the figures with the chain's own symbol", async () => {
        const withMarket = {
            ...standing(),
            market: {
                totalMarketCap: 5_000_000_000_000_000_000n,
                totalAssets: 5_000_000_000_000_000_000n,
                marketCap: 5_000_000_000_000_000_000n,
                totalShares: 1000n,
                currentSharePrice: 1n,
                positionCount: 3,
            },
        } as AtomStanding;
        const fetcher = vi.fn().mockResolvedValue(withMarket);

        const onTestnet = await (
            atomStandingQueryOptions(TESTNET, ATOM, fetcher).queryFn as () => Promise<{
                ownBacking: string | null;
            }>
        )();
        expect(onTestnet.ownBacking).toBe("5 tTRUST");

        const onMainnet = await (
            atomStandingQueryOptions(MAINNET, ATOM, fetcher).queryFn as () => Promise<{
                ownBacking: string | null;
            }>
        )();
        expect(onMainnet.ownBacking).toBe("5 TRUST");
    });
});
