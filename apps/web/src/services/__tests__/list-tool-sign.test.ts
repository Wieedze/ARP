import {describe, expect, it, vi} from "vitest";

import {signListing, type ListingWallet} from "../list-tool-sign";

const ADDRESS = "0x906f3A52ec089f8D4E9127F91C6bE5Ae0d18f91f" as const;
const NONCE = `0x${"1".repeat(64)}` as const;
const base = {
    url: "https://github.com/Wieedze/ARP?skill=arp",
    chainId: 13579,
    nowSeconds: 1_800_000_000,
    nonce: NONCE,
};

function wallet(overrides: Partial<ListingWallet> = {}): ListingWallet {
    return {
        chainId: async () => 13579,
        switchChain: vi.fn(async () => undefined),
        signTypedData: vi.fn(async () => "0xsig" as const),
        ...overrides,
    };
}

describe("signing a listing when a key is available", () => {
    it("signs for testnet with a ten-minute expiry when the wallet is on it", async () => {
        const w = wallet();
        const result = await signListing({...base, address: ADDRESS, wallet: async () => w});
        if (result.status !== "signed") throw new Error(result.reason);
        expect(result.signed.chainId).toBe(13579);
        expect(result.signed.request).toEqual({
            address: ADDRESS,
            url: base.url,
            nonce: NONCE,
            expiresAt: base.nowSeconds + 600,
        });
        expect(w.switchChain).not.toHaveBeenCalled();
    });

    it("asks a wallet on another chain to switch first, then signs", async () => {
        const w = wallet({chainId: async () => 1155});
        const result = await signListing({...base, address: ADDRESS, wallet: async () => w});
        expect(w.switchChain).toHaveBeenCalledWith(13579);
        expect(result.status).toBe("signed");
    });

    it("goes unsigned, and says why, when the switch or the signature is refused", async () => {
        const noSwitch = wallet({
            chainId: async () => 8453,
            switchChain: async () => {
                throw new Error("User rejected the request");
            },
        });
        expect(
            await signListing({...base, address: ADDRESS, wallet: async () => noSwitch}),
        ).toEqual({
            status: "unsigned",
            reason: "wrong-chain",
        });

        const noSign = wallet({
            signTypedData: async () => {
                throw new Error("User rejected the request");
            },
        });
        expect(await signListing({...base, address: ADDRESS, wallet: async () => noSign})).toEqual({
            status: "unsigned",
            reason: "declined",
        });
    });

    it("goes unsigned without a connected address or a wallet client", async () => {
        expect(
            await signListing({...base, address: undefined, wallet: async () => wallet()}),
        ).toEqual({
            status: "unsigned",
            reason: "no-wallet",
        });
        const missing = async (): Promise<ListingWallet> => {
            throw new Error("No wallet client");
        };
        expect(await signListing({...base, address: ADDRESS, wallet: missing})).toEqual({
            status: "unsigned",
            reason: "no-wallet",
        });
    });
});
