import {parseEther} from "viem";
import type {Hex} from "viem";
import {describe, expect, it} from "vitest";

import type {MultiVaultReads} from "../src/declare/index.js";
import {IdentityTermHasNoPositionError, prepareIdentityAtom} from "../src/declare/index.js";
import {canonicalAgentThing, canonicalCaipThing, thingUri} from "../src/declare/agent-atom.js";
import {toCaip19} from "../src/caip.js";
import {AI_AGENT, ERC8004, HAS_TYPE, IMPLEMENT, SAME_AS} from "../src/sources/intuition/terms.js";
import {PinMismatchError, planIdentityAtom} from "../../../scripts/plan-identity-atom.js";

const MULTI_VAULT = "0x2Ece8D4dEdcB9918A398528f3fa4688b1d2CAB91" as const;
const AGENT = {chainId: 8453, tokenId: "999999"} as const;

/** Returns the URI the recipe computes, so the plan's pin check passes without a credential. */
const honestPinner = async (thing: Parameters<typeof thingUri>[0]) => ({
    status: 200,
    uri: thingUri(thing),
    body: "",
});

/**
 * A reader over stated chain state, with the previews modelling the one property that matters: the
 * creation fee comes out of `assets`, and the shares are rounded down after the entry fee. That
 * rounding is why a positive deposit can still buy nothing.
 */
function fakeReads(
    state: {feeBps?: bigint; minDeposit?: bigint; existing?: "none" | "all"} = {},
): MultiVaultReads {
    const atomCost = parseEther("0.001000000001");
    const tripleCost = parseEther("0.001000000002");
    const afterFees = (left: bigint) => {
        if (left <= 0n) return {shares: 0n, assetsAfterFixedFees: 0n, assetsAfterFees: 0n};
        const shares = (left * (10_000n - (state.feeBps ?? 0n))) / 10_000n;
        return {shares, assetsAfterFixedFees: left, assetsAfterFees: shares};
    };
    let next = 0;
    return {
        address: MULTI_VAULT,
        chainId: 13579,
        async atomId() {
            next += 1;
            return `0x${String(next).repeat(2).padStart(64, "a")}` as Hex;
        },
        // Distinct per edge. One shared id would make `termExists` on any edge answer for all
        // three, which is the opposite of what the "skips what exists" test is checking.
        async tripleId(_subject: Hex, predicate: Hex) {
            const seed = predicate === SAME_AS ? "73" : predicate === HAS_TYPE ? "74" : "75";
            return `0x${seed.repeat(32)}` as Hex;
        },
        async termExists() {
            return state.existing === "all";
        },
        async atomCost() {
            return atomCost;
        },
        async tripleCost() {
            return tripleCost;
        },
        async defaultCurveId() {
            return 1n;
        },
        async minDeposit() {
            return state.minDeposit ?? parseEther("0.001");
        },
        async previewAtomCreate(_termId: Hex, assets: bigint) {
            return afterFees(assets - atomCost);
        },
        async previewTripleCreate(_termId: Hex, assets: bigint) {
            return afterFees(assets - tripleCost);
        },
        async previewDeposit() {
            throw new Error("previewDeposit is not reachable from this plan");
        },
    };
}

