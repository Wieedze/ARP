import {beforeEach, describe, expect, it, vi, type Mock} from "vitest";
import {parseEther, zeroAddress, type Account, type Address, type Hex} from "viem";

import {intuitionTestnet} from "../../lib/chains";
import {
    INTUITION_MAINNET_CHAIN_ID,
    INTUITION_MAINNET_MULTIVAULT,
    intuitionMainnet,
} from "../../lib/intuition-mainnet";
import {
    assertMainnetWallet,
    deriveMinShares,
    parseStakeAmount,
    quoteStake,
    readClaimVaults,
    readStakeSession,
    resolveMaxStakeWei,
    resolveStakeTermId,
    StakeGuardError,
    submitStake,
} from "../trust-stake";

import {DEFAULT_TEST_ACCOUNT, DEFAULT_TEST_ADDRESS, readContractDispatcher} from "./fixtures";

const TRIPLE: Hex = `0x${"11".repeat(32)}`;
const COUNTER: Hex = `0x${"99".repeat(32)}`;
const LIMITS = {minDeposit: parseEther("0.01"), maxStake: parseEther("1")};

type StakeMockPublicClient = {
    readContract: Mock;
    simulateContract: Mock;
};

type StakeMockWalletClient = {
    account: Account;
    chain: {id: number};
    getChainId: Mock;
    writeContract: Mock;
};

function makePublicClient(): StakeMockPublicClient {
    return {
        readContract: vi.fn(),
        simulateContract: vi.fn().mockResolvedValue({result: 9_875_000_000_000_000n}),
    };
}

function makeWalletClient(
    chainId = INTUITION_MAINNET_CHAIN_ID,
    liveChainId = chainId,
): StakeMockWalletClient {
    return {
        account: DEFAULT_TEST_ACCOUNT,
        chain: chainId === INTUITION_MAINNET_CHAIN_ID ? intuitionMainnet : intuitionTestnet,
        getChainId: vi.fn().mockResolvedValue(liveChainId),
        writeContract: vi.fn().mockResolvedValue(`0x${"aa".repeat(32)}`),
    };
}

// The services take viem client interfaces; the doubles expose only the
// methods under test, which is the supported viem testing shape.
/* eslint-disable @typescript-eslint/no-explicit-any */
const asPublic = (client: StakeMockPublicClient) => client as any;
const asWallet = (client: StakeMockWalletClient) => client as any;
/* eslint-enable @typescript-eslint/no-explicit-any */

describe("resolveMaxStakeWei", () => {
    it("defaults to 1 TRUST when the env var is absent", () => {
        expect(resolveMaxStakeWei(undefined)).toBe(parseEther("1"));
        expect(resolveMaxStakeWei("")).toBe(parseEther("1"));
        expect(resolveMaxStakeWei("   ")).toBe(parseEther("1"));
    });

    it("honours a deliberate ceiling", () => {
        expect(resolveMaxStakeWei("0.25")).toBe(parseEther("0.25"));
        expect(resolveMaxStakeWei("5")).toBe(parseEther("5"));
    });

    it("falls back rather than removing the backstop on a bad value", () => {
        expect(resolveMaxStakeWei("abc")).toBe(parseEther("1"));
        expect(resolveMaxStakeWei("0")).toBe(parseEther("1"));
        expect(resolveMaxStakeWei("-2")).toBe(parseEther("1"));
    });
});

