import {beforeEach, describe, expect, it, vi, type Mock} from "vitest";
import {type Hex} from "viem";
import {privateKeyToAccount} from "viem/accounts";

import {intuitionTestnet} from "../../lib/chains";

import {makeMockWalletClient, type MockWalletClient} from "./fixtures";

// Mock the SDK and the publicClient before the service module is loaded.
// The cast pattern + manual return type avoids re-stating the full SDK
// shape — services only consume `address` and `getFactoryArgs`.
const mockToSmartAccount = vi.fn();
const mockGetCode = vi.fn();
const mockWaitForReceipt = vi.fn().mockResolvedValue({status: "success"});

vi.mock("@metamask/smart-accounts-kit", () => ({
    Implementation: {Hybrid: "Hybrid"},
    toMetaMaskSmartAccount: (...args: unknown[]) => mockToSmartAccount(...args),
}));

vi.mock("../../lib/clients", () => ({
    publicClient: {
        getCode: (...args: unknown[]) => mockGetCode(...args),
        waitForTransactionReceipt: (...args: unknown[]) =>
            mockWaitForReceipt(...args),
    },
}));

// Service must be imported AFTER vi.mock so the mocks are in place.
import {
    createUserSmartAccount,
    deploySmartAccountIfNeeded,
} from "../smart-account";

const PK: Hex = `0x${"02".repeat(32)}`;
const PK_ACCOUNT = privateKeyToAccount(PK);
const OWNER: Hex = "0x000000000000000000000000000000000000C0DE";

describe("createUserSmartAccount", () => {
    beforeEach(() => {
        mockToSmartAccount.mockReset();
        mockToSmartAccount.mockResolvedValue({
            address: "0x000000000000000000000000000000000000BEEF",
            getFactoryArgs: vi.fn(),
        });
    });

    it("dispatches to the private-key signer path when `signer.account` is provided", async () => {
        await createUserSmartAccount({owner: OWNER, signer: {account: PK_ACCOUNT}});

        expect(mockToSmartAccount).toHaveBeenCalledTimes(1);
        const args = mockToSmartAccount.mock.calls[0][0] as {
            implementation: string;
            deployParams: readonly [Hex, unknown[], unknown[], unknown[]];
            deploySalt: Hex;
            signer: {account: typeof PK_ACCOUNT};
        };
        expect(args.implementation).toBe("Hybrid");
        expect(args.deployParams).toEqual([OWNER, [], [], []]);
        expect(args.deploySalt).toBe("0x");
        expect(args.signer.account).toBe(PK_ACCOUNT);
    });

    it("dispatches to the walletClient signer path when `signer.walletClient` is provided", async () => {
        const wc = makeMockWalletClient();
        await createUserSmartAccount({owner: OWNER, signer: {walletClient: wc}});

        const args = mockToSmartAccount.mock.calls[0][0] as {
            signer: {walletClient: MockWalletClient};
        };
        expect(args.signer.walletClient).toBe(wc);
    });

    it("forwards a custom deploySalt for per-account address derivation", async () => {
        const salt: Hex = `0x${"99".repeat(32)}`;
        await createUserSmartAccount({
            owner: OWNER,
            signer: {account: PK_ACCOUNT},
            deploySalt: salt,
        });
        const args = mockToSmartAccount.mock.calls[0][0] as {deploySalt: Hex};
        expect(args.deploySalt).toBe(salt);
    });
});

describe("deploySmartAccountIfNeeded", () => {
    let funder: MockWalletClient;
    let smartAccount: {address: Hex; getFactoryArgs: Mock};

    beforeEach(() => {
        funder = makeMockWalletClient();
        smartAccount = {
            address: "0x000000000000000000000000000000000000BEEF" as Hex,
            getFactoryArgs: vi.fn(),
        };
        mockGetCode.mockReset();
        mockWaitForReceipt.mockClear();
    });

    it("returns null when the Smart Account already has bytecode (skip deploy)", async () => {
        mockGetCode.mockResolvedValue("0xff");

        const result = await deploySmartAccountIfNeeded({
            smartAccount: smartAccount as never,
            funderWalletClient: funder,
        });

        expect(result).toBeNull();
        expect(funder.sendTransaction).not.toHaveBeenCalled();
        expect(smartAccount.getFactoryArgs).not.toHaveBeenCalled();
    });

    it("sends the factory tx via the funder EOA when the SA is counterfactual", async () => {
        mockGetCode.mockResolvedValue("0x");
        smartAccount.getFactoryArgs.mockResolvedValue({
            factory: "0x000000000000000000000000000000000000FAC7" as Hex,
            factoryData: "0xdeadbeef" as Hex,
        });

        const hash = await deploySmartAccountIfNeeded({
            smartAccount: smartAccount as never,
            funderWalletClient: funder,
        });

        expect(hash).toBe(`0x${"bb".repeat(32)}`);
        expect(funder.sendTransaction).toHaveBeenCalledTimes(1);
        const txArgs = funder.sendTransaction.mock.calls[0][0] as {
            to: Hex;
            data: Hex;
            chain: {id: number};
        };
        expect(txArgs.to).toBe("0x000000000000000000000000000000000000FAC7");
        expect(txArgs.data).toBe("0xdeadbeef");
        expect(txArgs.chain.id).toBe(intuitionTestnet.id);
        expect(mockWaitForReceipt).toHaveBeenCalledWith({hash});
    });

    it("throws when getFactoryArgs returns no factory (misconfiguration guard)", async () => {
        mockGetCode.mockResolvedValue("0x");
        smartAccount.getFactoryArgs.mockResolvedValue({
            factory: undefined,
            factoryData: undefined,
        });

        await expect(
            deploySmartAccountIfNeeded({
                smartAccount: smartAccount as never,
                funderWalletClient: funder,
            }),
        ).rejects.toThrow(/no factory args/);
        expect(funder.sendTransaction).not.toHaveBeenCalled();
    });
});
