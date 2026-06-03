import {beforeEach, describe, expect, it, vi, type Mock} from "vitest";
import {stringToHex, type Hex} from "viem";

import {deployments} from "../../lib/deployments";
import {intuitionTestnet} from "../../lib/chains";

import {
    makeMockPublicClient,
    makeMockWalletClient,
    readContractDispatcher,
    type MockPublicClient,
    type MockWalletClient,
} from "./fixtures";

const MULTI_VAULT = deployments.intuition.multiVault;

const AGENT_THING_URI = "ipfs://bafkrei-agent";
const USES_THING_URI = "ipfs://bafkrei-uses";
const TOOL_THING_URI = "ipfs://bafkrei-tool";

const AGENT_ATOM: Hex = `0x${"a1".repeat(32)}`;
const USES_ATOM: Hex = `0x${"a2".repeat(32)}`;
const TOOL_ATOM: Hex = `0x${"a3".repeat(32)}`;

const ATOM_COST = 100n;
const TRIPLE_COST = 50n;

// pinThing is mocked at the module boundary — the service calls it via
// import and we never want a real fetch in unit tests.
vi.mock("../intuition-pin", () => ({
    pinThing: vi.fn(),
}));

// Re-import the mocked module so we can assert on its calls. The cast
// pattern matches the recommended vitest approach for ESM mocks.
import {pinThing} from "../intuition-pin";
const mockPin = pinThing as unknown as Mock;

/**
 * Reset the module under test before every test so its module-scoped
 * `cachedUsesAtomId` does not leak between cases. Each test re-imports
 * `intuition-graph` and uses the fresh export. Sub-test calls within one
 * test still observe the cache they themselves built.
 */
async function freshGraph() {
    vi.resetModules();
    return await import("../intuition-graph");
}

function makeAtomIdReader() {
    return ({args}: {args: readonly unknown[]}) => {
        const data = args[0] as Hex;
        if (data === stringToHex(AGENT_THING_URI)) return AGENT_ATOM;
        if (data === stringToHex(USES_THING_URI)) return USES_ATOM;
        if (data === stringToHex(TOOL_THING_URI)) return TOOL_ATOM;
        throw new Error(`Unexpected atomData passed to calculateAtomId: ${data}`);
    };
}

function makeIsTermCreatedReader(existing: Set<Hex>) {
    return ({args}: {args: readonly unknown[]}) => {
        return existing.has(args[0] as Hex);
    };
}

describe("ensureAtomForThing", () => {
    let pc: MockPublicClient;
    let wc: MockWalletClient;

    beforeEach(() => {
        pc = makeMockPublicClient();
        wc = makeMockWalletClient();
        mockPin.mockReset();
        mockPin.mockImplementation(async ({name}: {name: string}) => {
            if (name === "uses") return USES_THING_URI;
            if (name === "Solidity Audit") return TOOL_THING_URI;
            return AGENT_THING_URI;
        });
    });

    it("returns {created:false} when the atom already exists, skipping createAtoms", async () => {
        pc.readContract.mockImplementation(
            readContractDispatcher({
                calculateAtomId: makeAtomIdReader(),
                isTermCreated: makeIsTermCreatedReader(new Set([AGENT_ATOM])),
            }),
        );
        const {ensureAtomForThing} = await freshGraph();

        const result = await ensureAtomForThing({
            thing: {name: "ARP Agent #1", description: "desc"},
            walletClient: wc,
            publicClient: pc,
        });

        expect(result).toEqual({
            atomId: AGENT_ATOM,
            uri: AGENT_THING_URI,
            created: false,
        });
        expect(wc.writeContract).not.toHaveBeenCalled();
        expect(pc.waitForTransactionReceipt).not.toHaveBeenCalled();
    });

    it("pins, reads atomCost, and calls createAtoms when the atom is new", async () => {
        pc.readContract.mockImplementation(
            readContractDispatcher({
                calculateAtomId: makeAtomIdReader(),
                isTermCreated: makeIsTermCreatedReader(new Set()),
                getAtomCost: ATOM_COST,
            }),
        );
        const {ensureAtomForThing} = await freshGraph();

        const result = await ensureAtomForThing({
            thing: {name: "ARP Agent #1", description: "desc"},
            walletClient: wc,
            publicClient: pc,
        });

        expect(result.created).toBe(true);
        expect(result.atomId).toBe(AGENT_ATOM);
        expect(result.uri).toBe(AGENT_THING_URI);
        expect(result.tx).toBe(`0x${"aa".repeat(32)}`);

        expect(wc.writeContract).toHaveBeenCalledTimes(1);
        const call = wc.writeContract.mock.calls[0][0] as {
            address: string;
            functionName: string;
            args: readonly unknown[];
            value: bigint;
            chain: {id: number};
        };
        expect(call.address).toBe(MULTI_VAULT);
        expect(call.functionName).toBe("createAtoms");
        expect(call.args).toEqual([[stringToHex(AGENT_THING_URI)], [ATOM_COST]]);
        expect(call.value).toBe(ATOM_COST);
        expect(call.chain.id).toBe(intuitionTestnet.id);
        expect(pc.waitForTransactionReceipt).toHaveBeenCalledWith({hash: result.tx});
    });

    it("passes empty strings to pinThing for missing optional image and url fields", async () => {
        pc.readContract.mockImplementation(
            readContractDispatcher({
                calculateAtomId: makeAtomIdReader(),
                isTermCreated: makeIsTermCreatedReader(new Set([AGENT_ATOM])),
            }),
        );
        const {ensureAtomForThing} = await freshGraph();

        await ensureAtomForThing({
            thing: {name: "ARP Agent #1", description: "desc"},
            walletClient: wc,
            publicClient: pc,
        });

        expect(mockPin).toHaveBeenCalledWith({
            name: "ARP Agent #1",
            description: "desc",
            image: "",
            url: "",
        });
    });
});

