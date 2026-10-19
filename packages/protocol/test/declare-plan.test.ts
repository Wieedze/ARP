import {decodeFunctionData, parseEther} from "viem";
import type {Address, Hex} from "viem";
import {describe, expect, it} from "vitest";

import {
    AmbiguousToolAtomError,
    BelowMinDepositError,
    EmptyPlanError,
    NonPositiveAmountError,
    atomDataForUri,
    prepareDeclareUsed,
    prepareStakeOnUsed,
    type MultiVaultReads,
    type ToolAtomCandidate,
    type ToolAtomLookup,
} from "../src/declare/index.js";
import {USE, USES} from "../src/sources/intuition/terms.js";
import {asAgentIdentityAtom} from "../src/verify/subject.js";

const MULTI_VAULT = "0x6E35cF57A41fA15eA0EaE9C33e751b01A784Fe7e" as Address;
const RECEIVER = "0x1111111111111111111111111111111111111111" as Address;

/** The agent's ERC-8004 identity atom, branded the way a real caller must (ADR 0032). */
const SUBJECT = asAgentIdentityAtom(
    "0xaaa0000000000000000000000000000000000000000000000000000000000001" as Hex,
    "eip155:8453/erc721:0x8004A169FB4a3325136EB29fA0ceB6D2e539a432/1380",
);

const TOOL_URI = "ipfs://bafkreiarpslitherschema";
const OTHER_URI = "https://tools.example.org/semgrep.json";

/**
 * Deterministic stand-ins for the two `calculate*` views.
 *
 * Every nibble is valid hex. The first draft used `a70m` as a mnemonic prefix, which is not hex and
 * only one test noticed — the one that decodes the calldata. The other eighteen passed on an id
 * viem cannot parse, which is the vacuity shape: a fixture no assertion looks inside.
 */
const idFor = (prefix: string, uri: string): Hex => {
    const body = (prefix + Buffer.from(uri).toString("hex")).slice(0, 64).padEnd(64, "0");
    return `0x${body}` as Hex;
};
const atomIdFor = (uri: string): Hex => idFor("a70a", uri);
const tripleIdFor = (uri: string): Hex => idFor("7319", uri);

/**
 * A reader over stated chain state.
 *
 * A mocked viem client would prove a call was shaped; this proves the plan was right given what the
 * chain says, which is the only thing the planner is responsible for. `calls` records every read so
 * a test can assert a cost was read **per plan** rather than carried as a constant.
 */
function fakeReads(
    state: {
        existing?: ReadonlySet<string>;
        atomCost?: bigint;
        tripleCost?: bigint;
        curveId?: bigint;
        chainId?: number;
        minDeposit?: bigint;
    } = {},
): MultiVaultReads & {reads: string[]} {
    const existing = state.existing ?? new Set<string>();
    const reads: string[] = [];
    /**
     * Which URI produced which atom id, recorded as the reads happen.
     *
     * The alternative — reverse-parsing the URI back out of the atom id — needs trailing zeros
     * stripped, and the hex of an ASCII URI can legitimately end in a zero nibble (`p` is `0x70`).
     * A lookup cannot be wrong that way.
     */
    const uriByAtomId = new Map<string, string>();
    return {
        reads,
        address: MULTI_VAULT,
        chainId: state.chainId ?? 1155,
        async atomId(atomData: Hex) {
            reads.push("calculateAtomId");
            const uri = Buffer.from(atomData.slice(2), "hex").toString("utf8");
            const id = atomIdFor(uri);
            uriByAtomId.set(id, uri);
            return id;
        },
        async tripleId(subject: Hex, predicate: Hex, objectId: Hex) {
            reads.push(`calculateTripleId:${subject}:${predicate}`);
            // Keyed off the URI when this reader computed the atom id, and off the object id
            // otherwise — which is the case when the planner reuses an atom the lookup found and
            // never calls `atomId` at all. An earlier version threw there, and the throw was a
            // bug in the fake rather than in the planner.
            const uri = uriByAtomId.get(objectId);
            return uri === undefined ? idFor("7319", objectId) : tripleIdFor(uri);
        },
        async termExists(termId: Hex) {
            reads.push("isTermCreated");
            return existing.has(termId.toLowerCase());
        },
        async atomCost() {
            reads.push("getAtomCost");
            return state.atomCost ?? parseEther("0.01");
        },
        async tripleCost() {
            reads.push("getTripleCost");
            return state.tripleCost ?? parseEther("0.1");
        },
        async defaultCurveId() {
            reads.push("getBondingCurveConfig");
            return state.curveId ?? 1n;
        },
        async minDeposit() {
            reads.push("getGeneralConfig");
            // 1n unless a test says otherwise, so the existing amount assertions stay about the
            // amount and not about the floor.
            return state.minDeposit ?? 1n;
        },
    };
}

