import {describe, expect, it, vi} from "vitest";
import {encodeAbiParameters, keccak256, toHex, type Address, type Hex} from "viem";

import {identityRegistryAbi} from "../../lib/abi/identity-registry";
import {
    MINT_CHAIN,
    MINT_REGISTRY,
    MintGuardError,
    quoteMint,
    submitMint,
    tokenIdFromReceipt,
} from "../identity-mint";
import {DEFAULT_TEST_ACCOUNT, DEFAULT_TEST_ADDRESS} from "./fixtures";

/**
 * Tests for the mint, which sends a **real transaction on Base** with the operator's own ETH.
 *
 * ADR `0017`'s build rule applies even though this is not a deposit: "unit tests over a mocked
 * wallet client, `previewDeposit` reads, and `eth_call` simulation. A passing test suite is not a
 * reason to spend real TRUST." So every guard is exercised here and none on chain. The one on-chain
 * fact this needed — that `register()` is permissionless — came from a read-only probe,
 * `scripts/measure/canonical-registry.ts`.
 */

const OTHER: Address = "0x1111111111111111111111111111111111111111";

/** A registration file as the page would build one. Short on purpose; the shape is tested next door. */
const AGENT_URI =
    "data:application/json;base64,eyJ0eXBlIjoiaHR0cHM6Ly9laXBzLmV0aGVyZXVtLm9yZy9FSVBTL2VpcC04MDA0I3JlZ2lzdHJhdGlvbi12MSIsIm5hbWUiOiJQcm9iZSJ9";

/** The `Registered(uint256 indexed agentId, string agentURI, address indexed to)` topic. */
const REGISTERED_TOPIC = keccak256(toHex("Registered(uint256,string,address)"));

function registeredLog(params: {agentId: bigint; to: Address; address?: string}) {
    return {
        address: params.address ?? MINT_REGISTRY,
        topics: [
            REGISTERED_TOPIC,
            encodeAbiParameters([{type: "uint256"}], [params.agentId]),
            encodeAbiParameters([{type: "address"}], [params.to]),
        ] as readonly Hex[],
        data: encodeAbiParameters([{type: "string"}], [""]),
    };
}

function makePublic(overrides: Partial<Record<string, unknown>> = {}) {
    return {
        simulateContract: vi.fn().mockResolvedValue({result: 1_137_885n}),
        estimateContractGas: vi.fn().mockResolvedValue(120_000n),
        estimateFeesPerGas: vi.fn().mockResolvedValue({maxFeePerGas: 1_000_000n}),
        waitForTransactionReceipt: vi.fn().mockResolvedValue({
            logs: [registeredLog({agentId: 1_137_886n, to: DEFAULT_TEST_ADDRESS})],
        }),
        ...overrides,
    };
}

function makeWallet(chainId: number = MINT_CHAIN.id, liveChainId: number = chainId) {
    return {
        account: DEFAULT_TEST_ACCOUNT,
        chain: {id: chainId},
        getChainId: vi.fn().mockResolvedValue(liveChainId),
        writeContract: vi.fn().mockResolvedValue(`0x${"cc".repeat(32)}` as Hex),
    };
}

/* eslint-disable @typescript-eslint/no-explicit-any */
const asPublic = (client: unknown) => client as any;
const asWallet = (client: unknown) => client as any;
/* eslint-enable @typescript-eslint/no-explicit-any */

describe("where it mints", () => {
    it("targets Base and the canonical registry, not ARP's own copy", () => {
        // The whole point of this module. `rules/portability.md` rule 4: an identity in a registry
        // ARP controls is a rehearsal prop, invisible to every other ERC-8004 reader.
        expect(MINT_CHAIN.id).toBe(8453);
        expect(MINT_REGISTRY).toBe("0x8004A169FB4a3325136EB29fA0ceB6D2e539a432");
    });
});

