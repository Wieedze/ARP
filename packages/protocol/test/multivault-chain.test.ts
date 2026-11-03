import {createPublicClient, custom, defineChain, encodeFunctionResult} from "viem";
import {describe, expect, it} from "vitest";

import {
    multiVaultDeclareAbi,
    multiVaultReads,
    RpcChainMismatchError,
} from "../src/declare/multivault.js";

const MULTI_VAULT = "0x6E35cF57A41fA15eA0EaE9C33e751b01A784Fe7e";

/** A chain definition with only the id that matters here. */
const intuitionTestnetLike = defineChain({
    id: 13579,
    name: "test",
    nativeCurrency: {name: "T", symbol: "T", decimals: 18},
    rpcUrls: {default: {http: ["https://rpc.test"]}},
});

/** An RPC that reports `chainId` and answers `getAtomCost` with 1, counting what it was asked. */
function rpc(chainId: number, failChainId = 0) {
    const methods: string[] = [];
    let failures = failChainId;
    const transport = custom(
        {
            async request({method}: {method: string}) {
                methods.push(method);
                if (method === "eth_chainId") {
                    if (failures > 0) {
                        failures -= 1;
                        throw new Error("connection reset");
                    }
                    return `0x${chainId.toString(16)}`;
                }
                if (method === "eth_call") {
                    return encodeFunctionResult({
                        abi: multiVaultDeclareAbi,
                        functionName: "getAtomCost",
                        result: 1n,
                    });
                }
                throw new Error(`unexpected ${method}`);
            },
        },
        {retryCount: 0},
    );
    return {transport, methods};
}

describe("multiVaultReads — the RPC's chain is checked against the configured one", () => {
    it("refuses every read from an RPC on another chain", async () => {
        const {transport, methods} = rpc(13579);
        const reads = multiVaultReads({address: MULTI_VAULT, chainId: 1155, transport});
        await expect(reads.atomCost()).rejects.toBeInstanceOf(RpcChainMismatchError);
        await expect(reads.tripleCost()).rejects.toMatchObject({expected: 1155, actual: 13579});
        expect(methods).toEqual(["eth_chainId"]);
    });

    it("asks once, then reads", async () => {
        const {transport, methods} = rpc(1155);
        const reads = multiVaultReads({address: MULTI_VAULT, chainId: 1155, transport});
        expect(await reads.atomCost()).toBe(1n);
        expect(await reads.atomCost()).toBe(1n);
        expect(methods.filter((method) => method === "eth_chainId")).toHaveLength(1);
    });

    it("retries the check after a network failure rather than remembering it", async () => {
        const {transport} = rpc(1155, 1);
        const reads = multiVaultReads({address: MULTI_VAULT, chainId: 1155, transport});
        await expect(reads.atomCost()).rejects.toThrow();
        expect(await reads.atomCost()).toBe(1n);
    });
});

describe("multiVaultReads — an injected client", () => {
    it("is refused at construction when its chain is not the configured one", () => {
        const client = createPublicClient({
            chain: intuitionTestnetLike,
            transport: rpc(13579).transport,
        });
        expect(() => multiVaultReads({address: MULTI_VAULT, chainId: 1155, client})).toThrow(
            RpcChainMismatchError,
        );
    });

    it("is read without a round trip when its chain matches", async () => {
        const {transport, methods} = rpc(13579);
        const client = createPublicClient({chain: intuitionTestnetLike, transport});
        const reads = multiVaultReads({address: MULTI_VAULT, chainId: 13579, client});
        expect(await reads.atomCost()).toBe(1n);
        expect(methods).toEqual(["eth_call"]);
    });
});
