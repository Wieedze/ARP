import {beforeEach, describe, expect, it, vi, type Mock} from "vitest";
import {
    decodeFunctionData,
    parseEther,
    stringToHex,
    type Address,
    type Hex,
} from "viem";

import {deployments} from "../../lib/deployments";
import {multiVaultAbi} from "../../lib/abi/multi-vault";

import {
    DEFAULT_TEST_ADDRESS,
    makeMockPublicClient,
    makeMockWalletClient,
    readContractDispatcher,
    type MockPublicClient,
    type MockWalletClient,
} from "./fixtures";

/**
 * `redeemArpDelegation` wraps the MetaMask DelegationManager SDK call.
 * For these unit tests we mock the wrapper directly and assert the
 * `execution` payload each delegation-redeem helper produces — that is
 * the load-bearing piece: get the wrong target/value/callData and the
 * enforcers (or the framework) revert.
 */
const mockRedeem = vi.fn();
vi.mock("../agent-action", () => ({
    redeemArpDelegation: (...args: unknown[]) => mockRedeem(...args),
}));

// Pin pinThing too — same rationale as the intuition-graph test.
vi.mock("../intuition-pin", () => ({
    pinThing: vi.fn(),
}));
import {pinThing} from "../intuition-pin";
const mockPin = pinThing as unknown as Mock;

import {
    APPROVAL_DEPOSIT,
    grantSmartAccountDepositApproval,
    redeemCreateAtom,
    redeemDeclareTriple,
    redeemEnsureAtomForThing,
    redeemEnsureAtomForURI,
    redeemRegisterModule,
    redeemStakeOnAtom,
} from "../delegation-redeem";

const MULTI_VAULT = deployments.intuition.multiVault;
const MODULE_REGISTRY = deployments.arp.moduleRegistry;
const ATOM_ID: Hex = `0x${"d1".repeat(32)}`;
const TOOL_ATOM: Hex = `0x${"d2".repeat(32)}`;
const AGENT_ATOM: Hex = `0x${"d3".repeat(32)}`;
const USES_ATOM: Hex = `0x${"d4".repeat(32)}`;
const TX_HASH = `0x${"ee".repeat(32)}` as Hex;

const fakeDelegation = {
    delegate: DEFAULT_TEST_ADDRESS,
    delegator: "0x1111111111111111111111111111111111111111" as Hex,
    authority:
        "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff" as Hex,
    caveats: [],
    salt: `0x${"00".repeat(32)}` as Hex,
    signature: `0x${"aa".repeat(65)}` as Hex,
};

beforeEach(() => {
    mockRedeem.mockReset();
    mockRedeem.mockResolvedValue(TX_HASH);
    mockPin.mockReset();
});

describe("redeemRegisterModule", () => {
    it("calls redeemArpDelegation with a registerModule execution against the registry", async () => {
        const wc = makeMockWalletClient();
        const tx = await redeemRegisterModule({
            signedDelegation: fakeDelegation,
            agentWalletClient: wc,
            name: "Slither",
            domain: "solidity-audit",
            schemaURI: "ipfs://slither",
            description: "Static analysis.",
        });

        expect(tx).toBe(TX_HASH);
        expect(mockRedeem).toHaveBeenCalledTimes(1);
        const args = mockRedeem.mock.calls[0][0] as {
            signedDelegation: typeof fakeDelegation;
            execution: {target: Address; value: bigint; callData: Hex};
            agentWalletClient: MockWalletClient;
        };
        expect(args.signedDelegation).toBe(fakeDelegation);
        expect(args.agentWalletClient).toBe(wc);
        expect(args.execution.target).toBe(MODULE_REGISTRY);
        expect(args.execution.value).toBe(0n);

        const decoded = decodeFunctionData({
            abi: [
                {
                    type: "function",
                    name: "registerModule",
                    inputs: [
                        {name: "name", type: "string"},
                        {name: "domain", type: "string"},
                        {name: "schemaURI", type: "string"},
                        {name: "description", type: "string"},
                    ],
                    outputs: [{name: "id", type: "uint256"}],
                    stateMutability: "nonpayable",
                },
            ] as const,
            data: args.execution.callData,
        });
        expect(decoded.functionName).toBe("registerModule");
        expect(decoded.args).toEqual([
            "Slither",
            "solidity-audit",
            "ipfs://slither",
            "Static analysis.",
        ]);
    });
});

