import {
    decodeEventLog,
    type Account,
    type Address,
    type Chain,
    type Hex,
    type PublicClient,
    type Transport,
    type WalletClient,
} from "viem";
import {base} from "viem/chains";
import {DEFAULT_IDENTITY_REGISTRY, registrationUriBytes} from "@arp-protocol/core";

import {identityRegistryAbi} from "../lib/abi/identity-registry";
import {waitAndRecord} from "./tx-record";

/**
 * Mint a **real** ERC-8004 identity, in the canonical registry.
 *
 * ## Why this exists
 *
 * `/agent` used to mint into ARP's **own copy** of the reference registry on Intuition testnet
 * 13579. That is a rehearsal prop and `rules/portability.md` rule 4 names it as one: _"never rely
 * on controlling the registry. On mainnet it owns nothing. Any step that works because ARP can
 * write to the registry is not a step, it is a rehearsal."_ An identity minted there is invisible
 * to every other ERC-8004 reader, and to Intuition's mirror, which covers Base.
 *
 * The canonical registry is at the same address on several chains and **`register()` is open to
 * anyone**. Measured by `scripts/measure/canonical-registry.ts` on 2026-10-27:
 *
 * | chain      | name / symbol         | `register()` from a zero-balance address |
 * | ---------- | --------------------- | ---------------------------------------- |
 * | Base 8453  | AgentIdentity / AGENT | simulates OK, next id 1,137,885          |
 * | BSC 56     | AgentIdentity / AGENT | simulates OK, next id 393,928            |
 *
 * **Base only here, and that is a decision rather than a limitation.** Intuition's mirror covers
 * Base — 30,913 identities mirrored into the graph against a cohort on three chains — so an
 * identity minted anywhere else is real and still unreadable by everything this app does next.
 * BSC and Ethereum hold registry entries with no trust edges in the graph, which `/agents` already
 * says in its lookup form.
 *
 * ## It mints **with** a registration file, and that is not optional
 *
 * `register()` takes no argument and leaves `tokenURI` empty. That is a legal ERC-8004 identity
 * which says nothing — no name, no description, no endpoint — and it is the state a large part of
 * the cohort is in: probed on Base 2026-10-27, agents `6649` and `500000` both return an empty
 * `tokenURI`. Those are exactly the rows this app already renders as the indexer's stand-in,
 * `Agent 8453:6649` (`metadata.isFallback`).
 *
 * Everything downstream degrades from that one missing argument: no `tokenURI` → no
 * `registrationFile` → `prepareIdentityAtom` falls back to the frozen recipe's defaults → the
 * Intuition atom carries a stand-in name → every reader sees a nameless agent. So this module
 * calls `register(string agentURI)`, which the same probe showed simulating from a zero-balance
 * address. `packages/protocol/src/registration-file.ts` builds the document.
 *
 * ## What the simulation proves, and what it does not
 *
 * `eth_call` from an address holding nothing proved `register()` is not permission-gated and takes
 * no value. It does **not** prove a broadcast will land: that needs gas on Base, which is the
 * operator's own ETH on a chain this app had never addressed. So the flow simulates, then asks, and
 * the id it shows before signing is a **prediction** — the fact comes off the receipt.
 *
 * ## Why the id is read from the receipt and not from the simulation
 *
 * `register()` returns the new id, and `simulateContract` hands that back. It is the id the mint
 * *would* get if it landed in the next block. Between the simulation and the broadcast anybody else
 * may mint, and then the prediction is one short. Taking it from the `Registered` event in the
 * receipt is the only reading that cannot be stale.
 *
 * ## Not automated, ever
 *
 * One call, from one click handler. No effect, no retry, no mutation wrapper — the same discipline
 * as the staking path (ADR `0017` safeguard 5) and for the same reason: a retry that resubmits
 * mints a second identity the operator did not ask for and cannot undo.
 */

/** A guard refused. The UI branches on `code` rather than parsing a message. */
export class MintGuardError extends Error {
    readonly code: "wrong-chain" | "no-account" | "no-id-in-receipt" | "reverted";

    constructor(code: MintGuardError["code"], message: string) {
        super(message);
        this.name = "MintGuardError";
        this.code = code;
    }
}

/** Where a real identity is minted. Exported so the UI can name it without a second constant. */
export const MINT_CHAIN = base;

export const MINT_REGISTRY: Address = DEFAULT_IDENTITY_REGISTRY;

const registry = {address: MINT_REGISTRY, abi: identityRegistryAbi} as const;

export type MintQuote = {
    /** The id the mint would take if it landed next. A prediction, not the outcome. */
    predictedTokenId: string;
    /** The exact string that will be stored as `agentURI`. Shown before signing, byte for byte. */
    agentUri: string;
    /** What the registry will store. The gas cost in the only unit a reader can act on. */
    uriBytes: number;
    /** The wallet that will own it. */
    owner: Address;
    chainId: number;
    registry: Address;
    /** `eth_estimateGas` on the real call, so the page can state a cost before asking. */
    gas: bigint;
    /** Wei per gas, read at quote time. Base is cheap and this is still read, never assumed. */
    maxFeePerGas: bigint | null;
};