describe("parseStakeAmount", () => {
    it("treats an empty field as empty, never as zero", () => {
        expect(parseStakeAmount("", LIMITS)).toEqual({status: "empty"});
        expect(parseStakeAmount("   ", LIMITS)).toEqual({status: "empty"});
    });

    it("rejects anything that is not a plain decimal", () => {
        expect(parseStakeAmount("abc", LIMITS).status).toBe("invalid");
        expect(parseStakeAmount("1e18", LIMITS).status).toBe("invalid");
        expect(parseStakeAmount("-1", LIMITS).status).toBe("invalid");
        expect(parseStakeAmount(".", LIMITS).status).toBe("invalid");
        expect(parseStakeAmount("0", LIMITS).status).toBe("invalid");
    });

    it("enforces the MultiVault's own minimum with the real number in the message", () => {
        const result = parseStakeAmount("0.005", LIMITS);
        expect(result.status).toBe("below-min");
        if (result.status !== "below-min") throw new Error("unreachable");
        expect(result.message).toContain("0.01");
    });

    it("enforces the UI ceiling", () => {
        const result = parseStakeAmount("1.5", LIMITS);
        expect(result.status).toBe("above-max");
        if (result.status !== "above-max") throw new Error("unreachable");
        expect(result.message).toContain("VITE_MAX_STAKE_TRUST");
    });

    it("accepts the boundaries themselves", () => {
        expect(parseStakeAmount("0.01", LIMITS)).toEqual({
            status: "ok",
            value: parseEther("0.01"),
        });
        expect(parseStakeAmount("1", LIMITS)).toEqual({status: "ok", value: parseEther("1")});
    });
});

describe("deriveMinShares", () => {
    it("takes the tolerance off the preview", () => {
        expect(deriveMinShares(10_000n)).toBe(9_900n);
        expect(deriveMinShares(9_875_000_000_000_000n)).toBe(9_776_250_000_000_000n);
    });

    it("never returns zero, which would disable slippage protection", () => {
        expect(deriveMinShares(1n)).toBe(1n);
        expect(deriveMinShares(50n)).toBeGreaterThan(0n);
    });

    it("refuses a preview that mints nothing rather than passing 0", () => {
        expect(() => deriveMinShares(0n)).toThrow(StakeGuardError);
        try {
            deriveMinShares(0n);
        } catch (error) {
            expect((error as StakeGuardError).code).toBe("no-slippage-floor");
        }
    });
});

describe("readStakeSession", () => {
    it("queries the curve and the deposit minimum rather than hardcoding them", async () => {
        const client = makePublicClient();
        client.readContract.mockImplementation(
            readContractDispatcher({
                getBondingCurveConfig: {registry: zeroAddress, defaultCurveId: 3n},
                getGeneralConfig: {
                    admin: zeroAddress,
                    protocolMultisig: zeroAddress,
                    feeDenominator: 10_000n,
                    trustBonding: zeroAddress,
                    minDeposit: parseEther("0.02"),
                    minShare: 1_000_000n,
                    atomDataMaxLength: 1000n,
                    feeThreshold: parseEther("1"),
                },
            }),
        );

        await expect(readStakeSession(asPublic(client))).resolves.toEqual({
            curveId: 3n,
            minDeposit: parseEther("0.02"),
            minShare: 1_000_000n,
        });
    });
});

describe("resolveStakeTermId", () => {
    it("supports by depositing into the triple itself — no extra call", async () => {
        const client = makePublicClient();
        await expect(
            resolveStakeTermId(asPublic(client), {tripleId: TRIPLE, side: "support"}),
        ).resolves.toBe(TRIPLE);
        expect(client.readContract).not.toHaveBeenCalled();
    });

    it("opposes through the counter-triple the MultiVault derives", async () => {
        const client = makePublicClient();
        client.readContract.mockImplementation(
            readContractDispatcher({getCounterIdFromTripleId: COUNTER}),
        );

        await expect(
            resolveStakeTermId(asPublic(client), {tripleId: TRIPLE, side: "oppose"}),
        ).resolves.toBe(COUNTER);
        expect(client.readContract.mock.calls[0][0].args).toEqual([TRIPLE]);
    });
});

