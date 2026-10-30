import {beforeEach, describe, expect, it, vi, type Mock} from "vitest";
import {stringToHex, type Hex} from "viem";

import {INTUITION_CAPABILITY_PREDICATE_IDS, INTUITION_USES_TERM_ID} from "@arp-protocol/core";

import {deployments} from "../../lib/deployments";
import {intuitionTestnet} from "../../lib/chains";
import type {PinAuth} from "../intuition-pin";

import {
    makeMockPublicClient,
    makeMockWalletClient,
    readContractDispatcher,
    type MockPublicClient,
    type MockWalletClient,
} from "./fixtures";

const MULTI_VAULT = deployments.intuition.multiVault;

const AGENT_THING_URI = "ipfs://bafkrei-agent";
const TOOL_THING_URI = "ipfs://bafkrei-tool";

const AGENT_ATOM: Hex = `0x${"a1".repeat(32)}`;
const TOOL_ATOM: Hex = `0x${"a3".repeat(32)}`;

const ATOM_COST = 100n;
const TRIPLE_COST = 50n;
/**
 * The deposit every created term is born with (ADR `0053`), read from `getGeneralConfig()` rather
 * than assumed — 0.001 TRUST on testnet 13579 against 0.01 on mainnet 1155.
 */
const MIN_DEPOSIT = 1000n;
const ATOM_ASSETS = ATOM_COST + MIN_DEPOSIT;
const TRIPLE_ASSETS = TRIPLE_COST + MIN_DEPOSIT;
const GENERAL_CONFIG = {
    admin: `0x${"11".repeat(20)}`,
    protocolMultisig: `0x${"22".repeat(20)}`,
    feeDenominator: 10_000n,
    trustBonding: `0x${"33".repeat(20)}`,
    minDeposit: MIN_DEPOSIT,
    minShare: 1_000_000n,
    atomDataMaxLength: 1000n,
    feeThreshold: 10n ** 18n,
} as const;
/** Non-zero shares, so the create is allowed. The zero case has its own test below. */
const CREATE_PREVIEW = [ATOM_ASSETS, ATOM_ASSETS, ATOM_ASSETS] as const;

// Pinning is gated behind Intuition's partner API (ADR 0016); every helper
// that pins now takes the credential as a required parameter.
// `PinAuth` is branded so only `scripts/helpers/pin-env.ts` can mint one from a real
// key. A test fixture is the other legitimate producer, and the assertion is
// what makes that deliberate rather than accidental.
const PIN_AUTH = {apiKey: "test-partner-key"} as unknown as PinAuth;

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
 * Re-import the module under test for each case, so the `pinThing` mock is
 * rebound rather than captured from a previous import.
 *
 * It used to exist to clear a module-scoped `cachedUsesAtomId`; that cache went
 * with the minted predicate (ADR 0030), and the module holds no state now.
 */
async function freshGraph() {
    vi.resetModules();
    return await import("../intuition-graph");
}

function makeAtomIdReader() {
    return ({args}: {args: readonly unknown[]}) => {
        const data = args[0] as Hex;
        if (data === stringToHex(AGENT_THING_URI)) return AGENT_ATOM;
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
            pinAuth: PIN_AUTH,
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
                getGeneralConfig: GENERAL_CONFIG,
                previewAtomCreate: CREATE_PREVIEW,
            }),
        );
        const {ensureAtomForThing} = await freshGraph();

        const result = await ensureAtomForThing({
            thing: {name: "ARP Agent #1", description: "desc"},
            walletClient: wc,
            publicClient: pc,
            pinAuth: PIN_AUTH,
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
        expect(call.args).toEqual([[stringToHex(AGENT_THING_URI)], [ATOM_ASSETS]]);
        expect(call.value).toBe(ATOM_ASSETS);
        expect(call.chain.id).toBe(intuitionTestnet.id);
        expect(pc.waitForTransactionReceipt).toHaveBeenCalledWith({hash: result.tx});
    });

    it("forwards the credential to pinThing, with empty strings for the optional fields", async () => {
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
            pinAuth: PIN_AUTH,
        });

        expect(mockPin).toHaveBeenCalledWith(
            {
                name: "ARP Agent #1",
                description: "desc",
                image: "",
                url: "",
            },
            PIN_AUTH,
        );
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

    /**
     * ADR `0053`: `assets` is the deposit and the creation fee comes out of it, so paying the fee
     * alone leaves the term with zero positions — on the chain, and not a market.
     * `previewAtomCreate` is callable before the term exists and returns `shares = 0` for exactly
     * that case (measured on both chains 2026-10-21), so the refusal costs nothing.
     *
     * This file held the third copy of the bug. The package planner and
     * `scripts/helpers/plan-identity-atom.ts` were corrected first; these write paths were missed.
     */
    it("refuses to create an atom that would buy no shares", async () => {
        const pc = makeMockPublicClient();
        const wc = makeMockWalletClient();
        pc.readContract.mockImplementation(
            readContractDispatcher({
                calculateAtomId: uriReader(),
                isTermCreated: () => false,
                getAtomCost: ATOM_COST,
                getGeneralConfig: GENERAL_CONFIG,
                previewAtomCreate: [0n, 0n, 0n] as const,
            }),
        );
        const {ensureAtomForURI, PositionlessTermError} = await freshGraph();

        await expect(
            ensureAtomForURI({uri: TOOL_URI, walletClient: wc, publicClient: pc}),
        ).rejects.toThrow(PositionlessTermError);
        expect(wc.writeContract).not.toHaveBeenCalled();
    });

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
                getGeneralConfig: GENERAL_CONFIG,
                previewAtomCreate: CREATE_PREVIEW,
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
        expect(call.args).toEqual([[TOOL_DATA], [ATOM_ASSETS]]);
        expect(call.value).toBe(ATOM_ASSETS);
    });
});

