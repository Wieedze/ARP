import {decodeFunctionData, keccak256, stringToBytes, type Address, type Hex} from "viem";
import {privateKeyToAccount} from "viem/accounts";
import {describe, expect, it} from "vitest";

import {multiVaultDeclareAbi, type MultiVaultReads} from "../src/declare/multivault.js";
import {hireDigest, signHireReceipt, type HireReceipt} from "../src/hire-receipt.js";
import {contentDigest, signContentReceipt, type ContentReceipt} from "../src/receipt.js";
import {
    DEPOSIT_APPROVAL,
    encodeApproveDeposit,
    multiVaultApproveAbi,
    planDepositApproval,
} from "../src/sponsor/approval.js";
import {
    ADR_0092_LIMITS,
    checkDepositLimits,
    checkGasLimits,
    checkPublishLimits,
    spentOnDay,
    sponsoredPositions,
    utcDay,
    withdrawnBps,
    type SponsorLimits,
    type SponsorRecord,
} from "../src/sponsor/limits.js";
import {
    planSponsoredDeposit,
    SponsoredBelowMinDepositError,
    SponsoredTermMissingError,
    SponsoredZeroSharesError,
} from "../src/sponsor/plan.js";
import {checkSponsorProof, type AgentKeyReads, type PaymentReads} from "../src/sponsor/proof.js";
import {
    signSponsorRequest,
    sponsorProofDigest,
    sponsorRequestTypedData,
    verifySponsorRequest,
    type SponsorRequest,
} from "../src/sponsor/request.js";

const AGENT = privateKeyToAccount(`0x${"11".repeat(32)}`);
const CALLEE = privateKeyToAccount(`0x${"22".repeat(32)}`);
const NODE = privateKeyToAccount(`0x${"33".repeat(32)}`);
const SPONSOR: Address = privateKeyToAccount(`0x${"44".repeat(32)}`).address;
const MULTIVAULT: Address = "0x2Ece8D4dEdcB9918A398528f3fa4688b1d2CAB91";
const TESTNET = 13579;
const TERM: Hex = `0x${"cd".repeat(32)}`;
const PAYMENT: Hex = `0x${"ab".repeat(32)}`;
const MILLI = 10n ** 15n;

describe("approval", () => {
    it("encodes approve(sponsor, DEPOSIT) and never BOTH", () => {
        const decoded = decodeFunctionData({
            abi: multiVaultApproveAbi,
            data: encodeApproveDeposit(SPONSOR),
        });
        expect(decoded.functionName).toBe("approve");
        expect(decoded.args).toEqual([SPONSOR, 1]);
        expect(DEPOSIT_APPROVAL).toBe(1);
    });

    it("plans it as a value-free call to the MultiVault on the named chain", () => {
        const call = planDepositApproval({
            multiVault: MULTIVAULT,
            chainId: TESTNET,
            sponsor: SPONSOR,
        });
        expect(call).toMatchObject({kind: "approve", chainId: TESTNET, to: MULTIVAULT, value: 0n});
        expect(call.data).toBe(encodeApproveDeposit(SPONSOR));
    });
});

describe("sponsor request", () => {
    const request = (over: Partial<SponsorRequest> = {}): SponsorRequest => ({
        version: 1,
        agent: AGENT.address,
        agentRegistry: "eip155:13579:0xC165A2ADc0000000000000000000000000000001",
        agentId: "7",
        termId: TERM,
        proof: sponsorProofDigest({kind: "hire"}),
        nonce: keccak256(stringToBytes("n")),
        expiresAt: 2_000,
        ...over,
    });
    const signer = {
        signTypedData: (data: ReturnType<typeof sponsorRequestTypedData>) =>
            AGENT.signTypedData(data),
    };

    it("verifies a request the agent signed", async () => {
        const signed = await signSponsorRequest(request(), TESTNET, signer);
        expect(await verifySponsorRequest(signed, 1_000)).toEqual({
            status: "valid",
            agent: AGENT.address,
        });
    });

    it("is a mismatch when someone else signed it", async () => {
        const signed = await signSponsorRequest(request({agent: CALLEE.address}), TESTNET, signer);
        expect((await verifySponsorRequest(signed, 1_000)).status).toBe("mismatch");
    });

    it("does not verify on another chain than the one it was signed for", async () => {
        const signed = await signSponsorRequest(request(), TESTNET, signer);
        expect((await verifySponsorRequest({...signed, chainId: 1155}, 1_000)).status).toBe(
            "mismatch",
        );
    });

    it("is expired at its expiry", async () => {
        const signed = await signSponsorRequest(request(), TESTNET, signer);
        expect(await verifySponsorRequest(signed, 2_000)).toEqual({
            status: "expired",
            expiresAt: 2_000,
        });
    });

    it("reports a malformed field instead of throwing", async () => {
        const signed = await signSponsorRequest(request(), TESTNET, signer);
        const bad = {...signed, request: {...signed.request, termId: "0x12" as Hex}};
        expect(await verifySponsorRequest(bad, 1_000)).toEqual({
            status: "malformed",
            reason: "termId is not bytes32",
        });
        expect(
            (
                await verifySponsorRequest(
                    {...signed, request: {...signed.request, agentId: "07"}},
                    1,
                )
            ).status,
        ).toBe("malformed");
    });

    it("binds a proof by its canonical digest, whatever the key order", () => {
        expect(sponsorProofDigest({a: 1, b: 2})).toBe(sponsorProofDigest({b: 2, a: 1}));
        expect(sponsorProofDigest({a: 1})).not.toBe(sponsorProofDigest({a: 2}));
    });
});

