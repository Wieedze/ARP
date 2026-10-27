import {prepareHire, type HirePlan} from "@arp-protocol/core";
import {toHex} from "viem";
import type {Address, Hex, WalletClient, Transport, Chain, Account} from "viem";
import type {Delegation} from "@metamask/smart-accounts-kit";

import {createUserSmartAccount} from "./smart-account";
import {signDelegationAs} from "./delegation";

/**
 * Hiring an agent: prepare the bounded authority, then sign it.
 *
 * ## Who the delegator is, and why it is a Smart Account
 *
 * The budget is spent from the **buyer's** balance, so the buyer is the delegator. A plain EOA can
 * be one — the DelegationManager validates it with `ecrecover` — but the kit does not export the
 * typed-data builder for that path, and `rules/metamask-delegation.md` names hand-rolling the
 * framework's wire format as the silent-revert risk. So the delegator is the buyer's Smart Account,
 * whose `signDelegation` the kit does expose.
 *
 * ## The sequencing constraint, which is real and easy to miss
 *
 * Signing works while the Smart Account is **counterfactual** — it is EIP-712 over a deterministic
 * address. Redemption does not: the DelegationManager falls back to ERC-1271 and calls
 * `isValidSignature` on bytecode that does not exist yet. So a hire can be signed today and will
 * revert when the agent tries to use it unless the account has been deployed. `deployed` says
 * which state it is in, and the page is responsible for not pretending otherwise.
 *
 * ## Who the delegate is, and why the buyer has to type it
 *
 * The delegate is the agent's **runtime address** — the key it signs with. That is not on the
 * graph: an agent's atom resolves through `same as` to its ERC-8004 token, which names an NFT and
 * its owner, neither of which is the runtime. So the buyer gets the address from the seller and
 * enters it. Guessing it from the owner would delegate a budget to the wrong account.
 */

export type HireDraft = {
    plan: HirePlan;
    /** The buyer's Smart Account, which is the delegator. */
    buyer: Address;
    /** False while it is counterfactual, which signs fine and cannot be redeemed against. */
    deployed: boolean;
};

export async function planHire(params: {
    owner: Address;
    walletClient: WalletClient<Transport, Chain, Account>;
    seller: Address;
    budget: bigint;
    multiVault: Address;
    chainId: number;
    expiresAt?: number;
    isDeployed: (address: Address) => Promise<boolean>;
}): Promise<HireDraft> {
    const smartAccount = await createUserSmartAccount({
        owner: params.owner,
        signer: {walletClient: params.walletClient},
    });
    const plan = await prepareHire({
        buyer: smartAccount.address,
        seller: params.seller,
        budget: params.budget,
        multiVault: params.multiVault,
        chainId: params.chainId,
        ...(params.expiresAt === undefined ? {} : {expiresAt: params.expiresAt}),
    });
    return {
        plan,
        buyer: smartAccount.address,
        deployed: await params.isDeployed(smartAccount.address),
    };
}

/**
 * Sign the prepared authority.
 *
 * Reached from one click and nothing else — no effect, no retry (ADR `0017` safeguard 5). The
 * signature is the only thing this produces; nothing is sent, and the buyer hands the result to the
 * seller out of band.
 */
export async function signHire(params: {
    owner: Address;
    walletClient: WalletClient<Transport, Chain, Account>;
    plan: HirePlan;
}): Promise<Delegation> {
    const smartAccount = await createUserSmartAccount({
        owner: params.owner,
        signer: {walletClient: params.walletClient},
    });
    // The package's `UnsignedDelegation` has no `signature`, which is exactly what the kit's
    // `Omit<Delegation, "signature">` wants.
    //
    // **The salt is converted, not cast.** On chain it is a `uint256`, which is why the package
    // types it `bigint`; the kit's struct carries it as 32-byte `Hex`. Padding to 32 is the part
    // that matters — a shorter hex string is a different salt, so the delegation the buyer signs
    // would hash differently from the one the manager checks.
    return signDelegationAs({
        delegation: {
            delegate: params.plan.delegation.delegate,
            delegator: params.plan.delegation.delegator,
            authority: params.plan.delegation.authority as Hex,
            caveats: [...params.plan.delegation.caveats],
            salt: toHex(params.plan.delegation.salt, {size: 32}),
        },
        smartAccount,
    });
}
