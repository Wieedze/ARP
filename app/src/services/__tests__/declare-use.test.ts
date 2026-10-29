import {describe, expect, it, vi} from "vitest";
import {asAgentIdentityAtom, type AgentIdentityAtom} from "@arp-protocol/core";
import {parseEther, type Address, type Hex} from "viem";

import {intuitionTestnet} from "../../lib/chains";
import {INTUITION_MAINNET_CHAIN_ID, intuitionMainnet} from "../../lib/intuition-mainnet";
import {
    DeclareUseGuardError,
    parseAgentRef,
    planUseDeclaration,
    submitUseDeclaration,
    type DeclaredUse,
} from "../declare-use";
import {MAX_STAKE_WEI} from "../trust-stake";
import {DEFAULT_TEST_ACCOUNT, makeMockPublicClient, type MockPublicClient} from "./fixtures";

/**
 * Tests for the write path on `/atom/:atomId` — the one that pays a non-recoverable fee.
 *
 * ADR `0017` names the verification method for a surface like this in its own build rule: "unit
 * tests over a mocked wallet client, `previewDeposit` reads, and `eth_call` simulation. **A passing
 * test suite is not a reason to spend real TRUST.**" Every guard is exercised here and none on
 * chain.
 *
 * Asserted on **`code`**, never on message text. `code` exists so a caller can branch without
 * parsing prose, and a discriminator nothing reads is what an untested guard looks like.
 *
 * The two reads that reach a network are injected: ownership (the ERC-8004 registry on the agent's
 * own chain) and the subject (the Intuition graph). Everything between them and the plan runs for
 * real, including the package's planner, because that is the chain that decides what gets signed.
 */

/** The `code` of a rejection, or a failure saying what was thrown instead. */
async function codeOf(work: Promise<unknown>): Promise<string> {
    try {
        await work;
    } catch (caught) {
        if (caught instanceof DeclareUseGuardError) return caught.code;
        throw caught;
    }
    throw new Error("expected a DeclareUseGuardError, nothing was thrown");
}

/**
 * **Testnet is the default fixture here, and that is the behaviour under test.**
 *
 * `planUseDeclaration` refuses mainnet outright: `security.md` authorises a human in the panel
 * under ADR `0017`, which scopes itself to deposits into `has trust provider` vaults, and a `uses`
 * edge is a different predicate and a creation rather than a deposit. So every happy path below is
 * on 13579 and the mainnet case is a guard, not a variant.
 */
const TESTNET = {
    chain: intuitionTestnet,
    chainId: 13579,
    multiVault: "0x2Ece8D4dEdcB9918A398528f3fa4688b1d2CAB91" as Address,
    symbol: "tTRUST",
    explorerUrl: "https://testnet.explorer.intuition.systems",
    isMainnet: false,
} as const;

const MAINNET = {
    chain: intuitionMainnet,
    chainId: INTUITION_MAINNET_CHAIN_ID,
    multiVault: "0x6E35cF57A41fA15eA0EaE9C33e751b01A784Fe7e" as Address,
    symbol: "TRUST",
    explorerUrl: "https://explorer.intuition.systems",
    isMainnet: true,
} as const;

const AGENT = {chainId: 8453, tokenId: "1380"};
const CAIP19 = "eip155:8453/erc721:0x8004A169FB4a3325136EB29fA0ceB6D2e539a432/1380";
const OBJECT = `0x${"ab".repeat(32)}` as Hex;
const TRIPLE = `0x${"cd".repeat(32)}` as Hex;
const SUBJECT: AgentIdentityAtom = asAgentIdentityAtom(`0x${"ef".repeat(32)}`, CAIP19);
const OWNER = DEFAULT_TEST_ACCOUNT.address;

/**
 * Testnet 13579's measured figures (`DeclarePlan.totalValue`'s own table).
 *
 * **100x below mainnet's**, which is the whole reason a cost is read per plan and never carried as
 * a constant (`rules/portability.md` rule 3). A budget tuned on these numbers does not transfer.
 */
const TRIPLE_COST = parseEther("0.001000000002");
const MIN_DEPOSIT = parseEther("0.001");
const TOTAL = TRIPLE_COST + MIN_DEPOSIT;
/**
 * What the chain says reaches the vault — **100 bps** off the deposit on a triple on 13579,
 * measured today by `scripts/measure/preview-before-create.ts testnet`:
 * `previewTripleCreate(0.002000000002)` returns `assetsAfterFees` 990000000000000 against a
 * `minDeposit` of 0.001.
 *
 * This read "175 bps off the deposit, the measured entry fee", copied from
 * `tool-register.test.ts` — which states its own context properly as *mainnet 1155's measured
 * **atom** entry fee*. The copy dropped the chain and the term kind into a file whose fixture is
 * testnet and whose term is a triple, where the figure is different. `claims.md` §2: one number,
 * one context, and name the script.
 */
