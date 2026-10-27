import type {Address, PublicClient} from "viem";

import {multiVaultAbi} from "../lib/abi/multi-vault";

/**
 * What the cheapest possible declaration costs on a given chain, in wei.
 *
 * ## It is a floor, and the floor is not `getTripleCost()`
 *
 * The fee alone seeds a term with `minShare` and leaves it at **zero positions** — on the chain and
 * not a market (ADR `0053`). So every write path in this repo pays `cost + minDeposit`, and the
 * protocol package refuses the fee-only amount outright: `declare/plan.ts:399` computes exactly
 * this sum, and `ZeroPositionError` exists for when it does not buy a share.
 *
 * Stating `getTripleCost()` as the floor understates it by 10% on mainnet and by **half** on
 * testnet. Measured 2026-10-27:
 *
 * | chain | `getTripleCost()` | `minDeposit` | the floor |
 * | ----- | ----------------- | ------------ | --------- |
 * | 1155  | 0.100000000002    | 0.01         | **~0.11** |
 * | 13579 | 0.001000000002    | 0.001        | **~0.002** |
 *
 * It stays a floor and not a price: a declaration also pays `getAtomCost()` for any of the three
 * atoms that does not exist yet.
 *
 * ## Read, never copied
 *
 * `rules/portability.md`: these are governance-configurable and the two chains are 100× apart. A
 * constant in the source is right on one chain and wrong by two orders of magnitude on the other.
 */
export type DeclarationCost = {
    /** The non-recoverable protocol fee for one new triple. */
    fee: bigint;
    /** The deposit that buys the first share, so the term is a market. Redeemable. */
    deposit: bigint;
    /** `fee + deposit` — what the cheapest declaration actually costs. */
    floor: bigint;
};

export async function readDeclarationCost(params: {
    publicClient: PublicClient;
    multiVault: Address;
}): Promise<DeclarationCost> {
    const read = <const T extends "getTripleCost" | "getGeneralConfig">(functionName: T) =>
        params.publicClient.readContract({
            address: params.multiVault,
            abi: multiVaultAbi,
            functionName,
        });

    const [fee, config] = await Promise.all([read("getTripleCost"), read("getGeneralConfig")]);
    return {fee, deposit: config.minDeposit, floor: fee + config.minDeposit};
}
