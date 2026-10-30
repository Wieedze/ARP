import {beforeEach, describe, expect, it, vi} from "vitest";
import {parseEther, type Address, type Hex} from "viem";

import {INTUITION_MAINNET_CHAIN_ID, intuitionMainnet} from "../../lib/intuition-mainnet";
import {MAX_STAKE_WEI} from "../trust-stake";
import {
    ToolRegisterGuardError,
    planToolRegistration,
    submitToolRegistration,
    type ToolRegistration,
} from "../tool-register";
import {DEFAULT_TEST_ACCOUNT, makeMockPublicClient, type MockPublicClient} from "./fixtures";

/**
 * Tests for the only write path on `/register`, which sends a real mainnet transaction.
 *
 * ADR `0017` names the verification method for a surface like this in its own build rule: "unit
 * tests over a mocked wallet client, `previewDeposit` reads, and `eth_call` simulation. **A passing
 * test suite is not a reason to spend real TRUST.**" So every guard is exercised here and none on
 * chain.
 *
 * Every guard is asserted on its **`code`**, not on its message. `code` exists so a caller can
 * branch without parsing prose, and a discriminator nothing reads is what an untested guard looks
 * like — which is how this file came to be written. Matching on message text would also make the
 * tests brittle against copy changes that are not behaviour changes.
 */

/** The `code` of a rejection, or a failure saying what was thrown instead. */
async function codeOf(work: Promise<unknown>): Promise<string> {
    try {
        await work;
    } catch (caught) {
        if (caught instanceof ToolRegisterGuardError) return caught.code;
        throw caught;
    }
    throw new Error("expected a ToolRegisterGuardError, nothing was thrown");
}

const MAINNET_MULTIVAULT = "0x6E35cF57A41fA15eA0EaE9C33e751b01A784Fe7e";

/** The chain a registration is priced on, as the service now takes it. */
const MAINNET = {
    chain: intuitionMainnet,
    chainId: INTUITION_MAINNET_CHAIN_ID,
    multiVault: MAINNET_MULTIVAULT as Address,
    symbol: "TRUST",
    explorerUrl: "https://explorer.intuition.systems",
    isMainnet: true,
} as const;
const ATOM_COST = parseEther("0.1");
const MIN_DEPOSIT = parseEther("0.01");
const ASSETS = ATOM_COST + MIN_DEPOSIT;
/** 175 bps off, which is mainnet 1155's measured atom entry fee (ADR `0053`). */
const AFTER_FEES = (MIN_DEPOSIT * 9825n) / 10_000n;
/**
 * Deliberately **not** equal to `AFTER_FEES`.
 *
 * `previewAtomCreate` returns `[shares, assetsAfterFixedFees, assetsAfterFees]`, and the fixture
 * returned the same number for the first and third — so a service returning `preview.shares` where
 * it means `preview.assetsAfterFees` passed every assertion. That pair is exactly what ADR `0017`
 * safeguard 6 exists to distinguish, which makes this the one fixture that must use three values.
 */
const SHARES = AFTER_FEES - 1n;

type Reads = {
    atomId?: Hex;
    exists?: boolean;
    shares?: bigint;
    atomCost?: bigint;
};

function publicClientWith(reads: Reads = {}): MockPublicClient {
    const pc = makeMockPublicClient();
    const atomId = reads.atomId ?? (`0x${"ab".repeat(32)}` as Hex);
    (pc as unknown as {call: ReturnType<typeof vi.fn>}).call = vi.fn().mockResolvedValue({});
    pc.readContract.mockImplementation(async (args: {functionName: string}) => {
        switch (args.functionName) {
            case "calculateAtomId":
                return atomId;
            case "isTermCreated":
                return reads.exists ?? false;
            case "getAtomCost":
                return reads.atomCost ?? ATOM_COST;
            case "getGeneralConfig":
                return {minDeposit: MIN_DEPOSIT};
            case "previewAtomCreate": {
                const shares = reads.shares ?? SHARES;
                return [shares, MIN_DEPOSIT, shares === 0n ? 0n : AFTER_FEES];
            }
            default:
                throw new Error(`unexpected readContract ${args.functionName}`);
        }
    });
    return pc;
}

/**
 * The graph read, stubbed so no network is touched.
 *
 * **Passed on every call, including the ones that do not assert on it.** `planToolRegistration`
 * builds the real `intuitionToolAtomLookup` when none is given, so a test that omits it reaches
 * Intuition's mainnet endpoint — two of these timed out at 5s once the suite grew, and before that
 * they were passing only because the network was fast. A test whose result depends on somebody
 * else's uptime is not a test.
 */
function lookupReturning(candidates: {termId: string; label: string | null; uri: string | null}[]) {
    const asked: string[] = [];
    return {
        asked,
        lookup: {
            async findByUrl(url: string) {
                asked.push(url);
                return candidates;
            },
        },
    };
}