describe("quoteStake", () => {
    const session = {curveId: 1n, minDeposit: parseEther("0.01"), minShare: 1_000_000n};

    function wire(client: StakeMockPublicClient) {
        client.readContract.mockImplementation(
            readContractDispatcher({
                getCounterIdFromTripleId: COUNTER,
                previewDeposit: [9_875_000_000_000_000n, 9_875_000_000_000_000n],
                getVault: [987_500_001_000_000n, 987_500_001_000_000n],
                currentSharePrice: 10n ** 18n,
                getShares: 0n,
            }),
        );
    }

    it("previews against the vault the deposit would actually land in", async () => {
        const client = makePublicClient();
        wire(client);

        const quote = await quoteStake(asPublic(client), {
            tripleId: TRIPLE,
            side: "oppose",
            assets: parseEther("0.01"),
            receiver: DEFAULT_TEST_ADDRESS,
            session,
        });

        expect(quote.termId).toBe(COUNTER);
        const preview = client.readContract.mock.calls.find(
            (call) => call[0].functionName === "previewDeposit",
        );
        expect(preview?.[0].args).toEqual([COUNTER, 1n, parseEther("0.01")]);
    });

    it("reports the fee gap and a non-zero slippage floor", async () => {
        const client = makePublicClient();
        wire(client);

        const quote = await quoteStake(asPublic(client), {
            tripleId: TRIPLE,
            side: "support",
            assets: parseEther("0.01"),
            receiver: DEFAULT_TEST_ADDRESS,
            session,
        });

        expect(quote.expectedShares).toBe(9_875_000_000_000_000n);
        expect(quote.assetsAfterFees).toBe(9_875_000_000_000_000n);
        expect(quote.feeAssets).toBe(parseEther("0.01") - 9_875_000_000_000_000n);
        expect(quote.minShares).toBe(9_776_250_000_000_000n);
        expect(quote.minShares).toBeGreaterThan(0n);
    });

    it("refuses a zero receiver and a zero amount", async () => {
        const client = makePublicClient();
        wire(client);

        await expect(
            quoteStake(asPublic(client), {
                tripleId: TRIPLE,
                side: "support",
                assets: parseEther("0.01"),
                receiver: zeroAddress,
                session,
            }),
        ).rejects.toThrow(StakeGuardError);

        await expect(
            quoteStake(asPublic(client), {
                tripleId: TRIPLE,
                side: "support",
                assets: 0n,
                receiver: DEFAULT_TEST_ADDRESS,
                session,
            }),
        ).rejects.toThrow(StakeGuardError);
    });
});

describe("readClaimVaults", () => {
    it("reads both sides and the connected account's own shares", async () => {
        const client = makePublicClient();
        client.readContract.mockImplementation(
            readContractDispatcher({
                getCounterIdFromTripleId: COUNTER,
                getVault: [1n, 2n],
                currentSharePrice: 10n ** 18n,
                getShares: 7n,
            }),
        );

        const vaults = await readClaimVaults(asPublic(client), {
            tripleId: TRIPLE,
            curveId: 1n,
            account: DEFAULT_TEST_ADDRESS,
        });

        expect(vaults.support.termId).toBe(TRIPLE);
        expect(vaults.opposition.termId).toBe(COUNTER);
        expect(vaults.support.shares).toBe(7n);
    });

    it("leaves shares null when nobody is connected", async () => {
        const client = makePublicClient();
        client.readContract.mockImplementation(
            readContractDispatcher({
                getCounterIdFromTripleId: COUNTER,
                getVault: [1n, 2n],
                currentSharePrice: 10n ** 18n,
            }),
        );

        const vaults = await readClaimVaults(asPublic(client), {
            tripleId: TRIPLE,
            curveId: 1n,
            account: null,
        });
        expect(vaults.support.shares).toBeNull();
    });
});

describe("assertMainnetWallet", () => {
    it("passes only on 1155", () => {
        expect(() => assertMainnetWallet(INTUITION_MAINNET_CHAIN_ID)).not.toThrow();
        expect(() => assertMainnetWallet(13579)).toThrow(StakeGuardError);
        expect(() => assertMainnetWallet(undefined)).toThrow(StakeGuardError);
    });
});

