import {vi, type Mock} from "vitest";
import {
    type Account,
    type Address,
    type Chain,
    type Hex,
    type PublicClient,
    type Transport,
    type WalletClient,
} from "viem";
import {privateKeyToAccount} from "viem/accounts";

import {intuitionTestnet} from "../../lib/chains";

/**
 * Test doubles for viem PublicClient + WalletClient.
 *
 * Every method is a vi.fn() — by default it returns undefined, which makes
 * unexpected calls fail loudly inside the service under test (the service
 * tries to `.something` the undefined and explodes). Each test wires the
 * specific methods it needs via `mockImplementation` / `mockResolvedValue`.
 *
 * The cast through `unknown` is the supported viem testing pattern: the
 * full PublicClient/WalletClient interface is huge, we expose only what
 * the services consume.
 */

export type MockPublicClient = PublicClient & {
    readContract: Mock;
    writeContract: Mock;
    waitForTransactionReceipt: Mock;
    getLogs: Mock;
    getCode: Mock;
};

export type MockWalletClient = WalletClient<Transport, Chain, Account> & {
    writeContract: Mock;
    sendTransaction: Mock;
};

export function makeMockPublicClient(): MockPublicClient {
    return {
        readContract: vi.fn(),
        writeContract: vi.fn(),
        waitForTransactionReceipt: vi.fn().mockResolvedValue({
            status: "success",
            blockNumber: 1n,
            transactionHash: "0x" + "11".repeat(32),
        }),
        getLogs: vi.fn().mockResolvedValue([]),
        getCode: vi.fn(),
    } as unknown as MockPublicClient;
}

/**
 * A deterministic test account derived from a fixed private key — useful
 * when a test needs to assert on the account address.
 */
const DEFAULT_TEST_PK: Hex = `0x${"01".repeat(32)}`;
export const DEFAULT_TEST_ACCOUNT = privateKeyToAccount(DEFAULT_TEST_PK);
export const DEFAULT_TEST_ADDRESS: Address = DEFAULT_TEST_ACCOUNT.address;

export function makeMockWalletClient(overrides?: {
    address?: Address;
}): MockWalletClient {
    const account =
        overrides?.address && overrides.address !== DEFAULT_TEST_ADDRESS
            ? ({...DEFAULT_TEST_ACCOUNT, address: overrides.address} as Account)
            : DEFAULT_TEST_ACCOUNT;

    return {
        account,
        chain: intuitionTestnet,
        writeContract: vi.fn().mockResolvedValue(`0x${"aa".repeat(32)}`),
        sendTransaction: vi.fn().mockResolvedValue(`0x${"bb".repeat(32)}`),
    } as unknown as MockWalletClient;
}

/**
 * Build a `readContract` implementation that dispatches by `functionName`.
 * Throws on unknown calls — tests should be explicit about every read
 * they expect to happen.
 */
export function readContractDispatcher(
    responses: Record<string, unknown>,
): (args: {functionName: string}) => Promise<unknown> {
    return async (args) => {
        if (!(args.functionName in responses)) {
            throw new Error(
                `Unexpected readContract call: ${args.functionName}. ` +
                    `Test must wire a response for it.`,
            );
        }
        const value = responses[args.functionName];
        if (typeof value === "function") return (value as (a: unknown) => unknown)(args);
        return value;
    };
}