const AFTER_FEES = (MIN_DEPOSIT * 9900n) / 10_000n;
/**
 * Deliberately **not** equal to `AFTER_FEES`.
 *
 * `previewTripleCreate` returns `[shares, assetsAfterFixedFees, assetsAfterFees]`, so a fixture
 * repeating one value across the first and third lets a service that confuses them pass. ADR
 * `0017` safeguard 6 exists to keep those two distinguishable.
 */
const SHARES = AFTER_FEES - 1n;

const ownedBy = (owner: Address) =>
    vi.fn().mockResolvedValue({
        status: "owned" as const,
        ref: AGENT,
        caip19: CAIP19,
        owner,
        connected: owner,
        registrationFile: null,
    });

const resolvesSubject = vi.fn().mockResolvedValue(SUBJECT);

type Reads = {
    atomExists?: boolean;
    tripleExists?: boolean;
    shares?: bigint;
    tripleCost?: bigint;
};

function publicClientWith(reads: Reads = {}): MockPublicClient {
    const pc = makeMockPublicClient();
    (pc as unknown as {call: ReturnType<typeof vi.fn>}).call = vi.fn().mockResolvedValue({});
    pc.readContract.mockImplementation(
        async (args: {functionName: string; args?: readonly unknown[]}) => {
            switch (args.functionName) {
                case "calculateTripleId":
                    return TRIPLE;
                // Asked for the object atom and for the edge, in that order. Dispatching on the
                // argument rather than on call count, because the planner awaits them together.
                case "isTermCreated":
                    return args.args?.[0] === TRIPLE
                        ? (reads.tripleExists ?? false)
                        : (reads.atomExists ?? true);
                case "getTripleCost":
                    return reads.tripleCost ?? TRIPLE_COST;
                case "getGeneralConfig":
                    return {minDeposit: MIN_DEPOSIT};
                case "previewTripleCreate": {
                    const shares = reads.shares ?? SHARES;
                    return [shares, MIN_DEPOSIT, shares === 0n ? 0n : AFTER_FEES];
                }
                default:
                    throw new Error(`unexpected read: ${args.functionName}`);
            }
        },
    );
    return pc;
}

function planWith(reads: Reads = {}, overrides: Record<string, unknown> = {}) {
    return planUseDeclaration({
        agent: AGENT,
        connected: OWNER,
        object: OBJECT,
        publicClient: publicClientWith(reads),
        chain: TESTNET,
        ownership: ownedBy(OWNER) as never,
        subject: resolvesSubject as never,
        ...overrides,
    });
}

function walletOn(chainId: number) {
    return {
        account: DEFAULT_TEST_ACCOUNT,
        chain: chainId === 13579 ? intuitionTestnet : {id: chainId},
        getChainId: vi.fn().mockResolvedValue(chainId),
        sendTransaction: vi.fn().mockResolvedValue(`0x${"11".repeat(32)}` as Hex),
    };
}

function declarationOf(overrides: Partial<DeclaredUse> = {}): DeclaredUse {
    return {
        chain: TESTNET,
        agent: AGENT,
        subject: SUBJECT,
        object: OBJECT,
        tripleId: TRIPLE,
        exists: false,
        calls: [
            {
                kind: "create-triple",
                chainId: 13579,
                to: TESTNET.multiVault,
                value: TOTAL,
                data: "0xdeadbeef",
                why: "declare",
                preview: {shares: SHARES, assetsAfterFees: AFTER_FEES},
            },
        ],
        totalValue: TOTAL,
        creationFee: TRIPLE_COST,
        assetsAfterFees: AFTER_FEES,
        feeAssets: TOTAL - AFTER_FEES,
        shares: SHARES,
        ...overrides,
    };
}

describe("parseAgentRef", () => {
    it("reads chain and token out of chain/token", () => {
        expect(parseAgentRef(" 8453 / 1380 ")).toEqual({chainId: 8453, tokenId: "1380"});
    });

    it("refuses a bare token id rather than defaulting its chain", async () => {
        // The registry is at the same address on several chains (ADR `0027`), so id 1380 names a
        // different agent on each. A default would silently declare for a stranger.
        expect(await codeOf(Promise.reject(tryParse("1380")))).toBe("bad-agent-ref");
        expect(await codeOf(Promise.reject(tryParse("base/1380")))).toBe("bad-agent-ref");
    });
});