describe("quoteMint", () => {
    it("simulates before pricing, and prices from the chain", async () => {
        const client = makePublic();
        const quote = await quoteMint({
            publicClient: asPublic(client),
            owner: DEFAULT_TEST_ADDRESS,
            agentUri: AGENT_URI,
        });
        expect(client.simulateContract).toHaveBeenCalledTimes(1);
        expect(quote.predictedTokenId).toBe("1137885");
        // The document is priced, not merely passed along: `uriBytes` is the gas cost in the only
        // unit a reader can act on, and the confirmation screen shows it.
        expect(quote.agentUri).toBe(AGENT_URI);
        expect(quote.uriBytes).toBe(AGENT_URI.length);
        expect(client.simulateContract.mock.calls[0]?.[0]).toMatchObject({args: [AGENT_URI]});
        expect(quote.gas).toBe(120_000n);
        expect(quote.maxFeePerGas).toBe(1_000_000n);
    });

    it("turns a revert into a named guard rather than a raw error", async () => {
        const client = makePublic({
            simulateContract: vi.fn().mockRejectedValue(new Error("execution reverted\nmore")),
        });
        await expect(
            quoteMint({
                publicClient: asPublic(client),
                owner: DEFAULT_TEST_ADDRESS,
                agentUri: AGENT_URI,
            }),
        ).rejects.toMatchObject({code: "reverted"});
    });

    it("survives a chain with no fee history rather than pricing it at zero", async () => {
        // A missing fee estimate must not become a cost of 0 on the confirmation screen — that is
        // the `rules/claims.md` failure this page is most exposed to. `null` makes the UI say so.
        const client = makePublic({
            estimateFeesPerGas: vi.fn().mockRejectedValue(new Error("no 1559")),
        });
        const quote = await quoteMint({
            publicClient: asPublic(client),
            owner: DEFAULT_TEST_ADDRESS,
            agentUri: AGENT_URI,
        });
        expect(quote.maxFeePerGas).toBeNull();
        expect(quote.gas).toBe(120_000n);
    });
});

describe("submitMint", () => {
    it("refuses a wallet whose configured chain is wrong, and signs nothing", async () => {
        const wallet = makeWallet(1155);
        const client = makePublic();
        await expect(
            submitMint({
                walletClient: asWallet(wallet),
                publicClient: asPublic(client),
                agentUri: AGENT_URI,
            }),
        ).rejects.toMatchObject({code: "wrong-chain"});
        expect(wallet.writeContract).not.toHaveBeenCalled();
        expect(client.simulateContract).not.toHaveBeenCalled();
    });

    it("refuses a wallet that moved after the client was built", async () => {
        // The case the second check exists for: a client built for Base reports Base whatever the
        // wallet is doing, so `getChainId()` is the only answer that catches a user who switched
        // networks after the quote.
        const wallet = makeWallet(MINT_CHAIN.id, 1155);
        const client = makePublic();
        await expect(
            submitMint({
                walletClient: asWallet(wallet),
                publicClient: asPublic(client),
                agentUri: AGENT_URI,
            }),
        ).rejects.toMatchObject({code: "wrong-chain"});
        expect(wallet.writeContract).not.toHaveBeenCalled();
    });

    it("re-simulates immediately before signing", async () => {
        // A quote can be held on screen while the registry's state moves. Trusting the render that
        // produced it is what every other write path in this app refuses to do.
        const wallet = makeWallet();
        const client = makePublic();
        await submitMint({
            walletClient: asWallet(wallet),
            publicClient: asPublic(client),
            agentUri: AGENT_URI,
        });
        expect(client.simulateContract).toHaveBeenCalledTimes(1);
        expect(wallet.writeContract).toHaveBeenCalledTimes(1);
        expect(wallet.writeContract.mock.calls[0]?.[0]).toMatchObject({
            functionName: "register",
            address: MINT_REGISTRY,
        });
    });

    it("names the chain on the write, so viem refuses a mismatch before building", async () => {
        const wallet = makeWallet();
        await submitMint({
            walletClient: asWallet(wallet),
            publicClient: asPublic(makePublic()),
            agentUri: AGENT_URI,
        });
        const sent = wallet.writeContract.mock.calls[0]?.[0] as {chain: {id: number}};
        expect(sent.chain.id).toBe(MINT_CHAIN.id);
    });

    it("reports the id from the receipt, not the one the simulation predicted", async () => {
        // The simulation said 1,137,885; the receipt says 1,137,886, because somebody minted in
        // between. The receipt is the fact and the prediction is only a prediction.
        const result = await submitMint({
            walletClient: asWallet(makeWallet()),
            publicClient: asPublic(makePublic()),
            agentUri: AGENT_URI,
        });
        expect(result.tokenId).toBe("1137886");
        expect(result.chainId).toBe(MINT_CHAIN.id);
    });

    it("says the mint landed but the id is unknown, rather than guessing one", async () => {
        // The dangerous state: the identity exists and this app cannot name it. Offering to mint
        // again here would create a second permanent NFT.
        const client = makePublic({
            waitForTransactionReceipt: vi.fn().mockResolvedValue({logs: []}),
        });
        await expect(
            submitMint({
                walletClient: asWallet(makeWallet()),
                publicClient: asPublic(client),
                agentUri: AGENT_URI,
            }),
        ).rejects.toMatchObject({code: "no-id-in-receipt"});
    });
});