describe("redeemStakeOnAtom", () => {
    let pc: MockPublicClient;
    let wc: MockWalletClient;

    beforeEach(() => {
        pc = makeMockPublicClient();
        wc = makeMockWalletClient();
        pc.readContract.mockImplementation(
            readContractDispatcher({
                getBondingCurveConfig: {
                    registry: "0x0000000000000000000000000000000000000001" as Address,
                    defaultCurveId: 5n,
                },
            }),
        );
    });

    it("encodes deposit(receiver, atomId, curveId, minShares) with sender as default receiver", async () => {
        const amount = parseEther("0.1");
        const tx = await redeemStakeOnAtom({
            signedDelegation: fakeDelegation,
            agentWalletClient: wc,
            publicClient: pc,
            atomId: ATOM_ID,
            amount,
        });
        expect(tx).toBe(TX_HASH);

        const args = mockRedeem.mock.calls[0][0] as {
            execution: {target: Address; value: bigint; callData: Hex};
        };
        expect(args.execution.target).toBe(MULTI_VAULT);
        expect(args.execution.value).toBe(amount);

        const decoded = decodeFunctionData({abi: multiVaultAbi, data: args.execution.callData});
        expect(decoded.functionName).toBe("deposit");
        expect(decoded.args).toEqual([DEFAULT_TEST_ADDRESS, ATOM_ID, 5n, 0n]);
    });

    it("forwards a custom receiver", async () => {
        const custom: Address = "0x000000000000000000000000000000000000dEaD";
        await redeemStakeOnAtom({
            signedDelegation: fakeDelegation,
            agentWalletClient: wc,
            publicClient: pc,
            atomId: ATOM_ID,
            amount: 1n,
            receiver: custom,
        });
        const args = mockRedeem.mock.calls[0][0] as {
            execution: {callData: Hex};
        };
        const decoded = decodeFunctionData({abi: multiVaultAbi, data: args.execution.callData});
        expect(decoded.functionName).toBe("deposit");
        if (decoded.functionName === "deposit") {
            expect(decoded.args[0]).toBe(custom);
        }
    });
});

describe("redeemCreateAtom", () => {
    it("encodes createAtoms([atomData], [cost]) with value = cost", async () => {
        const wc = makeMockWalletClient();
        const data: Hex = stringToHex("ipfs://x");
        await redeemCreateAtom({
            signedDelegation: fakeDelegation,
            agentWalletClient: wc,
            atomData: data,
            atomCost: 123n,
        });
        const args = mockRedeem.mock.calls[0][0] as {
            execution: {target: Address; value: bigint; callData: Hex};
        };
        expect(args.execution.target).toBe(MULTI_VAULT);
        expect(args.execution.value).toBe(123n);
        const decoded = decodeFunctionData({abi: multiVaultAbi, data: args.execution.callData});
        expect(decoded.functionName).toBe("createAtoms");
        if (decoded.functionName === "createAtoms") {
            expect(decoded.args).toEqual([[data], [123n]]);
        }
    });
});