/** No atom on the graph carries the URL — the common case, and the one most tests want. */
const noAtoms = {
    async findByUrl() {
        return [];
    },
};

function walletOn(chainId: number) {
    return {
        account: DEFAULT_TEST_ACCOUNT,
        chain: chainId === INTUITION_MAINNET_CHAIN_ID ? intuitionMainnet : {id: chainId},
        getChainId: vi.fn().mockResolvedValue(chainId),
        sendTransaction: vi.fn().mockResolvedValue(`0x${"cc".repeat(32)}` as Hex),
    };
}

function registrationOf(overrides: Partial<ToolRegistration> = {}): ToolRegistration {
    return {
        chain: MAINNET,
        input: "github.com/crytic/slither",
        normalisedUrl: "https://github.com/crytic/slither",
        atomUri: "ipfs://bafkreidf2beugrdbzvidlwibi46fhyanrh7v3noaucjahsllu2xjqtas44",
        atomId: `0x${"ab".repeat(32)}`,
        document: "{}",
        exists: false,
        existingCandidates: [],
        assets: ASSETS,
        creationFee: ATOM_COST,
        assetsAfterFees: AFTER_FEES,
        feeAssets: ASSETS - AFTER_FEES,
        shares: SHARES,
        ...overrides,
    };
}

describe("planToolRegistration", () => {
    let pc: MockPublicClient;

    beforeEach(() => {
        pc = publicClientWith();
    });

    it("refuses a URI it cannot normalise, instead of deriving something from it", async () => {
        // A `did:`, an `npm:` specifier, a bare word. Those have no URL to derive a document from,
        // and this screen is for URLs.
        for (const bad of ["", "did:web:example.org", "npm:slither"]) {
            expect(
                await codeOf(
                    planToolRegistration({
                        url: bad,
                        publicClient: pc as never,
                        chain: MAINNET,
                        lookup: noAtoms,
                    }),
                ),
            ).toBe("bad-url");
        }
    });

    it("derives the same atom from every spelling of one URL", async () => {
        const spellings = [
            "github.com/crytic/slither",
            "https://www.github.com/crytic/slither/",
            "HTTP://GitHub.com/crytic/slither#readme",
        ];
        const plans = [];
        for (const url of spellings) {
            plans.push(
                await planToolRegistration({
                    url,
                    publicClient: pc as never,
                    chain: MAINNET,
                    lookup: noAtoms,
                }),
            );
        }
        expect(new Set(plans.map((plan) => plan.atomUri)).size).toBe(1);
        expect(new Set(plans.map((plan) => plan.normalisedUrl)).size).toBe(1);
    });

    it("carries every fee number, not a lump total", async () => {
        // ADR `0017` safeguard 6: several fee layers apply, and implying 1:1 would be a lie. The
        // chain takes three bites — the flat creation fee, the entry fee, then shares rounded down.
        const plan = await planToolRegistration({
            url: "github.com/x",
            publicClient: pc as never,
            chain: MAINNET,
            lookup: noAtoms,
        });
        expect(plan.assets).toBe(ASSETS);
        expect(plan.creationFee).toBe(ATOM_COST);
        expect(plan.assetsAfterFees).toBe(AFTER_FEES);
        expect(plan.feeAssets).toBe(ASSETS - AFTER_FEES);
        expect(plan.assets).toBeGreaterThan(plan.assetsAfterFees);
        // Distinct from `assetsAfterFees`, so returning one where the other is meant fails here.
        expect(plan.shares).toBe(SHARES);
    });

    it("refuses a create the fees would leave with no position", async () => {
        // ADR `0053`. `previewAtomCreate` is callable before the term exists, so the refusal is free
        // — and it is the only slippage guard available here: `createAtoms` has no `minShares`.
        const zero = publicClientWith({shares: 0n});
        expect(
            await codeOf(
                planToolRegistration({
                    url: "github.com/x",
                    publicClient: zero as never,
                    chain: MAINNET,
                    lookup: noAtoms,
                }),
            ),
        ).toBe("no-position");
    });

    it("refuses above the ceiling at plan time, not at the wallet", async () => {
        // Safeguard 3. Checked here so the button never reads "Register — X TRUST" for an X this app
        // will not send; `submitToolRegistration` checks again because a plan can be held while the
        // chain's costs move.
        const expensive = publicClientWith({atomCost: MAX_STAKE_WEI + parseEther("1")});
        expect(
            await codeOf(
                planToolRegistration({
                    url: "github.com/x",
                    publicClient: expensive as never,
                    chain: MAINNET,
                    lookup: noAtoms,
                }),
            ),
        ).toBe("cost-above-ceiling");
    });

    it("costs nothing and previews nothing when the atom already exists", async () => {
        const plan = await planToolRegistration({
            url: "github.com/x",
            publicClient: publicClientWith({exists: true}) as never,
            chain: MAINNET,
            lookup: noAtoms,
        });
        expect(plan.exists).toBe(true);
        expect(plan.assets).toBe(0n);
        expect(plan.shares).toBe(0n);
        expect(plan.feeAssets).toBe(0n);
    });

    it("asks the lookup for both spellings and never for one twice", async () => {
        const {lookup, asked} = lookupReturning([]);
        await planToolRegistration({
            url: "https://www.github.com/crytic/slither/",
            publicClient: pc as never,
            chain: MAINNET,
            lookup,
        });
        // An atom on the graph carries whatever URL its creator typed, which is usually not the
        // normalised one — so searching only one spelling misses the atom the lookup exists to find.
        expect(asked).toEqual([
            "https://www.github.com/crytic/slither/",
            "https://github.com/crytic/slither",
        ]);
    });

    it("reports other atoms carrying the URL, excluding the one it derived", async () => {
        const derived = `0x${"ab".repeat(32)}`;
        const {lookup} = lookupReturning([
            {termId: derived, label: "ours", uri: null},
            {termId: `0x${"cd".repeat(32)}`, label: "someone else's", uri: null},
        ]);
        const plan = await planToolRegistration({
            url: "github.com/crytic/slither",
            publicClient: pc as never,
            chain: MAINNET,
            lookup,
        });
        // Reported, never chosen between: a deposit on the wrong one is permanent.
        expect(plan.existingCandidates.map((c) => c.label)).toEqual(["someone else's"]);
    });
});

