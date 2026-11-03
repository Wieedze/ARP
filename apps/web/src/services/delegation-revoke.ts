import {
    createCaveat,
    createExecution,
    getSmartAccountsEnvironment,
    type Delegation,
    type ExecutionStruct,
    type Implementation,
    type MetaMaskSmartAccount,
} from "@metamask/smart-accounts-kit";
import {DelegationManager} from "@metamask/smart-accounts-kit/contracts";
import {createExactExecutionTerms, createLimitedCallsTerms} from "@metamask/delegation-core";
import {type Account, type Chain, type Hex, type Transport, type WalletClient} from "viem";

import {intuitionTestnet} from "../lib/chains";
import {deployments} from "../lib/deployments";

import {redeemArpDelegation} from "./agent-action";
import {buildDelegation, randomSalt, signDelegationAs} from "./delegation";
import {waitAndRecord} from "./tx-record";

/**
 * Revoke a signed delegation: `DelegationManager.disableDelegation(delegation)`, sent **as the
 * delegator**, which is the operator's Smart Account and not their wallet.
 *
 * ## Why it takes a second, one-shot delegation (ADR `0100`)
 *
 * `disableDelegation` reverts unless `msg.sender` is the delegation's delegator
 * (`DelegationManager.sol:90`, `onlyDeleGator`). The Smart Account's own `disableDelegation` is
 * `onlyEntryPointOrSelf` (`DeleGatorCore.sol:364`), and this app has no bundler (ADR `0009`). So the
 * Smart Account cannot be made to send the call by a userOp.
 *
 * What it can do is what every redemption here already does: the `DelegationManager` calls
 * `executeFromExecutor` on the delegator, and the delegator makes the call. So the Smart Account
 * signs a delegation **to the operator's own wallet** whose only power is that one call:
 *
 * - `ExactExecution` pins target, value 0 and the exact calldata of this revocation;
 * - `LimitedCalls(1)` lets it fire once.
 *
 * The wallet then redeems it. Two prompts: a signature, then one transaction on 13579. The one-shot
 * delegation is spent by the act it authorises, and a second redemption would revert twice over —
 * on `LimitedCalls` and on `AlreadyDisabled`.
 */

const ENVIRONMENT = getSmartAccountsEnvironment(intuitionTestnet.id);
const DELEGATION_MANAGER = deployments.metamaskDelegationFramework.delegationManager;

export class RevokeChainError extends Error {
    readonly walletChainId: number;
    constructor(walletChainId: number) {
        super(
            `Your wallet is on chain ${walletChainId}. Revoking is sent on ${intuitionTestnet.name} (${intuitionTestnet.id}).`,
        );
        this.name = "RevokeChainError";
        this.walletChainId = walletChainId;
    }
}

/** The call that disables `target`, as an execution the Smart Account makes. */
export function disableDelegationExecution(target: Delegation): ExecutionStruct {
    return createExecution({
        target: DELEGATION_MANAGER,
        value: 0n,
        callData: DelegationManager.encode.disableDelegation({delegation: target}),
    });
}

/** The unsigned one-shot delegation from the Smart Account to `operator` for that call alone. */
export function revocationDelegation(params: {
    target: Delegation;
    operator: Hex;
    salt?: Hex;
}): Omit<Delegation, "signature"> {
    const {ExactExecutionEnforcer, LimitedCallsEnforcer} = ENVIRONMENT.caveatEnforcers;
    if (!ExactExecutionEnforcer || !LimitedCallsEnforcer) {
        throw new Error("ExactExecution/LimitedCalls enforcers missing from the 13579 environment");
    }
    const execution = disableDelegationExecution(params.target);
    return buildDelegation({
        delegator: params.target.delegator,
        delegate: params.operator,
        caveats: [
            createCaveat(
                ExactExecutionEnforcer,
                createExactExecutionTerms({
                    execution: {
                        target: execution.target,
                        value: execution.value,
                        callData: execution.callData,
                    },
                }),
            ),
            createCaveat(LimitedCallsEnforcer, createLimitedCallsTerms({limit: 1})),
        ],
        salt: params.salt ?? randomSalt(),
    });
}

/**
 * Signs the one-shot delegation with the Smart Account and redeems it from the operator's wallet.
 * Refuses before any prompt when the wallet is not on 13579: the `DelegationManager` has the same
 * address on other chains, so a wrong-chain send would not fail loudly.
 */
export async function revokeDelegation(params: {
    target: Delegation;
    smartAccount: MetaMaskSmartAccount<Implementation.Hybrid>;
    operatorWalletClient: WalletClient<Transport, Chain, Account>;
    publicClient: Parameters<typeof waitAndRecord>[0];
}): Promise<Hex> {
    const walletChainId = await params.operatorWalletClient.getChainId();
    if (walletChainId !== intuitionTestnet.id) throw new RevokeChainError(walletChainId);
    if (params.smartAccount.address.toLowerCase() !== params.target.delegator.toLowerCase()) {
        throw new Error("This permission was not signed by your agent wallet.");
    }
    const oneShot = await signDelegationAs({
        delegation: revocationDelegation({
            target: params.target,
            operator: params.operatorWalletClient.account.address,
        }),
        smartAccount: params.smartAccount,
    });
    const hash = await redeemArpDelegation({
        signedDelegation: oneShot,
        execution: disableDelegationExecution(params.target),
        agentWalletClient: params.operatorWalletClient,
    });
    const receipt = await waitAndRecord(params.publicClient, hash, {
        label: "revoke permission",
        chainId: intuitionTestnet.id,
    });
    // A reverted revocation leaves the delegation redeemable; saying "revoked" would be the worst
    // wrong answer this page can give.
    if (receipt.status !== "success") throw new Error(`The revocation reverted (${hash}).`);
    return hash;
}