/**
 * The three MultiVault functions a plan can encode, declared here rather than imported.
 *
 * The test decodes with its own copy so it checks what the module produced against the contract's
 * real signature, not against the module's own idea of it. Decoding with the module's ABI would
 * agree with the module even if both were wrong.
 *
 * One fragment per helper also keeps the decoded `args` exactly typed: `decodeFunctionData` over a
 * multi-function ABI returns a union, and narrowing it with a cast is how a wrong tuple shape gets
 * through a test that looks strict.
 */
const createAtomsAbi = [
    {
        type: "function",
        stateMutability: "payable",
        name: "createAtoms",
        inputs: [
            {name: "atomDatas", type: "bytes[]"},
            {name: "assets", type: "uint256[]"},
        ],
        outputs: [{name: "", type: "bytes32[]"}],
    },
] as const;

const createTriplesAbi = [
    {
        type: "function",
        stateMutability: "payable",
        name: "createTriples",
        inputs: [
            {name: "subjectIds", type: "bytes32[]"},
            {name: "predicateIds", type: "bytes32[]"},
            {name: "objectIds", type: "bytes32[]"},
            {name: "assets", type: "uint256[]"},
        ],
        outputs: [{name: "", type: "bytes32[]"}],
    },
] as const;

const depositAbi = [
    {
        type: "function",
        stateMutability: "payable",
        name: "deposit",
        inputs: [
            {name: "receiver", type: "address"},
            {name: "termId", type: "bytes32"},
            {name: "curveId", type: "uint256"},
            {name: "minShares", type: "uint256"},
        ],
        outputs: [{name: "shares", type: "uint256"}],
    },
] as const;

const decodeCreateAtoms = (data: Hex) => decodeFunctionData({abi: createAtomsAbi, data});
const decodeCreateTriples = (data: Hex) => decodeFunctionData({abi: createTriplesAbi, data});
const decodeDeposit = (data: Hex) => decodeFunctionData({abi: depositAbi, data});