function assertOnMintChain(chainId: number | undefined): void {
    if (chainId !== MINT_CHAIN.id) {
        throw new MintGuardError(
            "wrong-chain",
            `An ERC-8004 identity is minted on ${MINT_CHAIN.name} (${MINT_CHAIN.id}). Your wallet ` +
                `reports ${chainId ?? "no chain"}. Nothing was sent.`,
        );
    }
}

/**
 * Simulate the mint and price it, before anything is signed.
 *
 * Read-only. A revert here costs nothing and names itself; one on chain costs the gas and says
 * `execution reverted`.
 */
export async function quoteMint(params: {
    publicClient: PublicClient;
    owner: Address;
    /** The document, already built. Required — see the header on why an empty one is not offered. */
    agentUri: string;
}): Promise<MintQuote> {
    const {publicClient, owner, agentUri} = params;

    let predicted: bigint;
    try {
        const {result} = await publicClient.simulateContract({
            ...registry,
            functionName: "register",
            args: [agentUri],
            account: owner,
        });
        predicted = result;
    } catch (caught) {
        throw new MintGuardError(
            "reverted",
            `The registry refused the mint in simulation: ${
                caught instanceof Error ? caught.message.split("\n")[0] : String(caught)
            }`,
        );
    }

    const [gas, fees] = await Promise.all([
        publicClient.estimateContractGas({
            ...registry,
            functionName: "register",
            args: [agentUri],
            account: owner,
        }),
        // Not fatal: a chain without EIP-1559 fee history still mints, the page just cannot
        // price it. Silence here would be the `claims.md` failure — a cost shown as zero.
        publicClient.estimateFeesPerGas().catch(() => null),
    ]);

    return {
        predictedTokenId: predicted.toString(),
        agentUri,
        uriBytes: registrationUriBytes(agentUri),
        owner,
        chainId: MINT_CHAIN.id,
        registry: MINT_REGISTRY,
        gas,
        maxFeePerGas: fees?.maxFeePerGas ?? null,
    };
}

export type MintResult = {
    /** What was stored, so a caller can show it without re-deriving it. */
    agentUri: string;
    /** From the `Registered` event. The fact, as opposed to the quote's prediction. */
    tokenId: string;
    hash: Hex;
    owner: Address;
    chainId: number;
};

/**
 * Sign and broadcast the mint, then read the id out of the receipt.
 *
 * Every guard is re-checked here rather than trusted from the render that produced the quote, and
 * the chain is asked twice — once as the client was built, once as the wallet actually is. A wallet
 * client's `chain` is whatever it was configured with; `getChainId()` asks the wallet.
 */
export async function submitMint(params: {
    walletClient: WalletClient<Transport, Chain, Account>;
    publicClient: PublicClient;
    /** The same string the quote was priced against. Carried, not re-derived. */
    agentUri: string;
}): Promise<MintResult> {
    const {walletClient, publicClient, agentUri} = params;

    assertOnMintChain(walletClient.chain?.id);
    assertOnMintChain(await walletClient.getChainId());

    const owner = walletClient.account.address;
    // Simulated again, immediately before signing: the quote may have been held while somebody
    // else changed the registry's state.
    await quoteMint({publicClient, owner, agentUri});

    const hash = await walletClient.writeContract({
        ...registry,
        functionName: "register",
        args: [agentUri],
        chain: MINT_CHAIN,
    });
    const receipt = await waitAndRecord(publicClient, hash, {label: "mint identity"});

    const tokenId = tokenIdFromReceipt(receipt.logs, owner);
    if (tokenId === null) {
        throw new MintGuardError(
            "no-id-in-receipt",
            `The mint landed in ${hash} but no Registered event names the new id. The identity ` +
                `exists — look the transaction up before minting again.`,
        );
    }

    return {tokenId, agentUri, hash, owner, chainId: MINT_CHAIN.id};
}

/**
 * The new id, from the `Registered(uint256 indexed agentId, string agentURI, address indexed to)`
 * event.
 *
 * Scoped to logs from the registry **and** to events naming this owner. A transaction may carry
 * logs from several contracts, and a batching wallet may carry several mints — taking the first
 * `Registered` would hand back somebody else's id.
 */
export function tokenIdFromReceipt(
    logs: readonly {address: string; topics: readonly Hex[]; data: Hex}[],
    owner: Address,
): string | null {
    const target = MINT_REGISTRY.toLowerCase();
    for (const log of logs) {
        if (log.address.toLowerCase() !== target) continue;
        try {
            const decoded = decodeEventLog({
                abi: identityRegistryAbi,
                topics: log.topics as [Hex, ...Hex[]],
                data: log.data,
            });
            if (decoded.eventName !== "Registered") continue;
            const args = decoded.args as unknown as {agentId: bigint; to: Address};
            if (args.to.toLowerCase() !== owner.toLowerCase()) continue;
            return args.agentId.toString();
        } catch {
            // Not an event this ABI knows. The registry emits ERC-721 `Transfer` too, and a log
            // this ABI cannot decode is data about something else, not a failure.
            continue;
        }
    }
    return null;
}