describe("submitToolRegistration", () => {
    it("refuses when the wallet reports the wrong chain", async () => {
        // Both checks: the client's `chain` and a live `getChainId()`. A client built for one chain
        // reports that chain whatever the wallet is really doing.
        const pc = publicClientWith();
        for (const chainId of [13579, 1]) {
            expect(
                await codeOf(
                    submitToolRegistration({
                        walletClient: walletOn(chainId) as never,
                        publicClient: pc as never,
                        registration: registrationOf(),
                    }),
                ),
            ).toBe("wrong-chain");
        }
    });

    it("catches a client that reports mainnet while the wallet is elsewhere", async () => {
        /**
         * The case the **second** check exists for, and the one `wallet-client.ts` is written about:
         * a client built for one chain reports that chain whatever the wallet is really doing. The
         * first check reads `walletClient.chain?.id` and would pass here; only the live
         * `getChainId()` catches it.
         *
         * The other test sets both to the same value, so it exercises the first check twice.
         */
        const lying = {
            ...walletOn(INTUITION_MAINNET_CHAIN_ID),
            getChainId: vi.fn().mockResolvedValue(13579),
        };
        expect(
            await codeOf(
                submitToolRegistration({
                    walletClient: lying as never,
                    publicClient: publicClientWith() as never,
                    registration: registrationOf(),
                }),
            ),
        ).toBe("wrong-chain");
        expect(lying.sendTransaction).not.toHaveBeenCalled();
    });

    it("refuses to create a second atom for a tool that has one", async () => {
        expect(
            await codeOf(
                submitToolRegistration({
                    walletClient: walletOn(INTUITION_MAINNET_CHAIN_ID) as never,
                    publicClient: publicClientWith() as never,
                    registration: registrationOf({exists: true}),
                }),
            ),
        ).toBe("already-exists");
    });

    it("refuses above the ceiling even when the plan was built before it moved", async () => {
        expect(
            await codeOf(
                submitToolRegistration({
                    walletClient: walletOn(INTUITION_MAINNET_CHAIN_ID) as never,
                    publicClient: publicClientWith() as never,
                    registration: registrationOf({assets: MAX_STAKE_WEI + 1n}),
                }),
            ),
        ).toBe("cost-above-ceiling");
    });

    it("simulates before it signs, and sends the plan's own assets to the mainnet vault", async () => {
        const pc = publicClientWith();
        const wc = walletOn(INTUITION_MAINNET_CHAIN_ID);
        const hash = await submitToolRegistration({
            walletClient: wc as never,
            publicClient: pc as never,
            registration: registrationOf(),
        });

        const simulate = (pc as unknown as {call: ReturnType<typeof vi.fn>}).call;
        expect(simulate).toHaveBeenCalledTimes(1);
        expect(simulate.mock.calls[0][0]).toMatchObject({
            to: MAINNET_MULTIVAULT,
            value: ASSETS,
        });

        const sent = wc.sendTransaction.mock.calls[0][0] as {
            to: Address;
            value: bigint;
            chain: {id: number};
        };
        expect(sent.to).toBe(MAINNET_MULTIVAULT);
        expect(sent.value).toBe(ASSETS);
        expect(sent.chain.id).toBe(INTUITION_MAINNET_CHAIN_ID);
        expect(pc.waitForTransactionReceipt).toHaveBeenCalledWith({hash});
    });
});