describe("prepareDeclareUsed", () => {
    it("plans the atom before the triple that references it", async () => {
        const plan = await prepareDeclareUsed({
            subject: SUBJECT,
            tools: [TOOL_URI],
            reads: fakeReads(),
        });

        expect(plan.calls.map((c) => c.kind)).toEqual(["create-atom", "create-triple"]);
        // Not cosmetic: createTriples reverts with MultiVault_TermDoesNotExist in the other order.
        expect(plan.calls.findIndex((c) => c.kind === "create-atom")).toBeLessThan(
            plan.calls.findIndex((c) => c.kind === "create-triple"),
        );
    });

    it("carries the branded identity atom as the triple's subject, decoded from the calldata", async () => {
        const plan = await prepareDeclareUsed({
            subject: SUBJECT,
            tools: [TOOL_URI],
            reads: fakeReads(),
        });
        const triple = plan.calls.find((c) => c.kind === "create-triple");
        expect(triple).toBeDefined();

        const {functionName, args} = decodeCreateTriples(triple!.data);
        expect(functionName).toBe("createTriples");
        const [subjects, predicates, objects] = args;
        // ADR 0032. An edge on the operating account's caip10 atom is permanent and unreadable.
        expect(subjects).toEqual([SUBJECT]);
        expect(objects).toEqual([atomIdFor(TOOL_URI)]);
        expect(predicates).toEqual([USES]);
    });

    it("uses the frozen canonical `uses`, not a predicate ARP minted", async () => {
        const plan = await prepareDeclareUsed({
            subject: SUBJECT,
            tools: [TOOL_URI],
            reads: fakeReads(),
        });
        expect(plan.predicate).toBe(USES);
        // And not `USE`, which is the pair ADR 0030 had to disentangle: `use` means "supports this
        // protocol", `uses` means "uses this tool". IMPORTED, not copied — `terms.ts` is the only
        // place a term id may appear, and a test guarding against confusing these two is the worst
        // place in the repo to keep a hand-typed copy of one of them.
        expect(plan.predicate).not.toBe(USE);
    });

    it("skips the atom when it already exists and still declares the edge", async () => {
        const plan = await prepareDeclareUsed({
            subject: SUBJECT,
            tools: [TOOL_URI],
            reads: fakeReads({existing: new Set([atomIdFor(TOOL_URI).toLowerCase()])}),
        });

        expect(plan.calls.map((c) => c.kind)).toEqual(["create-triple"]);
        expect(plan.existingTerms).toEqual([atomIdFor(TOOL_URI)]);
        expect(plan.tools[0]?.atomExists).toBe(true);
        expect(plan.tools[0]?.tripleExists).toBe(false);
    });

    it("plans nothing when both terms exist, and says so rather than failing", async () => {
        const plan = await prepareDeclareUsed({
            subject: SUBJECT,
            tools: [TOOL_URI],
            reads: fakeReads({
                existing: new Set([
                    atomIdFor(TOOL_URI).toLowerCase(),
                    tripleIdFor(TOOL_URI).toLowerCase(),
                ]),
            }),
        });

        expect(plan.calls).toEqual([]);
        expect(plan.totalValue).toBe(0n);
        expect(plan.existingTerms).toHaveLength(2);
    });

    it("totals the native value a caller is about to spend", async () => {
        const plan = await prepareDeclareUsed({
            subject: SUBJECT,
            tools: [TOOL_URI, OTHER_URI],
            reads: fakeReads(),
        });
        // The fake reader's costs, not mainnet's: 0.01 per atom and 0.1 per triple. Mainnet
        // charges ~0.1 for both (measured 2026-10-19), and an earlier version of this comment
        // claimed these WERE the mainnet figures. The planner only sums what it reads, which is
        // the property under test; a fixture is free to pick two distinguishable numbers.
        expect(plan.totalValue).toBe(parseEther("0.22"));
    });

    it("reads the costs from the chain, so testnet's 100× cheaper fees carry through", async () => {
        // rules/portability.md rule 3. Measured 2026-10-19: getTripleCost() is 0.001000000002 on
        // 13579 against 0.100000000002 on 1155, and getAtomCost() 0.001000000001 against
        // 0.100000000001. A constant would make a budget tuned on testnet wrong by 100× on
        // mainnet.
        const plan = await prepareDeclareUsed({
            subject: SUBJECT,
            tools: [TOOL_URI],
            reads: fakeReads({
                atomCost: parseEther("0.001"),
                tripleCost: parseEther("0.001"),
                chainId: 13579,
            }),
        });
        expect(plan.totalValue).toBe(parseEther("0.002"));
        expect(plan.chainId).toBe(13579);
    });

    it("reads each cost once however many tools need it", async () => {
        const reads = fakeReads();
        await prepareDeclareUsed({subject: SUBJECT, tools: [TOOL_URI, OTHER_URI], reads});
        expect(reads.reads.filter((r) => r === "getAtomCost")).toHaveLength(1);
        expect(reads.reads.filter((r) => r === "getTripleCost")).toHaveLength(1);
    });

    it("dedupes repeated URIs instead of paying the fee twice", async () => {
        const plan = await prepareDeclareUsed({
            subject: SUBJECT,
            tools: [TOOL_URI, ` ${TOOL_URI} `, TOOL_URI],
            reads: fakeReads(),
        });
        expect(plan.tools).toHaveLength(1);
        expect(plan.calls).toHaveLength(2);
    });

    it("refuses a plan with nothing in it", async () => {
        const reads = fakeReads();
        await expect(prepareDeclareUsed({subject: SUBJECT, tools: [], reads})).rejects.toThrow(
            EmptyPlanError,
        );
        await expect(
            prepareDeclareUsed({subject: SUBJECT, tools: ["   ", ""], reads}),
        ).rejects.toThrow(EmptyPlanError);
    });

    it("derives the atom data from the URI, with nothing pinned", async () => {
        const plan = await prepareDeclareUsed({
            subject: SUBJECT,
            tools: [TOOL_URI],
            reads: fakeReads(),
        });
        const atom = plan.calls.find((c) => c.kind === "create-atom");
        const {functionName, args} = decodeCreateAtoms(atom!.data);
        expect(functionName).toBe("createAtoms");
        // ADR 0008: the id derives from the URI, which is why a third party needs no partner key.
        expect(args[0]).toEqual([atomDataForUri(TOOL_URI)]);
    });

    it("gives every call a reason a caller could show its operator", async () => {
        const plan = await prepareDeclareUsed({
            subject: SUBJECT,
            tools: [TOOL_URI],
            reads: fakeReads(),
        });
        for (const call of plan.calls) {
            expect(call.why.length).toBeGreaterThan(10);
            expect(call.why).toContain(TOOL_URI);
            expect(call.to).toBe(MULTI_VAULT);
        }
    });
});