describe("checkSponsorProof", () => {
    type Tx = {from: Address; to: Address | null; value: bigint; status?: "success" | "reverted"};
    const payments = (txs: Record<Hex, Tx>): PaymentReads => ({
        getTransaction: async ({hash}) => {
            const tx = txs[hash];
            if (tx === undefined) throw new Error("not found");
            return tx;
        },
        getTransactionReceipt: async ({hash}) => {
            const tx = txs[hash];
            if (tx === undefined) throw new Error("not mined");
            return {status: tx.status ?? "success"};
        },
    });
    const hire = (over: Partial<HireReceipt> = {}): HireReceipt => ({
        version: 1,
        agentRegistry: "eip155:13579:0xC165A2ADc0000000000000000000000000000001",
        agentId: "9",
        requester: AGENT.address,
        payment: PAYMENT,
        paid: (5n * MILLI).toString(),
        requestHash: hireDigest({q: 1}),
        resultHash: hireDigest({a: 1}),
        issuedAt: 1_793_000_000,
        ...over,
    });
    const signHire = (body: HireReceipt, by = CALLEE, chainId = TESTNET) =>
        signHireReceipt(body, chainId, {
            address: by.address,
            signTypedData: (data) => by.signTypedData(data),
        });
    const paid: Record<Hex, Tx> = {
        [PAYMENT]: {from: AGENT.address, to: CALLEE.address, value: 5n * MILLI},
    };
    const REGISTRY_ADDRESS: Address = "0xC165A2ADc0000000000000000000000000000001";
    const REGISTRY = `eip155:13579:${REGISTRY_ADDRESS}`;
    /** Agent 9 is held by `holder` and has `wallet` as its agentWallet, in `REGISTRY` only. */
    const agents = (holder: Address | null = CALLEE.address, wallet: Address | null = null) => ({
        ownerOf: async (registry: Address, id: bigint) =>
            registry.toLowerCase() === REGISTRY_ADDRESS.toLowerCase() && id === 9n ? holder : null,
        agentWalletOf: async (registry: Address, id: bigint) =>
            registry.toLowerCase() === REGISTRY_ADDRESS.toLowerCase() && id === 9n ? wallet : null,
    });
    const context = (txs = paid, keys: AgentKeyReads = agents(), requesterId = "1") => ({
        receiver: AGENT.address,
        requester: {agentRegistry: REGISTRY, agentId: requesterId},
        chainId: TESTNET,
        payments: payments(txs),
        acceptedContentSigners: [NODE.address],
        acceptedRegistries: [REGISTRY],
        agents: keys,
    });

    it("proves a hire whose payment is on chain, priced at what was paid", async () => {
        const verdict = await checkSponsorProof(
            {kind: "hire", receipt: await signHire(hire())},
            context(),
        );
        expect(verdict).toEqual({
            status: "proven",
            kind: "hire",
            strength: "strong",
            cost: 5n * MILLI,
            id: `hire:${TESTNET}:${PAYMENT}`,
            object: {kind: "agent", agentRegistry: REGISTRY, agentId: "9"},
        });
    });

    it("proves a hire signed by the agent's agentWallet rather than its holder", async () => {
        const verdict = await checkSponsorProof(
            {kind: "hire", receipt: await signHire(hire())},
            context(paid, agents(NODE.address, CALLEE.address)),
        );
        expect(verdict.status).toBe("proven");
    });

    it.each([
        [
            "a signer that is neither the holder nor the agentWallet",
            agents(NODE.address, null),
            /neither the holder nor the agentWallet/,
        ],
        ["an agent that is not registered", agents(null), /not registered/],
        [
            "a registry whose read fails",
            {
                ownerOf: async () => {
                    throw new Error("rpc down");
                },
                agentWalletOf: async () => null,
            },
            /not registered/,
        ],
    ])("refuses a hire receipt from %s", async (_label, keys, reason) => {
        const verdict = await checkSponsorProof(
            {kind: "hire", receipt: await signHire(hire())},
            context(paid, keys),
        );
        expect(verdict.status === "refused" && verdict.reason).toMatch(reason);
    });

    it("refuses a hire receipt naming a registry that is not accepted", async () => {
        const other = "eip155:13579:0x0000000000000000000000000000000000000bad";
        const verdict = await checkSponsorProof(
            {kind: "hire", receipt: await signHire(hire({agentRegistry: other}))},
            context(),
        );
        expect(verdict.status === "refused" && verdict.reason).toMatch(/not accepted/);
    });

    it.each([
        [
            "a receipt naming another requester",
            () => hire({requester: CALLEE.address}),
            paid,
            /requester/,
        ],
        [
            "a payment from someone else",
            () => hire(),
            {[PAYMENT]: {...paid[PAYMENT]!, from: NODE.address}},
            /came from/,
        ],
        [
            "a payment to someone other than the signer",
            () => hire(),
            {[PAYMENT]: {...paid[PAYMENT]!, to: NODE.address}},
            /went to/,
        ],
        [
            "a payment that moved another amount",
            () => hire(),
            {[PAYMENT]: {...paid[PAYMENT]!, value: MILLI}},
            /moved/,
        ],
        [
            "a reverted payment",
            () => hire(),
            {[PAYMENT]: {...paid[PAYMENT]!, status: "reverted" as const}},
            /reverted/,
        ],
        ["a payment that does not exist", () => hire(), {}, /not found/],
        [
            "a payment of nothing",
            () => hire({paid: "0"}),
            {[PAYMENT]: {...paid[PAYMENT]!, value: 0n}},
            /nothing/,
        ],
    ])("refuses %s", async (_label, body, txs, reason) => {
        const verdict = await checkSponsorProof(
            {kind: "hire", receipt: await signHire(body())},
            context(txs as Record<Hex, Tx>),
        );
        expect(verdict.status).toBe("refused");
        expect(verdict.status === "refused" && verdict.reason).toMatch(reason);
    });

    it("refuses a hire receipt the requester signed for itself", async () => {
        const self = {[PAYMENT]: {from: AGENT.address, to: AGENT.address, value: 5n * MILLI}};
        const verdict = await checkSponsorProof(
            {kind: "hire", receipt: await signHire(hire(), AGENT)},
            context(self),
        );
        expect(verdict).toEqual({
            status: "refused",
            reason: "hire receipt is signed by the requester itself",
        });
    });

    it("refuses a hire of the requester's own agent, paid to its agentWallet", async () => {
        // Agent 9 is the requester: held by AGENT, with CALLEE as its agentWallet. The payment goes
        // from the holder to the wallet and the wallet signs, so `callee === receiver` does not fire.
        const verdict = await checkSponsorProof(
            {kind: "hire", receipt: await signHire(hire())},
            context(paid, agents(AGENT.address, CALLEE.address), "9"),
        );
        expect(verdict).toEqual({
            status: "refused",
            reason: "hire receipt names agent 9, the requester itself",
        });
    });

    it("compares the requester's registry without regard to case", async () => {
        const verdict = await checkSponsorProof(
            {
                kind: "hire",
                receipt: await signHire(hire({agentRegistry: REGISTRY.toLowerCase()})),
            },
            context(paid, agents(AGENT.address, CALLEE.address), "9"),
        );
        expect(verdict.status === "refused" && verdict.reason).toMatch(/requester itself/);
    });

    it("refuses a hire receipt from another chain, which cannot be priced against this one", async () => {
        const verdict = await checkSponsorProof(
            {kind: "hire", receipt: await signHire(hire(), CALLEE, 1155)},
            context(),
        );
        expect(verdict.status === "refused" && verdict.reason).toMatch(/chain 1155/);
    });

    it("refuses a tampered hire receipt", async () => {
        const signed = await signHire(hire());
        const tampered = {...signed, receipt: {...signed.receipt, paid: "1"}};
        const verdict = await checkSponsorProof({kind: "hire", receipt: tampered}, context());
        expect(verdict.status).toBe("refused");
    });

    const content = (over: Partial<ContentReceipt> = {}): ContentReceipt => ({
        atom: TERM,
        url: "https://github.com/a/b?skill=c",
        path: "skills/c/SKILL.md",
        digest: contentDigest(stringToBytes("x")),
        to: AGENT.address,
        servedAt: 1_793_000_000,
        nonce: keccak256(stringToBytes("one")),
        ...over,
    });
    const signContent = (body: ContentReceipt, by = NODE) =>
        signContentReceipt(body, TESTNET, {
            address: by.address,
            signTypedData: (data) => by.signTypedData(data),
        });

    it("proves a content receipt from an accepted node, unpriced and naming its atom", async () => {
        const verdict = await checkSponsorProof(
            {kind: "content", receipt: await signContent(content())},
            context(),
        );
        expect(verdict).toMatchObject({
            status: "proven",
            kind: "content",
            strength: "access",
            cost: null,
            object: {kind: "atom", atom: TERM},
        });
    });

    it("refuses a content receipt from a node the service does not accept", async () => {
        const verdict = await checkSponsorProof(
            {kind: "content", receipt: await signContent(content(), CALLEE)},
            context(),
        );
        expect(verdict).toEqual({status: "refused", reason: "content receipt is unknown-signer"});
    });

    it("refuses a content receipt served to someone else", async () => {
        const verdict = await checkSponsorProof(
            {kind: "content", receipt: await signContent(content({to: CALLEE.address}))},
            context(),
        );
        expect(verdict).toEqual({status: "refused", reason: "content receipt is other-caller"});
    });

    it("refuses malformed input with a reason instead of throwing", async () => {
        const verdict = await checkSponsorProof(
            // A stranger's JSON, typed as the proof it claims to be: that is what the service receives.
            {kind: "hire", receipt: {} as never},
            context(),
        );
        expect(verdict.status).toBe("refused");
        // Same: an unknown kind arrives as JSON, so the type has to be told it can.
        expect(await checkSponsorProof({kind: "other"} as never, context())).toEqual({
            status: "refused",
            reason: "unknown proof kind",
        });
    });
});

