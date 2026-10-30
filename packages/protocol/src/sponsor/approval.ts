import {encodeFunctionData, getAddress, type Address, type Hex} from "viem";

import type {PreparedCall} from "../declare/types.js";

/**
 * The agent's one-time `approve(sponsor, DEPOSIT)`, which is what lets ARP's sponsoring service
 * deposit with the agent as `receiver` (ADR `0094` §3).
 *
 * Read on 2026-10-30 from a local checkout of `intuition-contracts-v2` (ADR `0094` cites one at
 * `2bb93d2`; the commit of this one was not re-checked), **not** from the deployed contract on
 * 13579 — that re-read is still owed before the first live call:
 *
 * - `approve(address sender, ApprovalTypes approvalType)` at `MultiVault.sol:362`. `msg.sender` is
 *   the receiver, so only the agent can grant it, and it reverts when `sender == msg.sender`.
 * - `ApprovalTypes { NONE, DEPOSIT, REDEMPTION, BOTH }` at `IMultiVault.sol:28`, so `DEPOSIT` is 1.
 * - `deposit` checks `_isApprovedToDeposit(_msgSender(), receiver)` at `:673`, which is
 *   `sender == receiver || approvals[receiver][sender] & DEPOSIT` at `:1591`.
 * - `approvals` is `internal` (`:53`) and nothing exposes it, so whether an agent has approved is
 *   learnt by simulating the deposit, not by a read.
 *
 * **DEPOSIT and never BOTH.** `BOTH` would also let the sponsor redeem the agent's shares to any
 * receiver it names (`_isApprovedToRedeem`, `:1599`). The agent owns the position because only the
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
