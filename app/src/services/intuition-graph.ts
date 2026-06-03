import {
    stringToHex,
    type Account,
    type Chain,
    type Hex,
    type PublicClient,
    type Transport,
    type WalletClient,
} from "viem";

import {multiVaultAbi} from "../lib/abi/multi-vault";
import {intuitionTestnet} from "../lib/chains";
import {deployments} from "../lib/deployments";

import {pinThing} from "./intuition-pin";

const MULTI_VAULT = deployments.intuition.multiVault;

/**
 * ARP-specific helpers for the Intuition knowledge graph.
 *
 * The two-layer reputation model (ADR 0010) materializes here:
 *   - `ensureAtomForThing` — pin a Thing, compute its atom ID, return
 *     a created OR existing atom (idempotent).
 *   - `declareUsesTriple` — connect an agent atom to a tool atom via
 *     a "uses" predicate atom. Materializes the "immutable layer" —
 *     the agent's claim of composition gets a permanent record in the
 *     graph.
 *
 * Both operations defer to lower-level Intuition primitives documented
 * in `.claude/skills/intuition/operations/`.
 */

/**
 * Cache the "uses" predicate atom ID at the module level so the UI
 * doesn't re-pin + lookup on every triple creation. The first call within
 * a session pays the lookup; subsequent calls reuse the cached value.
 */
let cachedUsesAtomId: Hex | null = null;

/**
 * Ensure a Thing-backed atom exists on Intuition. Pin first, then check
 * `isTermCreated`. If it exists, return the ID. Otherwise create it via
 * `MultiVault.createAtoms` and wait for confirmation.
 *
 * Returns `{ atomId, uri, created }` — `created` is `false` if the atom
 * was already on chain.
 */
export async function ensureAtomForThing(params: {
    thing: {name: string; description: string; image?: string; url?: string};
    walletClient: WalletClient<Transport, Chain, Account>;
    publicClient: PublicClient;
}): Promise<{atomId: Hex; uri: string; created: boolean; tx?: Hex}> {
    const uri = await pinThing({
        name: params.thing.name,
        description: params.thing.description,
        image: params.thing.image ?? "",
        url: params.thing.url ?? "",
    });

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
 * Return the atom ID for the canonical ARP "uses" predicate. Lazily
 * pinned + cached at module scope.
 */
export async function getOrCreateUsesPredicateAtomId(params: {
    walletClient: WalletClient<Transport, Chain, Account>;
    publicClient: PublicClient;
}): Promise<Hex> {
    if (cachedUsesAtomId) return cachedUsesAtomId;
    const result = await ensureAtomForThing({
        thing: {
            name: "uses",
            description:
                "ARP predicate — links an agent atom to a tool atom that the agent " +
                "composes with. The triple (agent, uses, tool) is the immutable layer " +
                "of ARP's two-layer reputation model.",
        },
        walletClient: params.walletClient,
        publicClient: params.publicClient,
    });
    cachedUsesAtomId = result.atomId;
    return result.atomId;
}

/**
 * Declare that an agent uses a tool. Creates the triple
 * `(agentAtomId, usesAtomId, toolAtomId)` on Intuition's graph. Pays
 * `getTripleCost()`. Returns the deterministic triple ID.
 *
 * The "uses" predicate atom is auto-ensured via the cached helper above.
 */
export async function declareUsesTriple(params: {
    agentAtomId: Hex;
    toolAtomId: Hex;
    walletClient: WalletClient<Transport, Chain, Account>;
    publicClient: PublicClient;
}): Promise<{tx: Hex}> {
    const usesAtomId = await getOrCreateUsesPredicateAtomId({
        walletClient: params.walletClient,
        publicClient: params.publicClient,
    });

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
    return {tx};
}