describe("limits", () => {
    const limits: SponsorLimits = {
        ...ADR_0092_LIMITS,
        depositAmount: MILLI,
        approvalGas: MILLI / 10n,
        withdrawalThresholdBps: null,
    };
    const DAY = 86_400_000;
    const at = 20_000 * DAY + 3_600_000;
    const deposit = (over: Partial<SponsorRecord> = {}): SponsorRecord => ({
        kind: "deposit",
        subject: AGENT.address,
        value: MILLI,
        at,
        termId: TERM,
        curveId: 1n,
        shares: 100n,
        ...over,
    });

    it("keeps ADR 0092's values", () => {
        expect(ADR_0092_LIMITS).toEqual({
            depositsPerAgentPerDay: 2,
            publicationsPerDelegatorPerDay: 2,
            dailyBudget: 10n ** 18n,
        });
    });

    it("counts a UTC day", () => {
        expect(utcDay(at)).toBe(20_000);
        expect(spentOnDay([deposit(), deposit({at: at - DAY})], at)).toBe(MILLI);
    });

    it("allows two deposits a day per agent and refuses the third", () => {
        const now = at + 1;
        expect(
            checkDepositLimits([deposit()], {agent: AGENT.address, now, limits, withdrawn: 0}).ok,
        ).toBe(true);
        const two = [deposit(), deposit()];
        expect(checkDepositLimits(two, {agent: AGENT.address, now, limits, withdrawn: 0})).toEqual({
            ok: false,
            reason: "2 sponsored deposits a day per agent, reached",
        });
        expect(checkDepositLimits(two, {agent: CALLEE.address, now, limits, withdrawn: 0}).ok).toBe(
            true,
        );
        expect(
            checkDepositLimits(two, {agent: AGENT.address, now: now + DAY, limits, withdrawn: 0})
                .ok,
        ).toBe(true);
    });

    it("refuses once the daily budget would be passed", () => {
        const full = [deposit({subject: CALLEE.address, value: 10n ** 18n - MILLI + 1n})];
        const decision = checkDepositLimits(full, {
            agent: AGENT.address,
            now: at,
            limits,
            withdrawn: 0,
        });
        expect(decision.ok).toBe(false);
        expect(!decision.ok && decision.reason).toMatch(/daily budget/);
    });

    it("does not enforce an unset withdrawal threshold, and enforces a set one", () => {
        const params = {agent: AGENT.address, now: at, limits, withdrawn: 10_000};
        expect(checkDepositLimits([], params).ok).toBe(true);
        const set = {...limits, withdrawalThresholdBps: 5_000};
        expect(checkDepositLimits([], {...params, limits: set, withdrawn: 5_000}).ok).toBe(true);
        expect(checkDepositLimits([], {...params, limits: set, withdrawn: 5_001}).ok).toBe(false);
    });

    it("measures withdrawals per position, and an agent's own shares never count as withdrawn", () => {
        expect(withdrawnBps([])).toBe(0);
        expect(withdrawnBps([{sponsoredShares: 100n, heldShares: 100n}])).toBe(0);
        expect(withdrawnBps([{sponsoredShares: 100n, heldShares: 25n}])).toBe(7_500);
        expect(
            withdrawnBps([
                {sponsoredShares: 100n, heldShares: 300n},
                {sponsoredShares: 100n, heldShares: 0n},
            ]),
        ).toBe(5_000);
    });

    it("sums an agent's sponsored shares per vault", () => {
        const other: Hex = `0x${"ef".repeat(32)}`;
        expect(
            sponsoredPositions(
                [
                    deposit(),
                    deposit({shares: 50n}),
                    deposit({termId: other}),
                    deposit({subject: CALLEE.address}),
                    deposit({kind: "gas"}),
                ],
                AGENT.address,
            ),
        ).toEqual([
            {termId: TERM, curveId: 1n, shares: 150n},
            {termId: other, curveId: 1n, shares: 100n},
        ]);
    });

    it("sends approval gas once per agent, ever", () => {
        const gas: SponsorRecord = {
            kind: "gas",
            subject: AGENT.address,
            value: MILLI / 10n,
            at: at - 30 * DAY,
        };
        expect(checkGasLimits([], {agent: AGENT.address, now: at, limits}).ok).toBe(true);
        expect(checkGasLimits([gas], {agent: AGENT.address, now: at, limits})).toEqual({
            ok: false,
            reason: "this agent already received its approval gas",
        });
    });

    it("allows two publications a day per delegator", () => {
        const pub: SponsorRecord = {kind: "publish", subject: AGENT.address, value: MILLI, at};
        const params = {delegator: AGENT.address, value: MILLI, now: at, limits};
        expect(checkPublishLimits([pub], params).ok).toBe(true);
        expect(checkPublishLimits([pub, pub], params).ok).toBe(false);
        expect(checkPublishLimits([], {...params, value: 2n * 10n ** 18n}).ok).toBe(false);
    });
});