describe("the chain is on every call, not only on the plan", () => {
    it("stamps each call with the chain the reads came from", async () => {
        const plan = await prepareDeclareUsed({
            subject: SUBJECT,
            tools: [TOOL_URI],
            reads: fakeReads({chainId: 13579}),
        });
        // Measured 2026-10-19: each MultiVault is codeless on the other chain (`eth_getCode` →
        // `0x`), and a value-bearing call to a codeless address does NOT revert — it is a plain
        // transfer that succeeds. A wallet is handed one call at a time, so the chain has to
        // travel with the call or a cross-chain send loses the fee silently.
        expect(plan.calls.length).toBeGreaterThan(0);
        for (const call of plan.calls) expect(call.chainId).toBe(13579);
        expect(plan.chainId).toBe(13579);
    });

    it("stamps deposits too", async () => {
        const tripleId = tripleIdFor(TOOL_URI);
        const plan = await prepareStakeOnUsed({
            targets: [{tripleId, amount: 1n}],
            receiver: RECEIVER,
            reads: fakeReads({existing: new Set([tripleId.toLowerCase()]), chainId: 13579}),
        });
        expect(plan.calls[0]?.chainId).toBe(13579);
    });
});

describe("the value sent equals the assets the call declares", () => {
    it("matches on create-atom", async () => {
        const plan = await prepareDeclareUsed({
            subject: SUBJECT,
            tools: [TOOL_URI],
            reads: fakeReads(),
        });
        const atom = plan.calls.find((c) => c.kind === "create-atom");
        // `MultiVault` requires msg.value to cover sum(assets[]); a mismatch is
        // MultiVault_InsufficientBalance at send time, after gas. Nothing asserted this before.
        expect(decodeCreateAtoms(atom!.data).args[1]).toEqual([atom!.value]);
    });

    it("matches on create-triple", async () => {
        const plan = await prepareDeclareUsed({
            subject: SUBJECT,
            tools: [TOOL_URI],
            reads: fakeReads(),
        });
        const triple = plan.calls.find((c) => c.kind === "create-triple");
        expect(decodeCreateTriples(triple!.data).args[3]).toEqual([triple!.value]);
    });
});

