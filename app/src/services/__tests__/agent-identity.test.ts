import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import {hashTypedData, isAddress, isHex, type Address, type Hex} from "viem";
import {privateKeyToAccount} from "viem/accounts";

import {deployments} from "../../lib/deployments";
import {intuitionTestnet} from "../../lib/chains";
import {
    designateAgentRuntimeWallet,
    findAgentIdByOwner,
    registerAgent,
} from "../agent-identity";

import {
    DEFAULT_TEST_ADDRESS,
    makeMockPublicClient,
    makeMockWalletClient,
    type MockPublicClient,
    type MockWalletClient,
} from "./fixtures";

const REGISTRY = deployments.arp.identityRegistry;

describe("registerAgent", () => {
    let pc: MockPublicClient;
    let wc: MockWalletClient;

    beforeEach(() => {
        pc = makeMockPublicClient();
        wc = makeMockWalletClient();
        pc.waitForTransactionReceipt.mockResolvedValue({
            status: "success",
            blockNumber: 42n,
            transactionHash: `0x${"aa".repeat(32)}`,
        });
    });

    it("calls register(), then recovers the agentId from the Registered event log", async () => {
        pc.getLogs.mockResolvedValue([
            {args: {agentId: 7n, to: DEFAULT_TEST_ADDRESS, agentURI: ""}},
        ]);

        const result = await registerAgent({walletClient: wc, publicClient: pc});

        expect(result).toEqual({agentId: 7n, tx: `0x${"aa".repeat(32)}`});
        expect(wc.writeContract).toHaveBeenCalledTimes(1);
        const writeCall = wc.writeContract.mock.calls[0][0] as {
            address: string;
            functionName: string;
            chain: {id: number};
        };
        expect(writeCall.address).toBe(REGISTRY);
        expect(writeCall.functionName).toBe("register");
        expect(writeCall.chain.id).toBe(intuitionTestnet.id);

        // Event log scan must be scoped to the receipt block (cheap, precise).
        const getLogsCall = pc.getLogs.mock.calls[0][0] as {
            address: string;
            fromBlock: bigint;
            toBlock: bigint;
            args: {to: Address};
        };
        expect(getLogsCall.address).toBe(REGISTRY);
        expect(getLogsCall.fromBlock).toBe(42n);
        expect(getLogsCall.toBlock).toBe(42n);
        expect(getLogsCall.args.to).toBe(DEFAULT_TEST_ADDRESS);
    });

    it("returns the most recent agentId when multiple Registered events match the same block", async () => {
        pc.getLogs.mockResolvedValue([
            {args: {agentId: 7n, to: DEFAULT_TEST_ADDRESS, agentURI: ""}},
            {args: {agentId: 9n, to: DEFAULT_TEST_ADDRESS, agentURI: ""}},
        ]);

        const result = await registerAgent({walletClient: wc, publicClient: pc});
        expect(result.agentId).toBe(9n);
    });

    it("throws when no Registered event is found in the receipt block", async () => {
        pc.getLogs.mockResolvedValue([]);

        await expect(
            registerAgent({walletClient: wc, publicClient: pc}),
        ).rejects.toThrow(/Registered event not found/);
    });
});

describe("findAgentIdByOwner", () => {
    it("returns null when the owner has no Registered events", async () => {
        const pc = makeMockPublicClient();
        pc.getLogs.mockResolvedValue([]);

        const result = await findAgentIdByOwner({
            owner: DEFAULT_TEST_ADDRESS,
            publicClient: pc,
        });

        expect(result).toBeNull();
        const call = pc.getLogs.mock.calls[0][0] as {
            address: string;
            fromBlock: bigint | string;
            toBlock: bigint | string;
            args: {to: Address};
        };
        expect(call.address).toBe(REGISTRY);
        expect(call.fromBlock).toBe(0n);
        expect(call.toBlock).toBe("latest");
        expect(call.args.to).toBe(DEFAULT_TEST_ADDRESS);
    });

    it("returns the last agentId when multiple registrations are found", async () => {
        const pc = makeMockPublicClient();
        pc.getLogs.mockResolvedValue([
            {args: {agentId: 3n, to: DEFAULT_TEST_ADDRESS, agentURI: ""}},
            {args: {agentId: 11n, to: DEFAULT_TEST_ADDRESS, agentURI: ""}},
            {args: {agentId: 42n, to: DEFAULT_TEST_ADDRESS, agentURI: ""}},
        ]);

        const result = await findAgentIdByOwner({
            owner: DEFAULT_TEST_ADDRESS,
            publicClient: pc,
        });
        expect(result).toBe(42n);
    });
});

