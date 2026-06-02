import {
    Implementation,
    toMetaMaskSmartAccount,
    type MetaMaskSmartAccount,
} from "@metamask/smart-accounts-kit";
import {
    type Account,
    type Chain,
    type Hex,
    type Transport,
    type WalletClient,
} from "viem";
import {type PrivateKeyAccount} from "viem/accounts";

import {publicClient} from "../lib/clients";

/**
 * Construct a MetaMask Hybrid Smart Account for the given owner.
 *
 * The returned object exposes the Smart Account's counterfactual address
 * immediately — deployment is lazy and happens on the first user operation
 * (e.g., the first delegation redemption).
 *
 * Two signing modes are supported:
 *
 * 1. `signer: { account }` — a Viem `PrivateKeyAccount` from a raw private
 *    key. Used by the CLI demo script in Task 03b Phase 4.
 *
 * 2. `signer: { walletClient }` — a Viem `WalletClient` backed by the
 *    user's connected browser wallet. Used by the UI in Task 04b. The
 *    `owner` MUST equal `walletClient.account.address` for the signature
 *    to be valid.
 *
 * `deploySalt: '0x'` produces the canonical address per owner. Pass a
 * distinct salt if the same EOA needs multiple Smart Accounts.
 */
export type SmartAccountSigner =
    | {account: PrivateKeyAccount}
    // Must have an Account bound (cannot be a server-side client).
    | {walletClient: WalletClient<Transport, Chain | undefined, Account>};

export async function createUserSmartAccount(params: {
    owner: Hex;
    signer: SmartAccountSigner;
    deploySalt?: Hex;
}): Promise<MetaMaskSmartAccount<Implementation.Hybrid>> {
    const deploySalt: Hex = params.deploySalt ?? "0x";

    if ("account" in params.signer) {
        return toMetaMaskSmartAccount({
            client: publicClient,
            implementation: Implementation.Hybrid,
            deployParams: [params.owner, [], [], []],
            deploySalt,
            signer: {account: params.signer.account},
        });
    }
    return toMetaMaskSmartAccount({
        client: publicClient,
        implementation: Implementation.Hybrid,
        deployParams: [params.owner, [], [], []],
        deploySalt,
        signer: {walletClient: params.signer.walletClient},
    });
}

/**
 * Deploy the Smart Account on-chain if it is not already deployed.
 *
 * MetaMask Smart Accounts are counterfactual by default — the address is
 * deterministic but no bytecode exists until the first userOp is processed
 * by the EntryPoint. The DelegationManager requires the delegator to be
 * a contract implementing `IDeleGatorCore.executeFromExecutor`, so before
 * a Smart Account can act as a delegator we must materialize it on-chain.
 *
 * This helper bypasses the Bundler (which Task 04b will wire properly)
 * by calling the SDK's bundled SimpleFactory via the standard viem
 * `factory + factoryData` pair the SmartAccount exposes. The user's
 * EOA pays the gas.
 *
 * @returns `null` if the SA was already deployed, otherwise the
 *          deployment transaction hash.
 */
export async function deploySmartAccountIfNeeded(params: {
    smartAccount: MetaMaskSmartAccount<Implementation.Hybrid>;
    funderWalletClient: WalletClient<Transport, Chain, Account>;
}): Promise<Hex | null> {
    const code = await publicClient.getCode({address: params.smartAccount.address});
    if (code && code !== "0x") return null;

    const {factory, factoryData} = await params.smartAccount.getFactoryArgs();
    if (!factory || !factoryData) {
        throw new Error("Smart Account has no factory args — already deployed or misconfigured");
    }

    const hash = await params.funderWalletClient.sendTransaction({
        to: factory,
        data: factoryData,
    });
    await publicClient.waitForTransactionReceipt({hash});
    return hash;
}