describe("tokenIdFromReceipt", () => {
    it("ignores logs from another contract in the same transaction", () => {
        const logs = [
            registeredLog({agentId: 99n, to: DEFAULT_TEST_ADDRESS, address: OTHER}),
            registeredLog({agentId: 7n, to: DEFAULT_TEST_ADDRESS}),
        ];
        expect(tokenIdFromReceipt(logs, DEFAULT_TEST_ADDRESS)).toBe("7");
    });

    it("ignores a mint in the same transaction that belongs to somebody else", () => {
        // A batching wallet can carry several mints. Taking the first `Registered` would hand back
        // another account's id and the operator would address an agent they do not own.
        const logs = [
            registeredLog({agentId: 99n, to: OTHER}),
            registeredLog({agentId: 7n, to: DEFAULT_TEST_ADDRESS}),
        ];
        expect(tokenIdFromReceipt(logs, DEFAULT_TEST_ADDRESS)).toBe("7");
    });

    it("matches the owner case-insensitively", () => {
        const logs = [registeredLog({agentId: 7n, to: DEFAULT_TEST_ADDRESS})];
        expect(tokenIdFromReceipt(logs, DEFAULT_TEST_ADDRESS.toLowerCase() as Address)).toBe("7");
    });

    it("returns null rather than throwing on a log this ABI cannot decode", () => {
        // The registry also emits ERC-721 `Transfer`, which this fragment does not carry. An
        // undecodable log is data about something else, not a failure.
        const logs = [{address: MINT_REGISTRY, topics: [keccak256(toHex("Nope()"))], data: "0x"}];
        expect(tokenIdFromReceipt(logs as never, DEFAULT_TEST_ADDRESS)).toBeNull();
    });

    it("returns null for an empty receipt", () => {
        expect(tokenIdFromReceipt([], DEFAULT_TEST_ADDRESS)).toBeNull();
    });
});

describe("MintGuardError", () => {
    it("carries a code so the UI branches without parsing prose", () => {
        const error = new MintGuardError("wrong-chain", "anything");
        expect(error.code).toBe("wrong-chain");
        expect(error.name).toBe("MintGuardError");
        // The ABI is the one the rest of the app already uses for this contract, so a drifting
        // fragment would break the decode rather than silently decode wrong.
        expect(identityRegistryAbi.some((entry) => entry.name === "Registered")).toBe(true);
    });
});
