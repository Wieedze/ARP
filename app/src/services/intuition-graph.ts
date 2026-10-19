import {
    stringToHex,
    type Account,
    type Chain,
    type Hex,
    type PublicClient,
    type Transport,
    type WalletClient,
} from "viem";

import {INTUITION_USES_TERM_ID} from "@arp-protocol/core";

import {multiVaultAbi} from "../lib/abi/multi-vault";
import {intuitionTestnet} from "../lib/chains";
import {deployments} from "../lib/deployments";

import {pinThing, type PinAuth} from "./intuition-pin";

const MULTI_VAULT = deployments.intuition.multiVault;

/**
 * The shared `uses` predicate atom is absent from the configured chain.
 *
 * A predicate is not ours to create, so this is a configuration fault rather
 * than something to recover from by minting one — minting is the bug ADR 0030
 * exists to close.
 */
export class PredicateNotOnChainError extends Error {
    readonly termId: Hex;

    constructor(termId: Hex) {
        super(`the shared \`uses\` predicate ${termId} is not created on this chain`);
        this.name = "PredicateNotOnChainError";
        this.termId = termId;
    }
}

/**
 * ARP-specific helpers for the Intuition knowledge graph.
 *
 * The two-layer reputation model (ADR 0010) materializes here:
 *   - `ensureAtomForThing` — pin a Thing, compute its atom ID, return
 *     a created OR existing atom (idempotent).
 *   - `declareUsesTriple` — connect an agent atom to a tool atom via the
 *     **published** `use` predicate. Materializes the "immutable layer" —
 *     the agent's claim of composition gets a permanent record in the
 *     graph, on the node everybody else reads.
 *
 * Both operations defer to lower-level Intuition primitives documented
 * in `.claude/skills/intuition/operations/`.
 */

/**
 * Ensure a Thing-backed atom exists on Intuition. Pin first, then check
 * `isTermCreated`. If it exists, return the ID. Otherwise create it via
 * `MultiVault.createAtoms` and wait for confirmation.
 *
 * Returns `{ atomId, uri, created }` — `created` is `false` if the atom
 * was already on chain.
 *
 * `pinAuth` is required, not optional: pinning is gated behind Intuition's
 * partner API (ADR 0016), and only a Node entry point can supply the key. An
 * optional parameter would re-open the leak this closes.
 */
export async function ensureAtomForThing(params: {
    thing: {name: string; description: string; image?: string; url?: string};
    walletClient: WalletClient<Transport, Chain, Account>;
    publicClient: PublicClient;
    pinAuth: PinAuth;
}): Promise<{atomId: Hex; uri: string; created: boolean; tx?: Hex}> {
    const uri = await pinThing(
        {
            name: params.thing.name,
            description: params.thing.description,
            image: params.thing.image ?? "",
            url: params.thing.url ?? "",
        },
        params.pinAuth,
    );

    const atomData = stringToHex(uri);
    const atomId = await params.publicClient.readContract({
        address: MULTI_VAULT,
        abi: multiVaultAbi,
        functionName: "calculateAtomId",
        args: [atomData],
    });

    const exists = await params.publicClient.readContract({
        address: MULTI_VAULT,
        abi: multiVaultAbi,
        functionName: "isTermCreated",
        args: [atomId],
    });

    if (exists) return {atomId, uri, created: false};

    const atomCost = await params.publicClient.readContract({
        address: MULTI_VAULT,
        abi: multiVaultAbi,
        functionName: "getAtomCost",
    });

    const tx = await params.walletClient.writeContract({
        address: MULTI_VAULT,
        abi: multiVaultAbi,
        functionName: "createAtoms",
        args: [[atomData], [atomCost]],
        value: atomCost,
        chain: intuitionTestnet,
    });
    await params.publicClient.waitForTransactionReceipt({hash: tx});
    return {atomId, uri, created: true, tx};
}

/**
 * Ensure an atom exists for a canonical URI (e.g. a module's `schemaURI`).
 *
 * Unlike `ensureAtomForThing`, no Hasura pin is performed — the URI is
 * already canonical (typically an IPFS CID committed in the module
 * manifest or `ModuleRegistry`'s registration). `atomData` is just
 * `stringToHex(uri)`, and the atomId is `calculateAtomId` of that.
 *
 * Use this for the **tool atom** when declaring `(agent, uses, tool)`
 * triples — pinning a different Thing for the tool would create a
 * different atomId and the triple would reference an atom that does not
 * exist on chain (`MultiVault_TermDoesNotExist`).
 *
 * See ADR 0008 (the schemaURI is the canonical tool URI).
 */
