import {describe, expect, it} from "vitest";
import type {AtomStanding, MarketSide} from "@arp-protocol/core";

import {buildAtomView, predicateLabelOf, describePointers} from "../atom-standing-view";

/**
 * The view layer's one job is the dust rule, so most of this file is about it.
 *
 * ADR `0042`: every term is born with `minShare`, so an edge nobody has backed still reports
 * non-zero assets. Measured live on mainnet 2026-10-27, a `has tag` group came back with exactly
 * `1000000` wei and `0` positions. Printing that as `<0.00000001 TRUST` invents a market where
 * there is none — the defect ADR `0042` exists for, and the one this file prevents from reaching a
 * screen.
 */

const side = (assets: bigint, positions: number | null): MarketSide => ({
    totalMarketCap: assets,
    totalAssets: assets,
    marketCap: assets,
    totalShares: 1000n,
    currentSharePrice: 1n,
    positionCount: positions,
});

function standing(overrides: Partial<AtomStanding> = {}): AtomStanding {
    return {
        atomId: `0x${"ab".repeat(32)}`,
        label: "AI",
        type: "Thing",
        pinnedUri: "ipfs://bafkreiexample",
        market: side(147_470_299_949_236_919_744n, 4305),
        exists: true,
        claims: [],
        groups: [
            {
                predicate: {atomId: "0xp-prefers", label: "prefers"},
                edges: [
                    {
                        tripleId: "0xe1",
                        subject: {atomId: "0xs1", label: "Claude", type: "Thing"},
                        support: side(44_902_590_221_278_750_712n, 4126),
                        oppose: side(0n, null),
                    },
                ],
                assets: 44_902_590_221_278_750_712n,
                positions: 4126,
            },
        ],
        edgeCount: 1,
        truncated: false,
        provenance: {source: "intuition", kind: "claim", origin: null},
        ...overrides,
    } as AtomStanding;
}

const DUST_GROUP: AtomStanding["groups"][number] = {
    predicate: {atomId: "0xp-tag", label: "has tag"},
    edges: [
        {
            tripleId: "0xe4",
            subject: {atomId: "0xs4", label: null, type: "Thing"},
            support: side(1_000_000n, 0),
            oppose: side(1_000_000n, 0),
        },
    ],
    assets: 1_000_000n,
    positions: 0,
};

describe("the dust rule", () => {
    it("shows no figure for a group nothing stands behind", () => {
        const view = buildAtomView(standing({groups: [DUST_GROUP], edgeCount: 1}), "TRUST");
        expect(view.groups[0]?.backing).toBeNull();
        expect(view.groups[0]?.rows[0]?.backing).toBeNull();
    });

    it("suppresses on the position count, not on the amount", () => {
        // The discriminator has to be `positions`, because the dust is a real non-zero amount. A
        // threshold on the amount would be a magic number that governance could move underneath it.
        const oneWeiButBacked = {
            ...DUST_GROUP,
            edges: [{...DUST_GROUP.edges[0]!, support: side(1n, 1)}],
            assets: 1n,
            positions: 1,
        };
        const view = buildAtomView(standing({groups: [oneWeiButBacked]}), "TRUST");
        expect(view.groups[0]?.rows[0]?.backing).toBe("<0.00000001 TRUST");
    });

    it("keeps the counter side absent unless somebody took it", () => {
        const view = buildAtomView(standing(), "TRUST");
        expect(view.groups[0]?.rows[0]?.opposition).toBeNull();

        const contested = {
            ...standing().groups[0]!,
            edges: [{...standing().groups[0]!.edges[0]!, oppose: side(5_000_000_000_000_000n, 2)}],
        };
        const other = buildAtomView(standing({groups: [contested]}), "TRUST");
        expect(other.groups[0]?.rows[0]?.opposition).toBe("0.005 TRUST");
    });

    it("applies the same rule to the atom's own vault", () => {
        const view = buildAtomView(standing({market: side(1_000_000n, 0)}), "TRUST");
        expect(view.ownBacking).toBeNull();
        expect(view.ownPositions).toBe(0);
    });

    it("distinguishes no market from an atom that is not there", () => {
        const view = buildAtomView(standing({market: null, exists: false}), "TRUST");
        expect(view.exists).toBe(false);
        expect(view.ownBacking).toBeNull();
    });
});

describe("the symbol", () => {
    it("comes from the caller, so testnet figures read tTRUST", () => {
        const view = buildAtomView(standing(), "tTRUST");
        expect(view.groups[0]?.backing).toContain("tTRUST");
        expect(view.ownBacking).toContain("tTRUST");
    });
});