describe("declareUsesTriple", () => {
    const TRIPLE_ID: Hex = `0x${"73".repeat(32)}`;

    let pc: MockPublicClient;
    let wc: MockWalletClient;

    beforeEach(() => {
        pc = makeMockPublicClient();
        wc = makeMockWalletClient();
        // Reset, but deliberately give it no implementation: this path must not
        // reach pinThing at all, which the assertion below checks.
        mockPin.mockReset();
    });

    it("refuses to create a triple that would buy no shares", async () => {
        // The same ADR `0053` guard as the atom path above, on the edge.
        pc.readContract.mockImplementation(
            readContractDispatcher({
                isTermCreated: ({args}: {args: readonly unknown[]}) =>
                    args[0] === INTUITION_USES_TERM_ID,
                calculateTripleId: TRIPLE_ID,
                getTripleCost: TRIPLE_COST,
                getGeneralConfig: GENERAL_CONFIG,
                previewTripleCreate: [0n, 0n, 0n] as const,
            }),
        );
        const {declareUsesTriple, PositionlessTermError} = await freshGraph();

        await expect(
            declareUsesTriple({
                agentAtomId: AGENT_ATOM,
                toolAtomId: TOOL_ATOM,
                walletClient: wc,
                publicClient: pc,
            }),
        ).rejects.toThrow(PositionlessTermError);
        expect(wc.writeContract).not.toHaveBeenCalled();
    });

    it("sandwiches the shared 'uses' predicate between agent and tool", async () => {
        pc.readContract.mockImplementation(
            readContractDispatcher({
                calculateAtomId: makeAtomIdReader(),
                // The predicate exists; the triple id does not.
                isTermCreated: ({args}: {args: readonly unknown[]}) =>
                    args[0] === INTUITION_USES_TERM_ID,
                calculateTripleId: TRIPLE_ID,
                getTripleCost: TRIPLE_COST,
                getGeneralConfig: GENERAL_CONFIG,
                previewTripleCreate: [TRIPLE_ASSETS, TRIPLE_ASSETS, TRIPLE_ASSETS] as const,
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
        expect(call.args).toEqual([
            [AGENT_ATOM],
            [INTUITION_USES_TERM_ID],
            [TOOL_ATOM],
            [TRIPLE_ASSETS],
        ]);
        expect(call.value).toBe(TRIPLE_ASSETS);
        expect(call.chain.id).toBe(intuitionTestnet.id);
        expect(pc.waitForTransactionReceipt).toHaveBeenCalledWith({hash: result.tx});
        // Nothing is pinned for a predicate: it is not ours to create.
        expect(mockPin).not.toHaveBeenCalled();
    });

    it("returns {created:false} and skips createTriples when the triple already exists", async () => {
        // Both uses atom AND the resulting triple id are already created
        pc.readContract.mockImplementation(
            readContractDispatcher({
                calculateAtomId: makeAtomIdReader(),
                isTermCreated: ({args}: {args: readonly unknown[]}) =>
                    args[0] === INTUITION_USES_TERM_ID || args[0] === TRIPLE_ID,
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

describe("the write predicate is shared, readable, and semantically right", () => {
    it("writes on a predicate inside CAPABILITY_PREDICATE_IDS", () => {
        // The bug this pins: ARP used to mint its own `use` atom, so every
        // triple and every stake it wrote landed on a node the connector's
        // capability filter never matches — invisible to this repo's own reads
        // and to everyone else's. A predicate the read side does not query is
        // TRUST spent into an orphan node, which is why this is an assertion
        // and not a comment.
        expect(INTUITION_CAPABILITY_PREDICATE_IDS).toContain(INTUITION_USES_TERM_ID);
    });

    it("pins the frozen id rather than resolving a label", () => {
        // ADR 0015: ids are frozen, never resolved at runtime. Five atoms are
        // labelled `use`/`uses` on testnet and four on mainnet, so a label
        // lookup is a coin flip between fragmented nodes.
        //
        // ADR 0030: this is the tool-usage node, NOT the published `use`
        // (`0x9ddda4ac…`), whose objects are 153/158 protocols on mainnet and
        // 166/166 on testnet. Choosing on meaning over publication is the whole
        // decision, so the id is asserted literally.
        expect(INTUITION_USES_TERM_ID).toBe(
            "0x5c0bde1cc696456c0268248c4656acdf9621fdb39e605bc99b0a83dc8ff6e800",
        );
    });

    it("throws rather than minting when the predicate is absent from the chain", async () => {
        const pc = makeMockPublicClient();
        const wc = makeMockWalletClient();
        mockPin.mockReset();
        pc.readContract.mockImplementation(
            readContractDispatcher({
                calculateAtomId: makeAtomIdReader(),
                isTermCreated: () => false, // nothing exists, predicate included
                calculateTripleId: `0x${"73".repeat(32)}` as Hex,
            }),
        );
        const {declareUsesTriple, PredicateNotOnChainError} = await freshGraph();

        await expect(
            declareUsesTriple({
                agentAtomId: AGENT_ATOM,
                toolAtomId: TOOL_ATOM,
                walletClient: wc,
                publicClient: pc,
            }),
        ).rejects.toThrow(PredicateNotOnChainError);
        // The failure mode this replaces was an on-chain revert after the user
        // had approved and paid gas. Minting instead is the bug ADR 0030 closes.
        expect(wc.writeContract).not.toHaveBeenCalled();
        expect(mockPin).not.toHaveBeenCalled();
    });
});
