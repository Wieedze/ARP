import {
    Implementation,
    toMetaMaskSmartAccount,
    type MetaMaskSmartAccount,
} from "@metamask/smart-accounts-kit";
import {type Account, type Chain, type Hex, type Transport, type WalletClient} from "viem";
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
