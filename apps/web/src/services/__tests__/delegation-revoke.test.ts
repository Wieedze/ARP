import {
    getSmartAccountsEnvironment,
    type Delegation,
    type Implementation,
    type MetaMaskSmartAccount,
} from "@metamask/smart-accounts-kit";
import {DelegationManager} from "@metamask/smart-accounts-kit/contracts";
import {decodeExactExecutionTerms, decodeLimitedCallsTerms} from "@metamask/delegation-core";
import {beforeEach, describe, expect, it, vi} from "vitest";
import {decodeFunctionData, getAddress, parseAbi, type Hex} from "viem";

import {intuitionTestnet} from "../../lib/chains";
import {deployments} from "../../lib/deployments";

import {DEFAULT_TEST_ACCOUNT, makeMockPublicClient, makeMockWalletClient} from "./fixtures";

/**
 * `revokeDelegation` against a mocked wallet client: the redemption wrapper is mocked, so what is
 * asserted is the call it would send — `disableDelegation(target)` on the `DelegationManager`, made
 * by the Smart Account under a one-shot delegation to the operator's wallet.
 */
const mockRedeem = vi.fn();
vi.mock("../agent-action", () => ({
    redeemArpDelegation: (...args: unknown[]) => mockRedeem(...args),
}));

import {
    RevokeChainError,
    disableDelegationExecution,
    revocationDelegation,
    revokeDelegation,
} from "../delegation-revoke";

const MANAGER = deployments.metamaskDelegationFramework.delegationManager;
const ENFORCERS = getSmartAccountsEnvironment(intuitionTestnet.id).caveatEnforcers;
const SA: Hex = "0x00000000000000000000000000000000000000Aa";
const TX: Hex = `0x${"ee".repeat(32)}`;

const TARGET: Delegation = {
    delegate: "0x00000000000000000000000000000000000000d1",
    delegator: SA,
    authority: `0x${"f".repeat(64)}`,
    caveats: [{enforcer: deployments.arp.trustStakeCapEnforcer, terms: "0x", args: "0x"}],
    salt: "0x01",
    signature: "0xabcd",
};

function smartAccount(address: Hex = SA) {
    const signDelegation = vi.fn().mockResolvedValue("0x5151");
    // The service reads `address` and calls `signDelegation`; nothing else of the account is used.
    const account = {
        address,
        signDelegation,
    } as unknown as MetaMaskSmartAccount<Implementation.Hybrid>;
    return {account, signDelegation};
}

describe("the revocation call", () => {
    it("is disableDelegation(target) on the DelegationManager, with no value", () => {
        const execution = disableDelegationExecution(TARGET);
        expect(execution.target).toBe(MANAGER);
        expect(execution.value).toBe(0n);
        // The framework's signature, written out so the test does not trust the encoder it checks.
        const abi = parseAbi([
            "struct Caveat { address enforcer; bytes terms; bytes args; }",
            "struct Delegation { address delegate; address delegator; bytes32 authority; Caveat[] caveats; uint256 salt; bytes signature; }",
            "function disableDelegation(Delegation _delegation)",
        ]);
        const decoded = decodeFunctionData({abi, data: execution.callData});
        expect(decoded.functionName).toBe("disableDelegation");
        const [arg] = decoded.args;
        expect(arg.delegator).toBe(getAddress(SA));
        expect(arg.signature).toBe(TARGET.signature);
        expect(arg.salt).toBe(1n);
        expect(DelegationManager.encode.disableDelegation({delegation: TARGET})).toBe(
            execution.callData,
        );
    });

    it("is authorised by a delegation pinned to that exact call, once", () => {
        const operator = DEFAULT_TEST_ACCOUNT.address;
        const oneShot = revocationDelegation({target: TARGET, operator});
        expect(oneShot.delegator).toBe(SA);
        expect(oneShot.delegate).toBe(operator);
        expect(oneShot.caveats.map((c) => c.enforcer)).toEqual([
            ENFORCERS.ExactExecutionEnforcer,
            ENFORCERS.LimitedCallsEnforcer,
        ]);
        const exact = decodeExactExecutionTerms(oneShot.caveats[0].terms);
        const execution = disableDelegationExecution(TARGET);
        expect(exact.execution.target.toLowerCase()).toBe(MANAGER.toLowerCase());
        expect(exact.execution.value).toBe(0n);
        expect(exact.execution.callData).toBe(execution.callData);
        expect(decodeLimitedCallsTerms(oneShot.caveats[1].terms).limit).toBe(1);
    });
});

