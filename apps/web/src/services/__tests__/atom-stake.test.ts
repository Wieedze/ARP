import {beforeEach, describe, expect, it} from "vitest";
import {parseEther, type Address, type Hex} from "viem";

import {deployments} from "../../lib/deployments";
import {intuitionTestnet} from "../../lib/chains";
import {multiVaultAbi} from "../../lib/abi/multi-vault";
import {depositOnAtom, readVaultState} from "../atom-stake";

import {
    DEFAULT_TEST_ADDRESS,
    makeMockPublicClient,
    makeMockWalletClient,
    readContractDispatcher,
    type MockPublicClient,
    type MockWalletClient,
} from "./fixtures";

const MULTI_VAULT = deployments.intuition.multiVault;
const ATOM_ID: Hex = `0x${"de".repeat(32)}`;

describe("depositOnAtom", () => {
    let pc: MockPublicClient;
    let wc: MockWalletClient;

    beforeEach(() => {
        pc = makeMockPublicClient();
        wc = makeMockWalletClient();
        pc.readContract.mockImplementation(
            readContractDispatcher({
                getBondingCurveConfig: {
                    registry: "0x0000000000000000000000000000000000000001" as Address,
                    defaultCurveId: 7n,
                },
            }),
        );
    });

    it("reads the curve config then calls deposit with sender as default receiver", async () => {
        const amount = parseEther("0.5");
        const tx = await depositOnAtom({
            atomId: ATOM_ID,
            amount,
            walletClient: wc,
            publicClient: pc,
        });

        expect(tx).toBe(`0x${"aa".repeat(32)}`);
        expect(wc.writeContract).toHaveBeenCalledTimes(1);
        const call = wc.writeContract.mock.calls[0][0] as {
            address: string;
            abi: typeof multiVaultAbi;
            functionName: string;
            args: readonly unknown[];
            value: bigint;
            chain: {id: number};
        };
        expect(call.address).toBe(MULTI_VAULT);
        expect(call.functionName).toBe("deposit");
        expect(call.args).toEqual([DEFAULT_TEST_ADDRESS, ATOM_ID, 7n, 0n]);
        expect(call.value).toBe(amount);
        expect(call.chain.id).toBe(intuitionTestnet.id);
    });

    it("forwards a custom receiver as the deposit beneficiary", async () => {
        const custom: Address = "0x000000000000000000000000000000000000BEEF";
        await depositOnAtom({
            atomId: ATOM_ID,
            amount: 1n,
            walletClient: wc,
            publicClient: pc,
            receiver: custom,
        });

        const callArgs = wc.writeContract.mock.calls[0][0] as {
            args: readonly [Address, Hex, bigint, bigint];
        };
        expect(callArgs.args[0]).toBe(custom);
    });

    it("forwards minShares so the caller can guard against curve drift", async () => {
        await depositOnAtom({
            atomId: ATOM_ID,
            amount: 1n,
            walletClient: wc,
            publicClient: pc,
            minShares: 42n,
        });

        const callArgs = wc.writeContract.mock.calls[0][0] as {
            args: readonly [Address, Hex, bigint, bigint];
        };
        expect(callArgs.args[3]).toBe(42n);
    });

    it("bubbles the error if the curve config read fails", async () => {
        pc.readContract.mockReset();
        pc.readContract.mockRejectedValueOnce(new Error("RPC down"));

        await expect(
            depositOnAtom({atomId: ATOM_ID, amount: 1n, walletClient: wc, publicClient: pc}),
        ).rejects.toThrow("RPC down");
        expect(wc.writeContract).not.toHaveBeenCalled();
    });
});

describe("readVaultState", () => {
    it("returns {totalAssets, totalShares, curveId} from the chain", async () => {
        const pc = makeMockPublicClient();
        pc.readContract.mockImplementation(
            readContractDispatcher({
                getBondingCurveConfig: {
                    registry: "0x0000000000000000000000000000000000000001" as Address,
                    defaultCurveId: 3n,
                },
                getVault: [1_000n, 999n],
            }),
        );

        const state = await readVaultState({atomId: ATOM_ID, publicClient: pc});

        expect(state).toEqual({totalAssets: 1_000n, totalShares: 999n, curveId: 3n});

        const getVaultCall = pc.readContract.mock.calls.find(
            (c: unknown[]) => (c[0] as {functionName: string}).functionName === "getVault",
        );
        expect(getVaultCall?.[0]).toMatchObject({
            address: MULTI_VAULT,
            functionName: "getVault",
            args: [ATOM_ID, 3n],
        });
    });

    it("returns zero totals when the vault has no deposits yet", async () => {
        const pc = makeMockPublicClient();
        pc.readContract.mockImplementation(
            readContractDispatcher({
                getBondingCurveConfig: {
                    registry: "0x0000000000000000000000000000000000000001" as Address,
                    defaultCurveId: 1n,
                },
                getVault: [0n, 0n],
            }),
        );

        const state = await readVaultState({atomId: ATOM_ID, publicClient: pc});
        expect(state.totalAssets).toBe(0n);
        expect(state.totalShares).toBe(0n);
    });
});