describe("ensureAtomForURI", () => {
    const TOOL_URI = "ipfs://bafkrei-slither";
    const TOOL_DATA = stringToHex(TOOL_URI);
    const TOOL_ATOM_FROM_URI: Hex = `0x${"77".repeat(32)}`;

    beforeEach(() => {
        // Reset the module-scoped pinThing mock so the assertions that
        // ensureAtomForURI never pins start from a clean slate.
        mockPin.mockReset();
    });

    function uriReader() {
        return ({args}: {args: readonly unknown[]}) => {
            const data = args[0] as Hex;
            if (data === TOOL_DATA) return TOOL_ATOM_FROM_URI;
            throw new Error(`unexpected atomData ${data}`);
        };
    }

    it("returns {created:false} when the canonical URI's atom already exists, skipping createAtoms", async () => {
        const pc = makeMockPublicClient();
        const wc = makeMockWalletClient();
        pc.readContract.mockImplementation(
            readContractDispatcher({
                calculateAtomId: uriReader(),
                isTermCreated: ({args}: {args: readonly unknown[]}) =>
                    args[0] === TOOL_ATOM_FROM_URI,
            }),
        );
        const {ensureAtomForURI} = await freshGraph();

        const result = await ensureAtomForURI({
            uri: TOOL_URI,
            walletClient: wc,
            publicClient: pc,
        });

        expect(result).toEqual({atomId: TOOL_ATOM_FROM_URI, created: false});
        expect(wc.writeContract).not.toHaveBeenCalled();
        expect(mockPin).not.toHaveBeenCalled();
    });

    it("creates the atom from stringToHex(uri) directly, never calling pinThing", async () => {
        const pc = makeMockPublicClient();
        const wc = makeMockWalletClient();
        pc.readContract.mockImplementation(
            readContractDispatcher({
                calculateAtomId: uriReader(),
                isTermCreated: () => false,
                getAtomCost: ATOM_COST,
            }),
        );
        const {ensureAtomForURI} = await freshGraph();

        const result = await ensureAtomForURI({
            uri: TOOL_URI,
            walletClient: wc,
            publicClient: pc,
        });

        expect(result.created).toBe(true);
        expect(result.atomId).toBe(TOOL_ATOM_FROM_URI);
        expect(mockPin).not.toHaveBeenCalled();
        const call = wc.writeContract.mock.calls[0][0] as {
            address: string;
            functionName: string;
            args: readonly unknown[];
            value: bigint;
            chain: {id: number};
        };
        expect(call.address).toBe(MULTI_VAULT);
        expect(call.functionName).toBe("createAtoms");
        expect(call.args).toEqual([[TOOL_DATA], [ATOM_COST]]);
        expect(call.value).toBe(ATOM_COST);
    });
});