describe("revokeDelegation", () => {
    beforeEach(() => {
        mockRedeem.mockReset();
        mockRedeem.mockResolvedValue(TX);
    });

    it("signs the one-shot delegation, redeems it from the wallet and waits for the receipt", async () => {
        const wallet = makeMockWalletClient();
        wallet.getChainId = vi.fn().mockResolvedValue(intuitionTestnet.id);
        const client = makeMockPublicClient();
        const {account, signDelegation} = smartAccount();

        const hash = await revokeDelegation({
            target: TARGET,
            smartAccount: account,
            operatorWalletClient: wallet,
            publicClient: client,
        });

        expect(hash).toBe(TX);
        expect(signDelegation).toHaveBeenCalledTimes(1);
        const redeemed = mockRedeem.mock.calls[0][0] as {
            signedDelegation: Delegation;
            execution: {target: Hex; callData: Hex};
            agentWalletClient: unknown;
        };
        expect(redeemed.signedDelegation.signature).toBe("0x5151");
        expect(redeemed.signedDelegation.delegate).toBe(wallet.account.address);
        expect(redeemed.execution).toEqual(disableDelegationExecution(TARGET));
        expect(redeemed.agentWalletClient).toBe(wallet);
        expect(client.waitForTransactionReceipt).toHaveBeenCalledWith({hash: TX});
    });

    it("refuses before any prompt when the wallet is not on 13579", async () => {
        const wallet = makeMockWalletClient();
        wallet.getChainId = vi.fn().mockResolvedValue(1155);
        const {account, signDelegation} = smartAccount();

        await expect(
            revokeDelegation({
                target: TARGET,
                smartAccount: account,
                operatorWalletClient: wallet,
                publicClient: makeMockPublicClient(),
            }),
        ).rejects.toBeInstanceOf(RevokeChainError);
        expect(signDelegation).not.toHaveBeenCalled();
        expect(mockRedeem).not.toHaveBeenCalled();
    });

    it("refuses a delegation another Smart Account signed", async () => {
        const wallet = makeMockWalletClient();
        wallet.getChainId = vi.fn().mockResolvedValue(intuitionTestnet.id);
        const {account, signDelegation} = smartAccount(
            "0x00000000000000000000000000000000000000Bb",
        );

        await expect(
            revokeDelegation({
                target: TARGET,
                smartAccount: account,
                operatorWalletClient: wallet,
                publicClient: makeMockPublicClient(),
            }),
        ).rejects.toThrow("not signed by your agent wallet");
        expect(signDelegation).not.toHaveBeenCalled();
    });

    it("throws when the revocation reverts, so the page never reports it revoked", async () => {
        const wallet = makeMockWalletClient();
        wallet.getChainId = vi.fn().mockResolvedValue(intuitionTestnet.id);
        const client = makeMockPublicClient();
        client.waitForTransactionReceipt.mockResolvedValue({
            status: "reverted",
            blockNumber: 1n,
            gasUsed: 1n,
            effectiveGasPrice: 1n,
        });

        await expect(
            revokeDelegation({
                target: TARGET,
                smartAccount: smartAccount().account,
                operatorWalletClient: wallet,
                publicClient: client,
            }),
        ).rejects.toThrow("reverted");
    });
});
