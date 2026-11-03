import {keccak256, stringToBytes} from "viem";
import {privateKeyToAccount} from "viem/accounts";
import {describe, expect, it} from "vitest";

import {signMintGasRequest, verifyMintGasRequest, type MintGasRequest} from "../src/sponsor/mint-gas.js";

// Fixed test keys, generated for nothing and holding nothing.
const HOLDER = privateKeyToAccount(`0x${"66".repeat(32)}`);
const OTHER = privateKeyToAccount(`0x${"67".repeat(32)}`);
const NOW = 1_800_000_000;

const request = (over: Partial<MintGasRequest> = {}): MintGasRequest => ({
    address: HOLDER.address,
    nonce: keccak256(stringToBytes("n")),
    expiresAt: NOW + 600,
    ...over,
});

describe("the mint-gas request", () => {
    it("verifies for the address that signed it", async () => {
        const signed = await signMintGasRequest(request(), 13579, HOLDER);
        expect(await verifyMintGasRequest(signed, NOW)).toEqual({status: "valid", address: HOLDER.address});
    });

    it("refuses a request for one address signed by another", async () => {
        const signed = await signMintGasRequest(request(), 13579, OTHER);
        expect((await verifyMintGasRequest(signed, NOW)).status).toBe("mismatch");
    });

    it("refuses one signed for another chain, an expired one and one valid for too long", async () => {
        const otherChain = await signMintGasRequest(request(), 1155, HOLDER);
        expect((await verifyMintGasRequest({...otherChain, chainId: 13579}, NOW)).status).toBe("mismatch");
        const expired = await signMintGasRequest(request({expiresAt: NOW}), 13579, HOLDER);
        expect((await verifyMintGasRequest(expired, NOW)).status).toBe("expired");
        const long = await signMintGasRequest(request({expiresAt: NOW + 86_400}), 13579, HOLDER);
        expect((await verifyMintGasRequest(long, NOW)).status).toBe("malformed");
    });

    it("refuses a bare address, which is what the route took before", async () => {
        expect((await verifyMintGasRequest({address: HOLDER.address}, NOW)).status).toBe("malformed");
        expect((await verifyMintGasRequest(null, NOW)).status).toBe("malformed");
    });
});