describe("designateAgentRuntimeWallet", () => {
    let pc: MockPublicClient;
    let operator: MockWalletClient;

    beforeEach(() => {
        // Fixed clock so the deadline is deterministic — sig still uses a
        // freshly-generated runtime key, which is the point under test.
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-06-01T00:00:00Z"));
        pc = makeMockPublicClient();
        operator = makeMockWalletClient();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it("generates a fresh keypair, signs SetAgentWallet over the runtime key, and writes setAgentWallet", async () => {
        const result = await designateAgentRuntimeWallet({
            agentId: 7n,
            operatorWalletClient: operator,
            publicClient: pc,
        });

        // Sanity: the returned key/address are a valid pair.
        expect(isHex(result.agentWalletPrivateKey)).toBe(true);
        expect(result.agentWalletPrivateKey.length).toBe(66);
        expect(isAddress(result.agentWalletAddress)).toBe(true);
        const derived = privateKeyToAccount(result.agentWalletPrivateKey);
        expect(derived.address).toBe(result.agentWalletAddress);

        // The on-chain call carries the right registry/function/args.
        expect(operator.writeContract).toHaveBeenCalledTimes(1);
        const call = operator.writeContract.mock.calls[0][0] as {
            address: string;
            functionName: string;
            args: readonly [bigint, Address, bigint, Hex];
            chain: {id: number};
        };
        expect(call.address).toBe(REGISTRY);
        expect(call.functionName).toBe("setAgentWallet");
        expect(call.args[0]).toBe(7n);
        expect(call.args[1]).toBe(result.agentWalletAddress);
        // Default validity: 3600 seconds from fixed clock.
        const expectedDeadline = BigInt(
            Math.floor(new Date("2026-06-01T00:00:00Z").getTime() / 1000) + 3600,
        );
        expect(call.args[2]).toBe(expectedDeadline);
        expect(call.chain.id).toBe(intuitionTestnet.id);

        // The signature must verify against the EIP-712 typed-data digest —
        // proving the runtime key consented to its own designation.
        const digest = hashTypedData({
            domain: {
                name: "ERC-8004 IdentityRegistry",
                version: "1.1",
                chainId: deployments.chain.chainId,
                verifyingContract: REGISTRY,
            },
            types: {
                SetAgentWallet: [
                    {name: "agentId", type: "uint256"},
                    {name: "newWallet", type: "address"},
                    {name: "deadline", type: "uint256"},
                ],
            },
            primaryType: "SetAgentWallet",
            message: {
                agentId: 7n,
                newWallet: result.agentWalletAddress,
                deadline: expectedDeadline,
            },
        });
        // Recover the address from the signature; must equal the runtime
        // wallet — i.e., the runtime key really signed this digest.
        const {recoverAddress} = await import("viem");
        const signer = await recoverAddress({hash: digest, signature: call.args[3]});
        expect(signer).toBe(result.agentWalletAddress);
    });

    it("honors a custom validForSeconds for the deadline", async () => {
        const result = await designateAgentRuntimeWallet({
            agentId: 1n,
            operatorWalletClient: operator,
            publicClient: pc,
            validForSeconds: 60,
        });

        const call = operator.writeContract.mock.calls[0][0] as {
            args: readonly [bigint, Address, bigint, Hex];
        };
        const expectedDeadline = BigInt(
            Math.floor(new Date("2026-06-01T00:00:00Z").getTime() / 1000) + 60,
        );
        expect(call.args[2]).toBe(expectedDeadline);
        // The runtime keypair is still a fresh pair on every call.
        expect(result.agentWalletPrivateKey).toMatch(/^0x[0-9a-f]{64}$/);
    });
});
