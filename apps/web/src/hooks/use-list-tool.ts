import {useMutation} from "@tanstack/react-query";
import {
    LIST_TOOL_MAX_TTL_SECONDS,
    signListToolRequest,
    type SignedListToolRequest,
} from "@arp-protocol/core";
import {bytesToHex} from "viem";
import {useAccount} from "wagmi";

import {intuitionTestnet} from "../lib/chains";
import {listTool, type ListToolResult} from "../services/list-tool";
import {SPONSOR_URL} from "../services/sponsor-url";
import {connectedWalletClient} from "./wallet-client";

/**
 * Ask the sponsor to list a URL, and hold the answer (task 53c). The service is pure; this owns
 * the request's lifecycle and the IO it is given.
 *
 * With a wallet connected, the request is signed for testnet 13579 (the sponsor's only chain), so
 * it counts against that address's own cap. A refused or failed signature sends it unsigned, under
 * the shared anonymous cap, rather than not at all.
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
            const signed = address === undefined ? undefined : await signFor(address, url);
            return listTool(
                url,
                {endpoint: SPONSOR_URL, fetch: globalThis.fetch.bind(globalThis)},
                signed,
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

async function signFor(
    address: `0x${string}`,
    url: string,
): Promise<SignedListToolRequest | undefined> {
    try {
        const wallet = await connectedWalletClient();
        const nonce = bytesToHex(crypto.getRandomValues(new Uint8Array(32)));
        const expiresAt = Math.floor(Date.now() / 1000) + Math.min(600, LIST_TOOL_MAX_TTL_SECONDS);
        return await signListToolRequest({address, url, nonce, expiresAt}, intuitionTestnet.id, {
            signTypedData: (data) => wallet.signTypedData({account: address, ...data}),
        });
    } catch {
        // Declined or no wallet client: the listing still goes, unsigned, under the anonymous cap.
        return undefined;
    }
}
