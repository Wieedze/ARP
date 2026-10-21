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
    asStakeTermId,
    deriveMinAssets,
    parseShareAmount,
    quoteRedeem,
    quoteStake,
    readClaimVaults,
    readMaxRedeem,
    submitRedeem,
    readStakeSession,
    resolveMaxStakeWei,
    resolveStakeTermId,
    targetTermId,
    StakeGuardError,
    submitStake,
} from "../trust-stake";

import {DEFAULT_TEST_ACCOUNT, DEFAULT_TEST_ADDRESS, readContractDispatcher} from "./fixtures";

const TRIPLE: Hex = `0x${"11".repeat(32)}`;
const COUNTER: Hex = `0x${"99".repeat(32)}`;
/** An agent's identity atom. No counter vault exists for it — ADR `0056`. */
const ATOM: Hex = `0x${"77".repeat(32)}`;
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
            resolveStakeTermId(asPublic(client), {
                target: {kind: "triple", tripleId: TRIPLE},
                side: "support",
            }),
        ).resolves.toBe(TRIPLE);
        expect(client.readContract).not.toHaveBeenCalled();
    });

    it("opposes through the counter-triple the MultiVault derives", async () => {
        const client = makePublicClient();
        client.readContract.mockImplementation(
            readContractDispatcher({getCounterIdFromTripleId: COUNTER}),
        );

        await expect(
            resolveStakeTermId(asPublic(client), {
                target: {kind: "triple", tripleId: TRIPLE},
                side: "oppose",
            }),
        ).resolves.toBe(COUNTER);
        expect(client.readContract.mock.calls[0][0].args).toEqual([TRIPLE]);
    });

    it("supports an atom by depositing into the atom itself", async () => {
        const client = makePublicClient();
        await expect(
            resolveStakeTermId(asPublic(client), {
                target: {kind: "atom", atomId: ATOM},
                side: "support",
            }),
        ).resolves.toBe(ATOM);
        expect(client.readContract).not.toHaveBeenCalled();
    });

    /**
     * The one that matters. An atom has no counter vault, so resolving `oppose` to the atom's own
     * id would send a deposit meant to bet *against* something into the vault backing it — the
     * worst outcome of the two targets sharing a code path. ADR `0056`.
     */
    it("refuses to oppose an atom rather than resolving it to the atom itself", async () => {
        const client = makePublicClient();
        await expect(
            resolveStakeTermId(asPublic(client), {
                target: {kind: "atom", atomId: ATOM},
                side: "oppose",
            }),
        ).rejects.toMatchObject({code: "no-counter-vault"});
        expect(client.readContract).not.toHaveBeenCalled();
    });
});