describe("redeemEnsureAtomForThing", () => {
    let pc: MockPublicClient;
    let wc: MockWalletClient;

    beforeEach(() => {
        pc = makeMockPublicClient();
        wc = makeMockWalletClient();
        mockPin.mockResolvedValue("ipfs://bafkrei-foo");
    });

    it("returns created=false and skips redeem when the atom already exists", async () => {
        pc.readContract.mockImplementation(
            readContractDispatcher({
                calculateAtomId: ATOM_ID,
                isTermCreated: true,
            }),
        );

        const result = await redeemEnsureAtomForThing({
            signedDelegation: fakeDelegation,
            agentWalletClient: wc,
            publicClient: pc,
            thing: {name: "x", description: "y"},
        });
        expect(result.created).toBe(false);
        expect(result.atomId).toBe(ATOM_ID);
        expect(mockRedeem).not.toHaveBeenCalled();
    });

    it("pins, reads cost, then redeems createAtoms when the atom is new", async () => {
        pc.readContract.mockImplementation(
            readContractDispatcher({
                calculateAtomId: ATOM_ID,
                isTermCreated: false,
                getAtomCost: 100n,
            }),
        );

        const result = await redeemEnsureAtomForThing({
            signedDelegation: fakeDelegation,
            agentWalletClient: wc,
            publicClient: pc,
            thing: {name: "x", description: "y"},
        });
        expect(result.created).toBe(true);
        expect(result.tx).toBe(TX_HASH);
        expect(mockRedeem).toHaveBeenCalledTimes(1);
        const args = mockRedeem.mock.calls[0][0] as {
            execution: {target: Address; value: bigint; callData: Hex};
        };
        expect(args.execution.target).toBe(MULTI_VAULT);
        expect(args.execution.value).toBe(100n);
        const decoded = decodeFunctionData({abi: multiVaultAbi, data: args.execution.callData});
        expect(decoded.functionName).toBe("createAtoms");
        expect(pc.waitForTransactionReceipt).toHaveBeenCalledWith({hash: TX_HASH});
    });
});

describe("redeemEnsureAtomForURI", () => {
    const TOOL_URI = "ipfs://bafkrei-slither-schema";
    const TOOL_DATA = stringToHex(TOOL_URI);
    const TOOL_ATOM_FROM_URI: Hex = `0x${"88".repeat(32)}`;

    it("returns {created:false} and skips redeem when the URI atom exists", async () => {
        const pc = makeMockPublicClient();
        const wc = makeMockWalletClient();
        pc.readContract.mockImplementation(
            readContractDispatcher({
                calculateAtomId: TOOL_ATOM_FROM_URI,
                isTermCreated: true,
            }),
        );

        const result = await redeemEnsureAtomForURI({
            signedDelegation: fakeDelegation,
            agentWalletClient: wc,
            publicClient: pc,
            uri: TOOL_URI,
        });
        expect(result).toEqual({atomId: TOOL_ATOM_FROM_URI, created: false});
        expect(mockRedeem).not.toHaveBeenCalled();
        expect(mockPin).not.toHaveBeenCalled();
    });

    it("redeems createAtoms from stringToHex(uri) when the atom is new — no pinThing path", async () => {
        const pc = makeMockPublicClient();
        const wc = makeMockWalletClient();
        pc.readContract.mockImplementation(
            readContractDispatcher({
                calculateAtomId: TOOL_ATOM_FROM_URI,
                isTermCreated: false,
                getAtomCost: 250n,
            }),
        );

        const result = await redeemEnsureAtomForURI({
            signedDelegation: fakeDelegation,
            agentWalletClient: wc,
            publicClient: pc,
            uri: TOOL_URI,
        });

        expect(result.created).toBe(true);
        expect(result.atomId).toBe(TOOL_ATOM_FROM_URI);
        expect(result.tx).toBe(TX_HASH);
        expect(mockPin).not.toHaveBeenCalled();
        expect(mockRedeem).toHaveBeenCalledTimes(1);
        const args = mockRedeem.mock.calls[0][0] as {
            execution: {target: Address; value: bigint; callData: Hex};
        };
        expect(args.execution.value).toBe(250n);
        const decoded = decodeFunctionData({abi: multiVaultAbi, data: args.execution.callData});
        expect(decoded.functionName).toBe("createAtoms");
        if (decoded.functionName === "createAtoms") {
            expect(decoded.args).toEqual([[TOOL_DATA], [250n]]);
        }
        expect(pc.waitForTransactionReceipt).toHaveBeenCalledWith({hash: TX_HASH});
    });
});