describe("submitStake", () => {
    const quote = {
        side: "support" as const,
        tripleId: TRIPLE,
        termId: TRIPLE,
        curveId: 1n,
        receiver: DEFAULT_TEST_ADDRESS,
        assets: parseEther("0.01"),
        expectedShares: 9_875_000_000_000_000n,
        assetsAfterFees: 9_875_000_000_000_000n,
        feeAssets: 125_000_000_000_000n,
        minShares: 9_776_250_000_000_000n,
        vault: {
            termId: TRIPLE,
            curveId: 1n,
            totalAssets: 1n,
            totalShares: 1n,
            sharePrice: 10n ** 18n,
            shares: 0n,
        },
    };

    let publicClient: StakeMockPublicClient;

    beforeEach(() => {
        publicClient = makePublicClient();
    });

    it("refuses to build a transaction from a wallet on the wrong chain", async () => {
        const wallet = makeWalletClient(13579);

        await expect(
            submitStake({
                walletClient: asWallet(wallet),
                publicClient: asPublic(publicClient),
                quote,
            }),
        ).rejects.toMatchObject({code: "wrong-chain"});

        expect(wallet.writeContract).not.toHaveBeenCalled();
        expect(publicClient.simulateContract).not.toHaveBeenCalled();
    });

    it("refuses a wallet that claims 1155 but reports another chain", async () => {
        // A client built for mainnet whose user has since switched networks.
        const wallet = makeWalletClient(INTUITION_MAINNET_CHAIN_ID, 13579);

        await expect(
            submitStake({
                walletClient: asWallet(wallet),
                publicClient: asPublic(publicClient),
                quote,
            }),
        ).rejects.toMatchObject({code: "wrong-chain"});

        expect(wallet.writeContract).not.toHaveBeenCalled();
        expect(publicClient.simulateContract).not.toHaveBeenCalled();
    });

    it("refuses a receiver that is not the connected account", async () => {
        const wallet = makeWalletClient();
        const otherReceiver = "0x000000000000000000000000000000000000BEEF" as Address;

        await expect(
            submitStake({
                walletClient: asWallet(wallet),
                publicClient: asPublic(publicClient),
                quote: {...quote, receiver: otherReceiver},
            }),
        ).rejects.toMatchObject({code: "receiver-mismatch"});
        expect(wallet.writeContract).not.toHaveBeenCalled();
    });

    it("refuses a zero receiver and a zero slippage floor", async () => {
        const wallet = makeWalletClient();

        await expect(
            submitStake({
                walletClient: asWallet(wallet),
                publicClient: asPublic(publicClient),
                quote: {...quote, receiver: zeroAddress},
            }),
        ).rejects.toMatchObject({code: "zero-receiver"});

        await expect(
            submitStake({
                walletClient: asWallet(wallet),
                publicClient: asPublic(publicClient),
                quote: {...quote, minShares: 0n},
            }),
        ).rejects.toMatchObject({code: "no-slippage-floor"});

        expect(wallet.writeContract).not.toHaveBeenCalled();
    });

    it("simulates before signing, and does not sign when the simulation reverts", async () => {
        const wallet = makeWalletClient();
        publicClient.simulateContract.mockRejectedValue(new Error("execution reverted"));

        await expect(
            submitStake({
                walletClient: asWallet(wallet),
                publicClient: asPublic(publicClient),
                quote,
            }),
        ).rejects.toThrow("execution reverted");
        expect(wallet.writeContract).not.toHaveBeenCalled();
    });

    it("sends the deposit with the quoted arguments, on mainnet", async () => {
        const wallet = makeWalletClient();

        const hash = await submitStake({
            walletClient: asWallet(wallet),
            publicClient: asPublic(publicClient),
            quote,
        });

        expect(hash).toBe(`0x${"aa".repeat(32)}`);
        expect(publicClient.simulateContract).toHaveBeenCalledTimes(1);

        const call = wallet.writeContract.mock.calls[0][0];
        expect(call.address).toBe(INTUITION_MAINNET_MULTIVAULT);
        expect(call.functionName).toBe("deposit");
        expect(call.args).toEqual([DEFAULT_TEST_ADDRESS, TRIPLE, 1n, 9_776_250_000_000_000n]);
        expect(call.value).toBe(parseEther("0.01"));
        expect(call.chain.id).toBe(INTUITION_MAINNET_CHAIN_ID);
    });
});