describe("which atom a tool resolves to", () => {
    const HTTPS_URI = "https://mcp.example.org/mcp";
    const fakeLookup = (candidates: ToolAtomCandidate[]): ToolAtomLookup => ({
        async findByUrl() {
            return candidates;
        },
    });

    it("derives its own atom for a content address, with no lookup and no warning", async () => {
        const plan = await prepareDeclareUsed({
            subject: SUBJECT,
            tools: [TOOL_URI], // ipfs://
            reads: fakeReads(),
        });
        expect(plan.tools[0]?.atomSource).toBe("derived-from-uri");
        expect(plan.tools[0]?.bareUrlWarning).toBeUndefined();
    });

    it("warns when it would mint a bare URL atom with no lookup to consult", async () => {
        const plan = await prepareDeclareUsed({
            subject: SUBJECT,
            tools: [HTTPS_URI],
            reads: fakeReads(),
        });
        // Measured on mainnet: 78 of the 84 tool atoms on `uses` edges are `ipfs://` and 77
        // resolve a pinned Thing; the only two raw-URL atoms are schema.org vocabulary, not tools.
        expect(plan.tools[0]?.bareUrlWarning).toContain("no pinned metadata");
        expect(plan.calls.find((c) => c.kind === "create-atom")?.why).toContain("BARE URL");
    });

    it("reuses the tool's existing atom when the lookup finds exactly one", async () => {
        const existingId = `0x${"ee".repeat(32)}` as Hex;
        const plan = await prepareDeclareUsed({
            subject: SUBJECT,
            tools: [HTTPS_URI],
            reads: fakeReads({existing: new Set([existingId.toLowerCase()])}),
            lookup: fakeLookup([{termId: existingId, label: "A Tool", uri: "ipfs://real"}]),
        });
        expect(plan.tools[0]?.atomId).toBe(existingId);
        expect(plan.tools[0]?.atomSource).toBe("existing-thing");
        expect(plan.tools[0]?.bareUrlWarning).toBeUndefined();
        // No second atom beside the tool's real one.
        expect(plan.calls.map((c) => c.kind)).toEqual(["create-triple"]);
        expect(decodeCreateTriples(plan.calls[0]!.data).args[2]).toEqual([existingId]);
    });

    it("refuses to choose when several atoms claim the same URL", async () => {
        // Measured: `https://github.com` resolves to five `Thing` atoms on mainnet (2026-10-19,
        // at `limit: 10`). Picking the first is the failure `terms.ts` was written to prevent, and
        // the write is permanent.
        await expect(
            prepareDeclareUsed({
                subject: SUBJECT,
                tools: [HTTPS_URI],
                reads: fakeReads(),
                lookup: fakeLookup([
                    {termId: `0x${"11".repeat(32)}`, label: "one", uri: null},
                    {termId: `0x${"22".repeat(32)}`, label: "two", uri: null},
                    {termId: `0x${"33".repeat(32)}`, label: "three", uri: null},
                ]),
            }),
        ).rejects.toThrow(AmbiguousToolAtomError);
    });

    it("still creates a bare URL atom when the lookup finds nothing, and says so", async () => {
        const plan = await prepareDeclareUsed({
            subject: SUBJECT,
            tools: [HTTPS_URI],
            reads: fakeReads(),
            lookup: fakeLookup([]),
        });
        expect(plan.tools[0]?.atomSource).toBe("derived-from-uri");
        expect(plan.tools[0]?.bareUrlWarning).toContain("no atom on the graph");
    });
});