describe("grantSmartAccountDepositApproval", () => {
    const SA: Address = "0x000000000000000000000000000000000000F11E";

    it("calls MultiVault.approve(SA, DEPOSIT) from the runtime and waits for the receipt", async () => {
        const pc = makeMockPublicClient();
        const wc = makeMockWalletClient();

        const tx = await grantSmartAccountDepositApproval({
            agentWalletClient: wc,
            smartAccountAddress: SA,
            publicClient: pc,
        });

        expect(tx).toBe(`0x${"aa".repeat(32)}`);
        expect(wc.writeContract).toHaveBeenCalledTimes(1);
        const call = wc.writeContract.mock.calls[0][0] as {
            address: string;
            functionName: string;
            args: readonly [Address, number];
        };
        expect(call.address).toBe(MULTI_VAULT);
        expect(call.functionName).toBe("approve");
        expect(call.args[0]).toBe(SA);
        expect(call.args[1]).toBe(APPROVAL_DEPOSIT);
        expect(pc.waitForTransactionReceipt).toHaveBeenCalledWith({
            hash: `0x${"aa".repeat(32)}`,
        });
    });
});

describe("redeemDeclareTriple", () => {
    const TRIPLE_ID: Hex = `0x${"71".repeat(32)}`;

    it("returns {created:false} and skips redeem when the triple already exists", async () => {
        const pc = makeMockPublicClient();
        const wc = makeMockWalletClient();
        pc.readContract.mockImplementation(
            readContractDispatcher({
                calculateTripleId: TRIPLE_ID,
                isTermCreated: true,
            }),
        );

        const result = await redeemDeclareTriple({
            signedDelegation: fakeDelegation,
            agentWalletClient: wc,
            publicClient: pc,
            subjectAtomId: AGENT_ATOM,
            predicateAtomId: USES_ATOM,
            objectAtomId: TOOL_ATOM,
        });

        expect(result).toEqual({tripleId: TRIPLE_ID, created: false});
        expect(mockRedeem).not.toHaveBeenCalled();
    });

    it("encodes createTriples with the subject/predicate/object and tripleCost when new", async () => {
        const pc = makeMockPublicClient();
        const wc = makeMockWalletClient();
        pc.readContract.mockImplementation(
            readContractDispatcher({
                calculateTripleId: TRIPLE_ID,
                isTermCreated: false,
                getTripleCost: 77n,
            }),
        );

        const result = await redeemDeclareTriple({
            signedDelegation: fakeDelegation,
            agentWalletClient: wc,
            publicClient: pc,
            subjectAtomId: AGENT_ATOM,
            predicateAtomId: USES_ATOM,
            objectAtomId: TOOL_ATOM,
        });
        expect(result.tripleId).toBe(TRIPLE_ID);
        expect(result.created).toBe(true);
        expect(result.tx).toBe(TX_HASH);
        const args = mockRedeem.mock.calls[0][0] as {
            execution: {target: Address; value: bigint; callData: Hex};
        };
        expect(args.execution.target).toBe(MULTI_VAULT);
        expect(args.execution.value).toBe(77n);
        const decoded = decodeFunctionData({abi: multiVaultAbi, data: args.execution.callData});
        expect(decoded.functionName).toBe("createTriples");
        if (decoded.functionName === "createTriples") {
            expect(decoded.args).toEqual([
                [AGENT_ATOM],
                [USES_ATOM],
                [TOOL_ATOM],
                [77n],
            ]);
        }
        expect(pc.waitForTransactionReceipt).toHaveBeenCalledWith({hash: TX_HASH});
    });
});
