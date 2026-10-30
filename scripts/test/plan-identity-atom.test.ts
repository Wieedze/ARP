import {parseEther} from "viem";
import type {Hex} from "viem";
import {describe, expect, it} from "bun:test";

import type {MultiVaultReads} from "../../packages/protocol/src/declare/index.js";
import {canonicalAgentThing, thingUri} from "../../packages/protocol/src/declare/agent-atom.js";
import {HAS_TYPE, SAME_AS} from "../../packages/protocol/src/sources/intuition/terms.js";
import {PinMismatchError, planIdentityAtom} from "../helpers/plan-identity-atom.js";

/*
 * Moved from `packages/protocol/test/identity-plan.test.ts` on 2026-10-30: a product test must not
 * import `scripts/`, so the half of that suite that tests a script lives with the scripts.
 * `fakeReads` is a copy of the one there.
 */

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
        // The three reads the exit path needs. An identity plan never redeems, so these throw
        // rather than answer: a plausible return value here would let a future test about
        // redemption pass against a mock that models none of it.
        async counterTripleId(): Promise<Hex> {
            throw new Error("counterTripleId: an identity plan does not touch a counter vault");
        },
        async sharesOf(): Promise<bigint> {
            throw new Error("sharesOf: an identity plan does not read a position");
        },
        async previewRedeem(): Promise<{assetsAfterFees: bigint; sharesUsed: bigint}> {
            throw new Error("previewRedeem: an identity plan never redeems");
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


describe("planIdentityAtom — the pin half", () => {
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