describe("prepareStakeOnUsed", () => {
    const tripleId = tripleIdFor(TOOL_URI);
    const existing = new Set([tripleId.toLowerCase()]);

    it("deposits on the EDGE, not on the tool's atom", async () => {
        const plan = await prepareStakeOnUsed({
            targets: [{tripleId, amount: parseEther("0.5")}],
            receiver: RECEIVER,
            reads: fakeReads({existing}),
        });

        const {functionName, args} = decodeDeposit(plan.calls[0]!.data);
        expect(functionName).toBe("deposit");
        const [receiver, termId, curveId, minShares] = args;
        // The load-bearing assertion of this module. Measured on mainnet 1155 on 2026-10-19
        // (scripts/measure-stake-vault-placement.ts): 74 of 185 `uses` edges carry stake only on
        // the object atom, which getToolUsage cannot see. A regression to the atom id fails here.
        expect(termId).toBe(tripleId);
        expect(termId).not.toBe(atomIdFor(TOOL_URI));
        expect(receiver).toBe(RECEIVER);
        expect(curveId).toBe(1n);
        expect(minShares).toBe(0n);
        expect(plan.calls[0]!.value).toBe(parseEther("0.5"));
    });

    it("prices on the curve the chain reports, not on a copied default", async () => {
        const plan = await prepareStakeOnUsed({
            targets: [{tripleId, amount: 1n}],
            receiver: RECEIVER,
            reads: fakeReads({existing, curveId: 4n}),
        });
        expect(plan.curveId).toBe(4n);
        expect(decodeDeposit(plan.calls[0]!.data).args[2]).toBe(4n);
    });

    it("plans no deposit on a triple that is not on chain yet, and reports why", async () => {
        const plan = await prepareStakeOnUsed({
            targets: [{tripleId, amount: 1n}],
            receiver: RECEIVER,
            reads: fakeReads(),
        });
        expect(plan.calls).toEqual([]);
        expect(plan.targets[0]?.exists).toBe(false);
        expect(plan.totalValue).toBe(0n);
    });

    it("honours an explicit slippage floor", async () => {
        const plan = await prepareStakeOnUsed({
            targets: [{tripleId, amount: 10n}],
            receiver: RECEIVER,
            reads: fakeReads({existing}),
            minShares: 7n,
        });
        expect(decodeDeposit(plan.calls[0]!.data).args[3]).toBe(7n);
    });

    it("refuses a zero or negative stake", async () => {
        const reads = fakeReads({existing});
        await expect(
            prepareStakeOnUsed({targets: [{tripleId, amount: 0n}], receiver: RECEIVER, reads}),
        ).rejects.toThrow(NonPositiveAmountError);
        await expect(
            prepareStakeOnUsed({targets: [{tripleId, amount: -1n}], receiver: RECEIVER, reads}),
        ).rejects.toThrow(NonPositiveAmountError);
    });

    it("refuses an amount below the protocol's floor, which is chain state", async () => {
        // Measured 2026-10-19: getGeneralConfig().minDeposit is 1e16 on mainnet 1155 and 1e15 on
        // testnet 13579 — 10× apart, so an amount tuned on testnet is a tenth of the mainnet
        // floor. previewDeposit does not catch it; reading the floor does.
        const reads = fakeReads({existing, minDeposit: parseEther("0.01")});
        await expect(
            prepareStakeOnUsed({
                targets: [{tripleId, amount: parseEther("0.001")}],
                receiver: RECEIVER,
                reads,
            }),
        ).rejects.toThrow(BelowMinDepositError);

        const ok = await prepareStakeOnUsed({
            targets: [{tripleId, amount: parseEther("0.01")}],
            receiver: RECEIVER,
            reads: fakeReads({existing, minDeposit: parseEther("0.01")}),
        });
        expect(ok.calls).toHaveLength(1);
        expect(ok.minDeposit).toBe(parseEther("0.01"));
    });

    it("refuses a plan with no targets", async () => {
        await expect(
            prepareStakeOnUsed({targets: [], receiver: RECEIVER, reads: fakeReads()}),
        ).rejects.toThrow(EmptyPlanError);
    });

    it("totals only what it actually planned", async () => {
        const second = tripleIdFor(OTHER_URI);
        const plan = await prepareStakeOnUsed({
            targets: [
                {tripleId, amount: parseEther("0.3")},
                {tripleId: second, amount: parseEther("0.4")},
            ],
            receiver: RECEIVER,
            reads: fakeReads({existing}),
        });
        // The second triple does not exist, so its amount is not in the total.
        expect(plan.calls).toHaveLength(1);
        expect(plan.totalValue).toBe(parseEther("0.3"));
        expect(plan.targets).toHaveLength(2);
    });
});
