import {encodeFunctionData, getAddress, type Address, type Hex} from "viem";

import type {PreparedCall} from "../declare/types.js";

/**
 * The agent's one-time `approve(sponsor, DEPOSIT)`, which is what lets ARP's sponsoring service
 * deposit with the agent as `receiver` (ADR `0094` §3).
 *
 * Read off the deployed contract on 13579, 2026-10-30, block 9374997, by
 * `scripts/measure/multivault-sponsor-abi.ts` (output: `data/measurements/multivault-sponsor-abi-2026-10-30.json`).
 * Read-only, `eth_getCode` and `eth_call`, nothing sent. The MultiVault is an EIP-1967 proxy whose
 * implementation is `0x7b320b9a88e89032ef60aec88b8826e479922f94`, and:
 *
 * - the implementation dispatches both `approve(address,uint8)` (`0x4342e966`) and
 *   `deposit(address,bytes32,uint256,uint256)` (`0x2fb1d270`);
 * - `approve(B, 1)` from A executes, `approve(A, 1)` from A reverts
 *   `MultiVault_CannotApproveOrRevokeSelf()`, and `approve(B, 4)` reverts bare, as the ABI decoder
 *   does for an enum value out of range — so `ApprovalTypes` has four members and `DEPOSIT` is 1;
 * - `deposit(B, …)` from A with no approval reverts `MultiVault_SenderNotApproved()`, and
 *   `deposit(A, …)` from A gets past the approval check and fails on the minimum deposit instead —
 *   the `sender == receiver` branch.
 *
 * The source those calls agree with, from a local checkout of `intuition-contracts-v2`:
 * `approve(address sender, ApprovalTypes approvalType)` checks `receiver == sender` with
 * `receiver = msg.sender`, so only the agent can grant it; `ApprovalTypes { NONE, DEPOSIT,
 * REDEMPTION, BOTH }`; `_isApprovedToDeposit` is `sender == receiver || approvals[receiver][sender]
 * & DEPOSIT`. `approvals` is `internal` and nothing exposes it, so whether an agent has approved is
 * learnt by simulating the deposit, not by a read.
 *
 * **DEPOSIT and never BOTH.** `BOTH` would also let the sponsor redeem the agent's shares to any
 * receiver it names (`_isApprovedToRedeem`). The agent owns the position because only the
 * agent can leave it.
 */
export const DEPOSIT_APPROVAL = 1;

/** The one MultiVault fragment this file encodes. `ApprovalTypes` is an enum, so `uint8` on the ABI. */
export const multiVaultApproveAbi = [
    {
        type: "function",
        stateMutability: "nonpayable",
        name: "approve",
        inputs: [
            {name: "sender", type: "address"},
            {name: "approvalType", type: "uint8"},
        ],
        outputs: [],
    },
] as const;

/** Calldata for `approve(sponsor, DEPOSIT)`. */
export function encodeApproveDeposit(sponsor: Address): Hex {
    return encodeFunctionData({
        abi: multiVaultApproveAbi,
        functionName: "approve",
        args: [getAddress(sponsor), DEPOSIT_APPROVAL],
    });
}

/**
 * The call the agent signs once, from its own wallet, so the sponsor can deposit for it.
 *
 * Prepared and never sent (ADR `0038`). `value` is zero: an approval moves nothing.
 */
export function planDepositApproval(params: {
    multiVault: Address;
    chainId: number;
    sponsor: Address;
}): PreparedCall {
    const sponsor = getAddress(params.sponsor);
    return {
        kind: "approve",
        chainId: params.chainId,
        to: getAddress(params.multiVault),
        value: 0n,
        data: encodeApproveDeposit(sponsor),
        why: `let ${sponsor} deposit with you as receiver; it cannot redeem your shares`,
    };
}