describe("planSponsoredDeposit", () => {
    const reads = (over: Partial<MultiVaultReads> = {}): MultiVaultReads =>
        ({
            address: MULTIVAULT,
            chainId: TESTNET,
            termExists: async () => true,
            defaultCurveId: async () => 1n,
            minDeposit: async () => MILLI,
            previewDeposit: async () => ({shares: 1_000n, assetsAfterFees: MILLI}),
            ...over,
        }) as MultiVaultReads; // A plan reads four of the reader's methods; the rest are never called.

    it("deposits with the agent as receiver, paid by the call's value", async () => {
        const plan = await planSponsoredDeposit({
            receiver: AGENT.address,
            termId: TERM,
            amount: MILLI,
            reads: reads(),
        });
        expect(plan.call).toMatchObject({
            kind: "deposit",
            chainId: TESTNET,
            to: MULTIVAULT,
            value: MILLI,
        });
        const decoded = decodeFunctionData({abi: multiVaultDeclareAbi, data: plan.call.data});
        expect(decoded.functionName).toBe("deposit");
        expect(decoded.args).toEqual([AGENT.address, TERM, 1n, 990n]);
        expect(plan.expectedShares).toBe(1_000n);
        expect(plan.curveId).toBe(1n);
    });

    it("uses a curve the caller names instead of reading the default", async () => {
        const plan = await planSponsoredDeposit({
            receiver: AGENT.address,
            termId: TERM,
            amount: MILLI,
            curveId: 2n,
            reads: reads({
                defaultCurveId: async () => {
                    throw new Error("not read");
                },
            }),
        });
        expect(plan.curveId).toBe(2n);
    });

    it("refuses a term that does not exist, an amount under minDeposit, and a deposit that mints nothing", async () => {
        const base = {receiver: AGENT.address, termId: TERM, amount: MILLI};
        await expect(
            planSponsoredDeposit({...base, reads: reads({termExists: async () => false})}),
        ).rejects.toBeInstanceOf(SponsoredTermMissingError);
        await expect(
            planSponsoredDeposit({...base, amount: MILLI - 1n, reads: reads()}),
        ).rejects.toBeInstanceOf(SponsoredBelowMinDepositError);
        await expect(
            planSponsoredDeposit({
                ...base,
                reads: reads({previewDeposit: async () => ({shares: 0n, assetsAfterFees: 0n})}),
            }),
        ).rejects.toBeInstanceOf(SponsoredZeroSharesError);
    });
});
