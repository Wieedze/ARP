import {
    ExecutionMode,
    type Delegation,
    type ExecutionStruct,
} from "@metamask/smart-accounts-kit";
import {DelegationManager} from "@metamask/smart-accounts-kit/contracts";
import {
    type Account,
    type Chain,
    type Hex,
    type Transport,
    type WalletClient,
} from "viem";

import {deployments} from "../lib/deployments";

/**
 * Agent-side service: build an execution payload + redeem a signed
 * delegation through the MetaMask DelegationManager.
 *
 * The "agent" here is the EOA whose key is in `AGENT_PRIVATE_KEY` (Task 03b
 * Phase 4). The agent does NOT own the user's funds — it can only execute
 * actions the user's signed delegation authorizes, bounded by the deployed
 * ARP caveat enforcers (DomainScope + TrustStakeCap).
 *
 * The MetaMask SDK helper `DelegationManager.execute.redeemDelegations`
 * (a) simulates against the chain to surface revert reasons clearly, then
 * (b) writes the transaction via the supplied WalletClient. The agent's
 * EOA pays the gas (tTRUST on Intuition Testnet).
 */

/**
 * Redeem a single ARP delegation against a single execution. The agent's
 * WalletClient signs and sends the transaction to the DelegationManager;
 * the DelegationManager invokes each caveat enforcer's `beforeHook`,
 * executes the action if all pass, then invokes `afterHook`s.
 *
 * @returns The transaction hash. Await
 *          `publicClient.waitForTransactionReceipt({ hash })` to confirm.
 */
export async function redeemArpDelegation(params: {
    /**
     * Either a single signed delegation (root) or a chain ordered from
     * leaf to root: `[leaf, ..., root]`. The framework validates the
     * chain top-to-bottom — leaf must be signed by the delegate of the
     * next-up delegation, and so on down to the root delegator.
     */
    signedDelegation: Delegation | Delegation[];
    execution: ExecutionStruct;
    agentWalletClient: WalletClient<Transport, Chain, Account>;
}): Promise<Hex> {
    const chain = Array.isArray(params.signedDelegation)
        ? params.signedDelegation
        : [params.signedDelegation];
    return DelegationManager.execute.redeemDelegations({
        client: params.agentWalletClient,
        delegationManagerAddress: deployments.metamaskDelegationFramework.delegationManager,
        delegations: [chain],
        modes: [ExecutionMode.SingleDefault],
        executions: [[params.execution]],
    });
}
