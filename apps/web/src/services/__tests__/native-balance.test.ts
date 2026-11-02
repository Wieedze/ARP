import {describe, expect, it, vi} from "vitest";
import {type Address} from "viem";

const mockGetBalance = vi.fn();
vi.mock("../../lib/clients", () => ({
    publicClient: {getBalance: (...args: unknown[]) => mockGetBalance(...args)},
}));

import {readNativeBalance} from "../native-balance";

const ADDRESS: Address = "0x00000000000000000000000000000000000000d1";

describe("readNativeBalance", () => {
    it("returns the balance the client reads for that address", async () => {
        mockGetBalance.mockResolvedValue(5n);
        await expect(readNativeBalance(ADDRESS)).resolves.toBe(5n);
        expect(mockGetBalance).toHaveBeenCalledWith({address: ADDRESS});
    });

    it("propagates a failed read", async () => {
        mockGetBalance.mockRejectedValue(new Error("rpc down"));
        await expect(readNativeBalance(ADDRESS)).rejects.toThrow("rpc down");
    });
});