/** `parseAgentRef` is synchronous; this hands its throw to `codeOf` unchanged. */
function tryParse(input: string): unknown {
    try {
        parseAgentRef(input);
    } catch (caught) {
        return caught;
    }
    return new Error(`expected a throw for ${input}`);
}

describe("planUseDeclaration", () => {
    it("prices the claim at the triple fee plus the chain's minimum deposit", async () => {
        const plan = await planWith();

        // ADR `0053`: the fee alone seeds the vault with `minShare` and leaves the edge at zero
        // positions — on the chain, and not a market. So the floor is fee + minDeposit, and both
        // are read from the chain rather than assumed (`rules/portability.md` rule 3).
        expect(plan.totalValue).toBe(TOTAL);
        expect(plan.creationFee).toBe(TRIPLE_COST);
        expect(plan.shares).toBe(SHARES);
        expect(plan.exists).toBe(false);
        expect(plan.tripleId).toBe(TRIPLE);
        expect(plan.subject).toBe(SUBJECT);
    });

    it("reads what reaches the vault instead of subtracting the fee from the total", async () => {
        const plan = await planWith();

        // The defect this guards: `Your position` was rendered as `totalValue - creationFee`, which
        // ignores the entry fee. On 13579 that printed 0.001 tTRUST directly above
        // `Shares minted 0.00099` — the panel contradicting itself on screen.
        expect(plan.assetsAfterFees).toBe(AFTER_FEES);
        expect(plan.feeAssets).toBe(TOTAL - AFTER_FEES);
        // The whole point: the two are not equal, so a subtraction cannot stand in for the read.
        expect(plan.assetsAfterFees).not.toBe(plan.totalValue - plan.creationFee);
        // And the fee is more than the flat creation fee, because three things take a bite.
        expect(plan.feeAssets).toBeGreaterThan(plan.creationFee);
    });

    it("carries the subject the package resolved, never the connected wallet", async () => {
        const plan = await planWith();

        // ADR `0032`: the subject is the registration-derived atom, reached through `same as`. The
        // operating wallet's `caip10:` atom works, costs the same and is invisible to
        // `getCapabilities` — 21 such triples exist on testnet and Intuition has no deletion.
        expect(plan.subject).not.toBe(OWNER);
        expect(resolvesSubject).toHaveBeenCalled();
    });

    it("plans nothing to send when the claim is already on chain", async () => {
        const plan = await planWith({tripleExists: true});

        // A receipt written twice pays the fee twice and says nothing new (ADR `0056` §1).
        expect(plan.exists).toBe(true);
        expect(plan.calls).toHaveLength(0);
        expect(plan.totalValue).toBe(0n);
        expect(plan.creationFee).toBe(0n);
    });

    it("refuses when the registry does not have the agent", async () => {
        const ownership = vi
            .fn()
            .mockResolvedValue({status: "not-found", ref: AGENT, caip19: CAIP19});
        expect(await codeOf(planWith({}, {ownership}))).toBe("agent-not-found");
    });

    it("refuses when the connected wallet is not the owner the registry names", async () => {
        const stranger = "0x00000000000000000000000000000000000000ff" as Address;
        const ownership = vi.fn().mockResolvedValue({
            status: "owner-mismatch",
            ref: AGENT,
            caip19: CAIP19,
            owner: stranger,
            connected: OWNER,
        });
        // The whole ownership proof, and it fails closed: the ERC-8004 registry names the owner, so
        // matching it *is* the authority to declare for that agent. Nothing else is asked for.
        expect(await codeOf(planWith({}, {ownership}))).toBe("not-the-owner");
    });

    it("names the missing identity atom rather than falling back to another subject", async () => {
        const subject = vi.fn().mockRejectedValue(new Error("no atom for " + CAIP19));
        // The common outcome, not the rare one: the mirror reaches 1 agent in 15 (ADR `0047`), so
        // this message has to say what to do rather than read as a failure.
        expect(await codeOf(planWith({}, {subject}))).toBe("no-identity-atom");
    });

    it("refuses when the chain does not hold the object atom the graph listed", async () => {
        // Reachable because the page decides to show the control from the indexer and the planner
        // asks the chain. An indexer one block ahead puts them out of step.
        expect(await codeOf(planWith({atomExists: false}))).toBe("object-not-on-chain");
    });

    it("refuses a claim that would be born with no position", async () => {
        // The package raises first, so this asserts the re-typing rather than a second check — a
        // downstream `shares === 0n` test would be unreachable (`rules/claims.md` §1).
        expect(await codeOf(planWith({shares: 0n}))).toBe("no-position");
    });

    it("refuses mainnet outright, before it reads anything", async () => {
        // The default chain is mainnet (`lib/chain-choice.ts`), where this write costs 0.11 TRUST
        // of which 0.1 never comes back. `security.md` authorises a human in the panel under ADR
        // `0017`, and that ADR covers a deposit into a `has trust provider` vault — not creating a
        // `uses` edge. Not yet authorised is not forbidden, and widening it is the user's decision.
        const ownership = ownedBy(OWNER);
        expect(await codeOf(planWith({}, {chain: MAINNET, ownership}))).toBe(
            "mainnet-not-authorised",
        );
        // Refused before the first read, so nothing is planned that cannot be signed.
        expect(ownership).not.toHaveBeenCalled();
    });

    it("refuses before the wallet opens when the cost is over the app's ceiling", async () => {
        // Known at plan time on purpose: a button that states a cost and then opens a wallet only
        // to refuse is a worse disclosure than no button.
        expect(await codeOf(planWith({tripleCost: MAX_STAKE_WEI + 1n}))).toBe("cost-above-ceiling");
    });
});