describe("getOrCreateUsesPredicateAtomId", () => {
    it("ensures the 'uses' atom on first call, reuses cache on the second", async () => {
        const pc = makeMockPublicClient();
        const wc = makeMockWalletClient();
        mockPin.mockReset();
        mockPin.mockResolvedValue(USES_THING_URI);

        pc.readContract.mockImplementation(
            readContractDispatcher({
                calculateAtomId: makeAtomIdReader(),
                isTermCreated: makeIsTermCreatedReader(new Set([USES_ATOM])),
            }),
        );

        const {getOrCreateUsesPredicateAtomId} = await freshGraph();

        const first = await getOrCreateUsesPredicateAtomId({
            walletClient: wc,
            publicClient: pc,
        });
        const second = await getOrCreateUsesPredicateAtomId({
            walletClient: wc,
            publicClient: pc,
        });

        expect(first).toBe(USES_ATOM);
        expect(second).toBe(USES_ATOM);
        // Pinned once — second call short-circuits on the cached id.
        expect(mockPin).toHaveBeenCalledTimes(1);
        // No new readContract for the second lookup either.
        const readCalls = pc.readContract.mock.calls.length;
        expect(readCalls).toBeLessThanOrEqual(2);
    });
});

describe("declareUsesTriple", () => {
    const TRIPLE_ID: Hex = `0x${"73".repeat(32)}`;

    let pc: MockPublicClient;
    let wc: MockWalletClient;

    beforeEach(() => {
        pc = makeMockPublicClient();
        wc = makeMockWalletClient();
        mockPin.mockReset();
        mockPin.mockResolvedValue(USES_THING_URI);
    });

    it("creates the triple with the cached 'uses' predicate sandwiched between agent and tool", async () => {
        // uses atom already exists (skip pin/create); triple id is new
        pc.readContract.mockImplementation(
            readContractDispatcher({
                calculateAtomId: makeAtomIdReader(),
                isTermCreated: ({args}: {args: readonly unknown[]}) =>
                    args[0] === USES_ATOM, // uses exists, triple id does not
                calculateTripleId: TRIPLE_ID,
                getTripleCost: TRIPLE_COST,
            }),
        );
        const {declareUsesTriple} = await freshGraph();

        const result = await declareUsesTriple({
            agentAtomId: AGENT_ATOM,
            toolAtomId: TOOL_ATOM,
            walletClient: wc,
            publicClient: pc,
        });

        expect(result.tripleId).toBe(TRIPLE_ID);
        expect(result.created).toBe(true);
        expect(result.tx).toBe(`0x${"aa".repeat(32)}`);
        const call = wc.writeContract.mock.calls[0][0] as {
            address: string;
            functionName: string;
            args: readonly unknown[];
            value: bigint;
            chain: {id: number};
        };
        expect(call.address).toBe(MULTI_VAULT);
        expect(call.functionName).toBe("createTriples");
        expect(call.args).toEqual([[AGENT_ATOM], [USES_ATOM], [TOOL_ATOM], [TRIPLE_COST]]);
        expect(call.value).toBe(TRIPLE_COST);
        expect(call.chain.id).toBe(intuitionTestnet.id);
        expect(pc.waitForTransactionReceipt).toHaveBeenCalledWith({hash: result.tx});
    });

    it("returns {created:false} and skips createTriples when the triple already exists", async () => {
        // Both uses atom AND the resulting triple id are already created
        pc.readContract.mockImplementation(
            readContractDispatcher({
                calculateAtomId: makeAtomIdReader(),
                isTermCreated: ({args}: {args: readonly unknown[]}) =>
                    args[0] === USES_ATOM || args[0] === TRIPLE_ID,
                calculateTripleId: TRIPLE_ID,
            }),
        );
        const {declareUsesTriple} = await freshGraph();

        const result = await declareUsesTriple({
            agentAtomId: AGENT_ATOM,
            toolAtomId: TOOL_ATOM,
            walletClient: wc,
            publicClient: pc,
        });

        expect(result).toEqual({tripleId: TRIPLE_ID, created: false});
        expect(wc.writeContract).not.toHaveBeenCalled();
    });
});