describe("names", () => {
    it("falls back to the id and says that it did", () => {
        const view = buildAtomView(standing({label: null, groups: [DUST_GROUP]}), "TRUST");
        expect(view.titleIsId).toBe(true);
        expect(view.title).toContain("0x");
        expect(view.groups[0]?.rows[0]?.nameIsId).toBe(true);
    });

    it("treats a whitespace-only label as no label", () => {
        // The graph stores whatever was pinned, and a blank name renders as an invisible link.
        const view = buildAtomView(standing({label: "   "}), "TRUST");
        expect(view.titleIsId).toBe(true);
    });

    it("falls back for a predicate too, because any atom may be one", () => {
        const unnamed = {...DUST_GROUP, predicate: {atomId: "0xp-x", label: null}};
        const view = buildAtomView(standing({groups: [unnamed]}), "TRUST");
        expect(view.groups[0]?.labelIsId).toBe(true);
        expect(view.groups[0]?.label).toContain("0x");
    });
});

describe("describePointers", () => {
    it("counts claims and predicates, and says so in the singular", () => {
        expect(describePointers(buildAtomView(standing(), "TRUST"))).toBe(
            "1 claim across one predicate",
        );
    });

    it("marks a truncated read as a floor, not a total", () => {
        // A prefix presented as a total is the one thing this page could get wrong without anybody
        // noticing. "19 claims" and "250+ claims" are different statements.
        const view = buildAtomView(standing({edgeCount: 250, truncated: true}), "TRUST");
        expect(describePointers(view)).toContain("250+");
    });

    it("says nothing points at it rather than printing a zero", () => {
        const view = buildAtomView(standing({groups: [], edgeCount: 0}), "TRUST");
        expect(describePointers(view)).toBe("nothing points at it");
    });
});

describe("what the atom says about itself", () => {
    // The defect this covers: the page rendered only incoming edges, and a skill atom's edges all
    // point outward — `source` to its repository, `has tag` to its domain. 662 atoms whose every
    // fact was on chain had an empty page.
    const sourceClaim = {
        tripleId: "0xc1",
        predicate: {atomId: "0xp-source", label: "source"},
        object: {
            atomId: "0xo1",
            label: "github.com/firebase/agent-skills",
            type: "Thing",
        },
        support: side(0n, 1),
    };

    it("carries the outgoing edges through to the view", () => {
        const view = buildAtomView(standing({claims: [sourceClaim]}), "TRUST");
        expect(view.claims).toHaveLength(1);
        expect(view.claims[0]?.predicate).toBe("source");
        expect(view.claims[0]?.objectAtomId).toBe("0xo1");
    });

    it("parses an object that is a tool URL instead of printing the whole thing", () => {
        const view = buildAtomView(standing({claims: [sourceClaim]}), "TRUST");
        expect(view.claims[0]?.object).toBe("github.com/firebase/agent-skills");
        expect(view.claims[0]?.objectIsId).toBe(false);
    });

    it("falls back to the object's id when the graph named nothing", () => {
        const unnamed = {...sourceClaim, object: {...sourceClaim.object, label: null}};
        const view = buildAtomView(standing({claims: [unnamed]}), "TRUST");
        expect(view.claims[0]?.objectIsId).toBe(true);
    });

    it("shows no figure behind a claim nobody paid for", () => {
        // The dust rule, applied to the outgoing side: one position is the creator's own, and the
        // figure means something when somebody else arrives.
        const unbacked = {...sourceClaim, support: side(980_000_000_000_000n, 0)};
        const view = buildAtomView(standing({claims: [unbacked]}), "TRUST");
        expect(view.claims[0]?.backing).toBeNull();
    });
});

describe("predicateLabelOf", () => {
    const domains = new Set(["image", "payment", "method"]);

    it("names a has-tag edge for the kind of tag it is", () => {
        // `has tag` is overloaded and ARP writes both meanings itself: a domain on a skill, a
        // liveness verdict on a repository. Printing "has tag" twice is jargon; printing "Domain"
        // twice would be a false label on the second.
        expect(predicateLabelOf("has tag", "image", domains)).toBe("Domain");
        expect(predicateLabelOf("has tag", "maintained", domains)).toBe("Status");
        expect(predicateLabelOf("has tag", "reachable", domains)).toBe("Status");
    });

    it("keeps the predicate's own word for a tag outside ARP's tree", () => {
        // The page serves every atom in a permissionless graph. Somebody else's `has tag` edge
        // pointing at `Sanctioned Address` is not a domain, and claiming it as one would be the
        // false label this function exists to avoid.
        expect(predicateLabelOf("has tag", "Sanctioned Address", domains)).toBe("has tag");
    });

    it("leaves every other predicate alone", () => {
        expect(predicateLabelOf("source", "github.com/x/y", domains)).toBe("source");
        expect(predicateLabelOf("same as", "caip10:…", domains)).toBe("same as");
    });
});