describe("submitUseDeclaration", () => {
    it("simulates, sends and waits, once per call in the plan", async () => {
        const publicClient = publicClientWith();
        const walletClient = walletOn(13579);
        const hash = await submitUseDeclaration({
            walletClient: walletClient as never,
            publicClient,
            declaration: declarationOf(),
        });

        expect(hash).toBe(`0x${"11".repeat(32)}`);
        // `eth_call` before the signature, which is how staking code is verified here
        // (`rules/security.md`): a revert surfaces before any TRUST is spent.
        expect(
            (publicClient as unknown as {call: ReturnType<typeof vi.fn>}).call,
        ).toHaveBeenCalledTimes(1);
        expect(walletClient.sendTransaction).toHaveBeenCalledTimes(1);
        expect(publicClient.waitForTransactionReceipt).toHaveBeenCalledTimes(1);
    });

    it("refuses a wallet whose live chain is not the one the claim was priced on", async () => {
        // Both the client's `chain` and a live `getChainId()`. Each MultiVault is codeless on the
        // other chain, and a value-bearing call to a codeless address does not revert — it is a
        // plain transfer that succeeds, with no event and nothing to notice.
        const walletClient = walletOn(INTUITION_MAINNET_CHAIN_ID);
        expect(
            await codeOf(
                submitUseDeclaration({
                    walletClient: walletClient as never,
                    publicClient: publicClientWith(),
                    declaration: declarationOf(),
                }),
            ),
        ).toBe("wrong-chain");
        expect(walletClient.sendTransaction).not.toHaveBeenCalled();
    });

    it("refuses a call inside the plan that is valid on another chain", async () => {
        const walletClient = walletOn(13579);
        const declaration = declarationOf();
        const stray = {...declaration.calls[0]!, chainId: INTUITION_MAINNET_CHAIN_ID};
        expect(
            await codeOf(
                submitUseDeclaration({
                    walletClient: walletClient as never,
                    publicClient: publicClientWith(),
                    declaration: {...declaration, calls: [stray]},
                }),
            ),
        ).toBe("wrong-chain");
        expect(walletClient.sendTransaction).not.toHaveBeenCalled();
    });

    it("refuses to write a claim that already exists", async () => {
        const walletClient = walletOn(13579);
        expect(
            await codeOf(
                submitUseDeclaration({
                    walletClient: walletClient as never,
                    publicClient: publicClientWith(),
                    declaration: declarationOf({exists: true, calls: [], totalValue: 0n}),
                }),
            ),
        ).toBe("already-declared");
        expect(walletClient.sendTransaction).not.toHaveBeenCalled();
    });

    it("re-checks the ceiling at submit time, because a plan can be held", async () => {
        const walletClient = walletOn(13579);
        expect(
            await codeOf(
                submitUseDeclaration({
                    walletClient: walletClient as never,
                    publicClient: publicClientWith(),
                    declaration: declarationOf({totalValue: MAX_STAKE_WEI + 1n}),
                }),
            ),
        ).toBe("cost-above-ceiling");
        expect(walletClient.sendTransaction).not.toHaveBeenCalled();
    });
});
