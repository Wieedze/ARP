import {
    LIST_TOOL_MAX_TTL_SECONDS,
    signListToolRequest,
    type ListToolRequestSigner,
    type SignedListToolRequest,
} from "@arp-protocol/core";
import type {Address, Hex} from "viem";

/**
 * Sign a listing request when a key is available, and say why not otherwise (task 53c, the user's
 * decision of 2026-11-03: signed when a key is available, anonymous otherwise).
 *
 * The sponsor runs on testnet 13579 only, and a wallet refuses typed data whose domain names a
 * chain other than its own. So a wallet on another chain is asked to switch first; if it will
 * not, the request goes unsigned **knowingly**, and the reason is returned rather than swallowed.
 *
 * No React and no wagmi: every IO is passed in.
 */
export type ListingWallet = ListToolRequestSigner & {
    chainId(): Promise<number>;
    switchChain(chainId: number): Promise<void>;
};

export type ListingSignature =
    | {status: "signed"; signed: SignedListToolRequest}
    | {status: "unsigned"; reason: "no-wallet" | "wrong-chain" | "declined"};

/** How long a signed request stays valid: ten minutes, inside the sponsor's own ceiling. */
const TTL_SECONDS = Math.min(600, LIST_TOOL_MAX_TTL_SECONDS);

export async function signListing(params: {
    address: Address | undefined;
    url: string;
    chainId: number;
    wallet: () => Promise<ListingWallet>;
    nowSeconds: number;
    nonce: Hex;
}): Promise<ListingSignature> {
    if (params.address === undefined) return {status: "unsigned", reason: "no-wallet"};
    let wallet: ListingWallet;
    try {
        wallet = await params.wallet();
    } catch {
        return {status: "unsigned", reason: "no-wallet"};
    }
    try {
        if ((await wallet.chainId()) !== params.chainId) await wallet.switchChain(params.chainId);
    } catch {
        return {status: "unsigned", reason: "wrong-chain"};
    }
    try {
        const signed = await signListToolRequest(
            {
                address: params.address,
                url: params.url,
                nonce: params.nonce,
                expiresAt: params.nowSeconds + TTL_SECONDS,
            },
            params.chainId,
            wallet,
        );
        return {status: "signed", signed};
    } catch {
        return {status: "unsigned", reason: "declined"};
    }
}