describe("prepareIdentityAtom", () => {
    it("gives every term it creates a position", async () => {
        // The defect this test exists for: `atomCost` and `tripleCost` were passed as `assets`, and
        // the fee comes out of `assets`, so the whole amount was fee. Measured on testnet 13579 on
        // 2026-10-21 — 6 of the 33 atoms carrying the canonical `Agent 8453:…` fallback label have
        // no position and hold exactly `minShare`.
        const plan = await prepareIdentityAtom({agent: AGENT, reads: fakeReads()});
        // Two atoms and three edges. It was one edge until 2026-10-27 — see the next test.
        expect(plan.calls).toHaveLength(5);
        for (const call of plan.calls) {
            expect(call.preview?.shares).toBe(parseEther("0.001"));
            expect(call.value).toBeGreaterThan(parseEther("0.001"));
        }
    });

    /**
     * The regression guard for a **live** defect, found 2026-10-27 by reading Intuition's own
     * ERC-8004 agent-layer rules against this code.
     *
     * Intuition states the minimum for a new agent as three edges: `same as`, `has type` →
     * `AIAgent`, `implement` → `ERC-8004`. This planner wrote only `same as`. That looked like a
     * reasonable subset and was not one — `COHORT_QUERY`'s membership test is `implement` →
     * `ERC-8004` by term id on both ends, so an agent whose atom this wrote was **missing from
     * ARP's own index**: identifiable, unclassified, invisible to the list meant to find it.
     *
     * Asserted on the **calldata**, not on a count, because a count passes if somebody writes three
     * edges to the wrong objects.
     */
    it("writes the three edges Intuition's minimum names, to the canonical objects", async () => {
        const plan = await prepareIdentityAtom({agent: AGENT, reads: fakeReads()});
        const edges = plan.calls.filter((call) => call.kind === "create-triple");
        expect(edges).toHaveLength(3);

        // `createTriples(bytes32[],bytes32[],bytes32[],uint256[])` — the three term ids appear in
        // the calldata in subject/predicate/object order, so each predicate and object is checked
        // where it will actually be sent.
        const hexOf = (value: string) => value.replace(/^0x/, "").toLowerCase();
        const subject = hexOf(plan.identityAtom);
        for (const [predicate, object] of [
            [SAME_AS, plan.caipAtom],
            [HAS_TYPE, AI_AGENT],
            [IMPLEMENT, ERC8004],
        ] as const) {
            const match = edges.find(
                (call) =>
                    call.data.toLowerCase().includes(hexOf(predicate)) &&
                    call.data.toLowerCase().includes(hexOf(object)),
            );
            expect(match, `no edge carries ${predicate} -> ${object}`).toBeDefined();
            expect(match?.data.toLowerCase()).toContain(subject);
        }
    });

    it("skips an edge that already exists rather than paying for it twice", async () => {
        // Every term id is deterministic, so a second run must send nothing. The two classification
        // objects are canonical and already on both chains — they are referenced, never minted,
        // which is Intuition's own instruction: "partners should reuse listed object atoms rather
        // than minting duplicates".
        const plan = await prepareIdentityAtom({
            agent: AGENT,
            reads: fakeReads({existing: "all"}),
        });
        expect(plan.calls).toHaveLength(0);
        expect(plan.totalValue).toBe(0n);
        expect(plan.existing).toMatchObject({
            identityAtom: true,
            caipAtom: true,
            triple: true,
            typeTriple: true,
            implementTriple: true,
        });
    });

    it("refuses a creation the fees would leave at zero shares", async () => {
        await expect(
            prepareIdentityAtom({
                agent: AGENT,
                reads: fakeReads({feeBps: 200n, minDeposit: 1n}),
            }),
        ).rejects.toThrow(IdentityTermHasNoPositionError);
    });

    it("allows a positionless term when the caller asks for one", async () => {
        const plan = await prepareIdentityAtom({
            agent: AGENT,
            reads: fakeReads({feeBps: 200n}),
            birthDeposit: 0n,
        });
        expect(plan.calls.every((call) => call.preview?.shares === 0n)).toBe(true);
    });

    it("writes the edge in the direction `RESOLVE_AGENT_QUERY` reads", async () => {
        const plan = await prepareIdentityAtom({agent: AGENT, reads: fakeReads()});
        expect(plan.uris.identity).toBe(
            thingUri(canonicalAgentThing(AGENT.chainId, AGENT.tokenId)),
        );
        expect(plan.uris.caip).toBe(thingUri(canonicalCaipThing(toCaip19(AGENT))));
    });
});

describe("planIdentityAtom — the pin half that stayed in scripts/", () => {
    const pin = {apiKey: "test", headerName: "apikey"};

    it("returns the package's plan when the API agrees with the recipe", async () => {
        const plan = await planIdentityAtom({
            agent: AGENT,
            reads: fakeReads(),
            pin,
            pinner: honestPinner,
        });
        expect(plan.uris.identity).toBe(
            thingUri(canonicalAgentThing(AGENT.chainId, AGENT.tokenId)),
        );
        expect(plan.calls).toHaveLength(5);
    });

    /**
     * The check that makes the credential optional rather than load-bearing.
     *
     * The atom id is `ipfs://` + the CID of bytes computed locally, so the recipe already knows the
     * answer. If the API returns a different URI, one of the two has drifted — and minting on
     * either is permanent, because Intuition has no deletion. So the plan is refused rather than
     * resolved in the API's favour.
     */
    it("refuses when the pinning API returns a URI the recipe does not compute", async () => {
        await expect(
            planIdentityAtom({
                agent: AGENT,
                reads: fakeReads(),
                pin,
                pinner: async () => ({status: 200, uri: "ipfs://bafkreidrifted", body: ""}),
            }),
        ).rejects.toThrow(PinMismatchError);
    });
});