describe("asStakeTermId", () => {
    it("accepts 32 bytes of hex and rejects everything else", () => {
        expect(asStakeTermId(TRIPLE)).toBe(TRIPLE);
        expect(asStakeTermId(null)).toBeNull();
        expect(asStakeTermId(undefined)).toBeNull();
        expect(asStakeTermId("")).toBeNull();
        // One nibble short, which is the shape a truncated indexer handle has.
        expect(asStakeTermId(TRIPLE.slice(0, -1))).toBeNull();
        expect(asStakeTermId(`${TRIPLE}0`)).toBeNull();
        expect(asStakeTermId("8453:0xabc:2340")).toBeNull();
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
            target: {kind: "triple", tripleId: TRIPLE},
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
            target: {kind: "triple", tripleId: TRIPLE},
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
                target: {kind: "triple", tripleId: TRIPLE},
                side: "support",
                assets: parseEther("0.01"),
                receiver: zeroAddress,
                session,
            }),
        ).rejects.toThrow(StakeGuardError);

        await expect(
            quoteStake(asPublic(client), {
                target: {kind: "triple", tripleId: TRIPLE},
                side: "support",
                assets: 0n,
                receiver: DEFAULT_TEST_ADDRESS,
                session,
            }),
        ).rejects.toThrow(StakeGuardError);
    });

    it("quotes an atom against the atom's own vault, deriving no counter id", async () => {
        const client = makePublicClient();
        wire(client);

        const quote = await quoteStake(asPublic(client), {
            target: {kind: "atom", atomId: ATOM},
            side: "support",
            assets: parseEther("0.01"),
            receiver: DEFAULT_TEST_ADDRESS,
            session,
        });

        expect(quote.termId).toBe(ATOM);
        expect(quote.target).toEqual({kind: "atom", atomId: ATOM});
        expect(
            client.readContract.mock.calls.some(
                (call) => call[0].functionName === "getCounterIdFromTripleId",
            ),
        ).toBe(false);
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
        target: {kind: "triple" as const, tripleId: TRIPLE},
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

/**
 * The exit. Its tests exist in their own right and not as a mirror of the deposit's: the two paths
 * fail differently. A deposit over the ceiling spends money the user did not mean to; a redemption
 * over the holding cannot spend anything, and the guard is there so it fails with a sentence in the
 * browser instead of a bare revert on-chain.
 */
describe("parseShareAmount", () => {
    const held = parseEther("3.113441379595912110");

    it("treats an empty field as no choice rather than as zero", () => {
        expect(parseShareAmount("", held)).toEqual({status: "empty"});
        expect(parseShareAmount("   ", held)).toEqual({status: "empty"});
    });

    it("refuses a non-number, a non-positive amount and more than the holding", () => {
        expect(parseShareAmount("all", held).status).toBe("unparseable");
        expect(parseShareAmount("0", held).status).toBe("not-positive");
        // `parseEther("-1")` succeeds and returns -1e18, so a negative reaches the sign check
        // rather than the parse failure. Refused either way; the status says which.
        expect(parseShareAmount("-1", held).status).toBe("not-positive");
        expect(parseShareAmount("3.2", held)).toEqual({status: "over", held});
    });

    /**
     * The exact holding passes. It is the value the "All of it" affordance puts in the field, and a
     * boundary that rejected it would make taking everything out impossible by one wei.
     */
    it("accepts the whole holding, to the wei", () => {
        expect(parseShareAmount("3.113441379595912110", held)).toEqual({
            status: "ok",
            value: held,
        });
    });
});

describe("deriveMinAssets", () => {
    it("floors 1% below the preview and never returns zero", () => {
        expect(deriveMinAssets(parseEther("1.5"))).toBe(parseEther("1.485"));
        // A preview so small that 99% of it rounds to nothing still yields a floor, because `0`
        // disables slippage protection outright — the same reason `deriveMinShares` clamps.
        expect(deriveMinAssets(1n)).toBe(1n);
    });

    it("refuses a preview of nothing rather than returning an unprotected floor", () => {
        expect(() => deriveMinAssets(0n)).toThrow(StakeGuardError);
        expect(() => deriveMinAssets(0n)).toThrowError(/no assets/);
    });

    it("honours an explicit tolerance", () => {
        expect(deriveMinAssets(parseEther("1"), 0n)).toBe(parseEther("1"));
        expect(deriveMinAssets(parseEther("1"), 5_000n)).toBe(parseEther("0.5"));
    });
});

describe("targetTermId", () => {
    it("is the triple id for a triple and the atom id for an atom", () => {
        expect(targetTermId({kind: "triple", tripleId: TRIPLE})).toBe(TRIPLE);
        expect(targetTermId({kind: "atom", atomId: ATOM})).toBe(ATOM);
    });
});

describe("readMaxRedeem", () => {
    it("asks the chain rather than deriving a ceiling from a share balance", async () => {
        const client = makePublicClient();
        client.readContract.mockImplementation(readContractDispatcher({maxRedeem: 42n}));

        await expect(
            readMaxRedeem(asPublic(client), {
                termId: ATOM,
                curveId: 1n,
                account: DEFAULT_TEST_ADDRESS,
            }),
        ).resolves.toBe(42n);
        expect(client.readContract.mock.calls[0][0].args).toEqual([DEFAULT_TEST_ADDRESS, ATOM, 1n]);
    });
});

describe("quoteRedeem", () => {
    const HELD = parseEther("3");

    function wireRedeem(client: StakeMockPublicClient) {
        client.readContract.mockImplementation(
            readContractDispatcher({
                previewRedeem: [parseEther("1.5"), parseEther("0.5")],
                maxRedeem: HELD,
            }),
        );
    }

    it("reports the TRUST out after fees and a non-zero slippage floor", async () => {
        const client = makePublicClient();
        wireRedeem(client);

        const quote = await quoteRedeem(asPublic(client), {
            termId: ATOM,
            curveId: 1n,
            shares: parseEther("0.5"),
            receiver: DEFAULT_TEST_ADDRESS,
        });

        expect(quote.assetsAfterFees).toBe(parseEther("1.5"));
        expect(quote.maxShares).toBe(HELD);
        // 1% below the preview, and never zero.
        expect(quote.minAssets).toBe(parseEther("1.485"));
        expect(quote.minAssets).toBeGreaterThan(0n);
    });

    it("refuses more shares than the account holds, before anything is signed", async () => {
        const client = makePublicClient();
        wireRedeem(client);

        await expect(
            quoteRedeem(asPublic(client), {
                termId: ATOM,
                curveId: 1n,
                shares: HELD + 1n,
                receiver: DEFAULT_TEST_ADDRESS,
            }),
        ).rejects.toMatchObject({code: "exceeds-holding"});
    });

    it("refuses a zero amount and a zero receiver", async () => {
        const client = makePublicClient();
        wireRedeem(client);

        await expect(
            quoteRedeem(asPublic(client), {
                termId: ATOM,
                curveId: 1n,
                shares: 0n,
                receiver: DEFAULT_TEST_ADDRESS,
            }),
        ).rejects.toMatchObject({code: "zero-amount"});

        await expect(
            quoteRedeem(asPublic(client), {
                termId: ATOM,
                curveId: 1n,
                shares: parseEther("0.5"),
                receiver: zeroAddress,
            }),
        ).rejects.toMatchObject({code: "zero-receiver"});
    });

    it("refuses a preview that yields nothing rather than dropping the floor to zero", async () => {
        const client = makePublicClient();
        client.readContract.mockImplementation(
            readContractDispatcher({previewRedeem: [0n, 0n], maxRedeem: HELD}),
        );

        await expect(
            quoteRedeem(asPublic(client), {
                termId: ATOM,
                curveId: 1n,
                shares: parseEther("0.5"),
                receiver: DEFAULT_TEST_ADDRESS,
            }),
        ).rejects.toMatchObject({code: "no-slippage-floor"});
    });
});

describe("submitRedeem", () => {
    const exit = {
        termId: ATOM,
        curveId: 1n,
        receiver: DEFAULT_TEST_ADDRESS,
        shares: parseEther("0.5"),
        assetsAfterFees: parseEther("1.5"),
        sharesUsed: parseEther("0.5"),
        maxShares: parseEther("3"),
        minAssets: parseEther("1.485"),
    };

    it("refuses a wallet on the wrong chain and signs nothing", async () => {
        const wallet = makeWalletClient(13579);
        const client = makePublicClient();

        await expect(
            submitRedeem({
                walletClient: asWallet(wallet),
                publicClient: asPublic(client),
                quote: exit,
            }),
        ).rejects.toMatchObject({code: "wrong-chain"});
        expect(wallet.writeContract).not.toHaveBeenCalled();
        expect(client.simulateContract).not.toHaveBeenCalled();
    });

    /**
     * The client was built for mainnet and the wallet moved after the quote. Only `getChainId`
     * catches it, which is why both are asked — the same trap the deposit path has.
     */
    it("catches a wallet that switched networks after the quote was built", async () => {
        const wallet = makeWalletClient(INTUITION_MAINNET_CHAIN_ID, 13579);
        const client = makePublicClient();

        await expect(
            submitRedeem({
                walletClient: asWallet(wallet),
                publicClient: asPublic(client),
                quote: exit,
            }),
        ).rejects.toMatchObject({code: "wrong-chain"});
        expect(wallet.writeContract).not.toHaveBeenCalled();
    });

    it("refuses to send TRUST anywhere but the connected account", async () => {
        const wallet = makeWalletClient();
        const client = makePublicClient();

        await expect(
            submitRedeem({
                walletClient: asWallet(wallet),
                publicClient: asPublic(client),
                quote: {...exit, receiver: `0x${"cd".repeat(20)}`},
            }),
        ).rejects.toMatchObject({code: "receiver-mismatch"});
        expect(wallet.writeContract).not.toHaveBeenCalled();
    });

    it("simulates before signing, and sends the floor it was quoted", async () => {
        const wallet = makeWalletClient();
        const client = makePublicClient();
        client.simulateContract.mockResolvedValue({result: parseEther("1.5")});

        await submitRedeem({
            walletClient: asWallet(wallet),
            publicClient: asPublic(client),
            quote: exit,
        });

        expect(client.simulateContract).toHaveBeenCalledTimes(1);
        const sent = wallet.writeContract.mock.calls[0][0];
        expect(sent.functionName).toBe("redeem");
        expect(sent.args).toEqual([
            DEFAULT_TEST_ADDRESS,
            ATOM,
            1n,
            parseEther("0.5"),
            parseEther("1.485"),
        ]);
        // A redemption carries no `msg.value`, and sending one would be a silent loss.
        expect(sent.value).toBeUndefined();
    });
});
