import {describe, expect, it, vi} from "vitest";

import {choiceFor} from "../../lib/chain-choice";
import {
    declarationCostQueryKey,
    declarationCostQueryOptions,
    type CostFetcher,
} from "../use-declaration-cost";

const COST = {fee: 100_000_000_002n, deposit: 10_000_000n, floor: 100_010_000_002n};

describe("declarationCostQueryOptions", () => {
    it("puts the chain in the key, because the two MultiVaults are 100x apart", async () => {
        // Without it a switch serves the other chain's figure under the new label — the same
        // one-number-one-context failure the chain toggle exists to prevent.
        expect(declarationCostQueryKey(1155)).not.toEqual(declarationCostQueryKey(13579));
        expect(declarationCostQueryKey(1155)[1]).toBe(1155);
    });

    it("asks the MultiVault of the chain it was given, not a default", async () => {
        const fetchCost = vi.fn<CostFetcher>().mockResolvedValue(COST);
        const testnet = choiceFor(false);
        await declarationCostQueryOptions(testnet, fetchCost).queryFn();

        expect(fetchCost).toHaveBeenCalledWith(
            expect.objectContaining({multiVault: testnet.multiVault}),
        );
    });

    it("returns the fee and the deposit separately, and the floor as their sum", async () => {
        // `getTripleCost()` alone seeds a term with `minShare` and zero positions — on the chain
        // and not a market (ADR `0053`). A page that calls the fee "the floor" understates it by
        // 10% on mainnet and by half on testnet.
        const fetchCost = vi.fn<CostFetcher>().mockResolvedValue(COST);
        const cost = await declarationCostQueryOptions(choiceFor(true), fetchCost).queryFn();

        expect(cost.floor).toBe(cost.fee + cost.deposit);
        expect(cost.floor).toBeGreaterThan(cost.fee);
    });
});