export async function ensureAtomForURI(params: {
    uri: string;
    walletClient: WalletClient<Transport, Chain, Account>;
    publicClient: PublicClient;
}): Promise<{atomId: Hex; created: boolean; tx?: Hex}> {
    const atomData = stringToHex(params.uri);
    const atomId = await params.publicClient.readContract({
        address: MULTI_VAULT,
        abi: multiVaultAbi,
        functionName: "calculateAtomId",
        args: [atomData],
    });
    const exists = await params.publicClient.readContract({
        address: MULTI_VAULT,
        abi: multiVaultAbi,
        functionName: "isTermCreated",
        args: [atomId],
    });
    if (exists) return {atomId, created: false};

    const atomCost = await params.publicClient.readContract({
        address: MULTI_VAULT,
        abi: multiVaultAbi,
        functionName: "getAtomCost",
    });
    const tx = await params.walletClient.writeContract({
        address: MULTI_VAULT,
        abi: multiVaultAbi,
        functionName: "createAtoms",
        args: [[atomData], [atomCost]],
        value: atomCost,
        chain: intuitionTestnet,
    });
    await params.publicClient.waitForTransactionReceipt({hash: tx});
    return {atomId, created: true, tx};
}

/**
 * Declare that an agent uses a tool — **idempotent**.
 *
 * Creates the triple `(agentAtomId, usesAtomId, toolAtomId)` on
 * Intuition's graph if it does not yet exist. The triple's bytes32 id is
 * deterministic via `MultiVault.calculateTripleId(s, p, o)`; if the term
 * is already created, this helper returns `{tripleId, created: false}`
 * without sending a transaction. Otherwise it pays `getTripleCost()` and
 * writes `createTriples`.
 *
 * The predicate is `INTUITION_USES_TERM_ID` (`0x5c0bde1c…`) — chosen on
 * **meaning**, not on publication or volume. See ADR 0030.
 *
 * ARP previously minted its own `uses` atom here. Atom ids are
 * content-deterministic over the pinned URI, so that produced a node invisible
 * to this repo's own connector, which filters on `CAPABILITY_PREDICATE_IDS`.
 * Nothing is pinned now, which is why this function needs no `PinAuth`: a
 * predicate is not ours to create.
 *
 * The published `use` atom (`0x9ddda4ac…`, Appendix B) is the wrong node
 * despite being the published one. Measured 2026-10-16 over every edge on
 * each:
 *
 * | predicate | objects that are a protocol |
 * |---|---|
 * | `use` `0x9ddda4ac` | mainnet 153/158, testnet 166/166 |
 * | `uses` `0x5c0bde1c` | mainnet 0/185, testnet 0/143 |
 *
 * `use` means "supports this protocol" — its objects are A2A, MCP and OASF,
 * and Appendix B's object table for it is five standards, enumerated and
 * closed. `uses` means "this entity uses this tool": Intuition, Base, Claude,
 * GitHub, Obsidian, Cursor. Writing `(agent, use, Slither)` would contradict
 * the published canon and, because `bucketFor` files relation `uses` under
 * `capabilities.protocols`, would render a tool as a protocol.
 *
 * `uses` is not in Appendix B, so a third party following the guide will not
 * filter on it. That is the cost, and it is accepted: wrong data is not fixed
 * by discoverability. ADR 0030 records the proposal to have it canonised.
 */
export async function declareUsesTriple(params: {
    agentAtomId: Hex;
    toolAtomId: Hex;
    walletClient: WalletClient<Transport, Chain, Account>;
    publicClient: PublicClient;
}): Promise<{tripleId: Hex; created: boolean; tx?: Hex}> {
    const usesAtomId = INTUITION_USES_TERM_ID as Hex;

    // Preflight the predicate. `ensureAtomForThing` guards its atom this way and
    // this path guarded only the triple, so a chain missing the predicate meant
    // `createTriples` reverting after the user had already approved and paid gas.
    const predicateExists = await params.publicClient.readContract({
        address: MULTI_VAULT,
        abi: multiVaultAbi,
        functionName: "isTermCreated",
        args: [usesAtomId],
    });
    if (!predicateExists) throw new PredicateNotOnChainError(usesAtomId);

    const tripleId = await params.publicClient.readContract({
        address: MULTI_VAULT,
        abi: multiVaultAbi,
        functionName: "calculateTripleId",
        args: [params.agentAtomId, usesAtomId, params.toolAtomId],
    });
    const exists = await params.publicClient.readContract({
        address: MULTI_VAULT,
        abi: multiVaultAbi,
        functionName: "isTermCreated",
        args: [tripleId],
    });
    if (exists) return {tripleId, created: false};

    const tripleCost = await params.publicClient.readContract({
        address: MULTI_VAULT,
        abi: multiVaultAbi,
        functionName: "getTripleCost",
    });

    const tx = await params.walletClient.writeContract({
        address: MULTI_VAULT,
        abi: multiVaultAbi,
        functionName: "createTriples",
        args: [[params.agentAtomId], [usesAtomId], [params.toolAtomId], [tripleCost]],
        value: tripleCost,
        chain: intuitionTestnet,
    });
    await params.publicClient.waitForTransactionReceipt({hash: tx});
    return {tripleId, created: true, tx};
}
