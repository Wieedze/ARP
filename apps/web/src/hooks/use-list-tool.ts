import {useMutation} from "@tanstack/react-query";
import {bytesToHex} from "viem";
import {useAccount} from "wagmi";

import {intuitionTestnet} from "../lib/chains";
import {listTool, type ListToolResult} from "../services/list-tool";
import {signListing, type ListingWallet} from "../services/list-tool-sign";
import {SPONSOR_URL} from "../services/sponsor-url";
import {connectedWalletClient} from "./wallet-client";

/**
 * Ask the sponsor to list a URL, and hold the answer (task 53c). The services are pure; this owns
 * the request's lifecycle and hands them the wallet, the clock and the randomness.
 *
 * With a wallet connected, the request is signed for testnet 13579, asking the wallet to switch
 * there first, so it counts against that address's own cap. Refused, it goes unsigned under the
 * shared anonymous cap, deliberately (`services/list-tool-sign.ts`).
 */
export function useListTool(): {
    /** `false` when no sponsor is configured: the page offers the wallet path instead. */
    available: boolean;
    submit: (url: string) => void;
    pending: boolean;
    result: ListToolResult | null;
} {
    const {address} = useAccount();
    const mutation = useMutation({
        mutationFn: async (url: string) => {
            const signature = await signListing({
                address,
                url,
                chainId: intuitionTestnet.id,
                wallet: openWallet,
                nowSeconds: Math.floor(Date.now() / 1000),
                nonce: bytesToHex(crypto.getRandomValues(new Uint8Array(32))),
            });
            return listTool(
                url,
                {endpoint: SPONSOR_URL, fetch: globalThis.fetch.bind(globalThis)},
                signature.status === "signed" ? signature.signed : undefined,
            );
        },
    });
    return {
        available: SPONSOR_URL !== undefined,
        submit: (url) => {
            // A new submit clears the last answer, so a repeated outcome is announced again.
            mutation.reset();
            mutation.mutate(url);
        },
        pending: mutation.isPending,
        result: mutation.data ?? null,
    };
}

/** The connected wallet, in the shape `signListing` takes. */
async function openWallet(): Promise<ListingWallet> {
    const wallet = await connectedWalletClient();
    const account = wallet.account;
    return {
        chainId: () => wallet.getChainId(),
        switchChain: (id) => wallet.switchChain({id}),
        signTypedData: (data) => wallet.signTypedData({account, ...data}),
    };
}
