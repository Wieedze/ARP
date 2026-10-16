import {
    stringToHex,
    type Account,
    type Chain,
    type Hex,
    type PublicClient,
    type Transport,
    type WalletClient,
} from "viem";

import {INTUITION_USE_TERM_ID} from "@arp-protocol/erc8004";

import {multiVaultAbi} from "../lib/abi/multi-vault";
import {intuitionTestnet} from "../lib/chains";
import {deployments} from "../lib/deployments";

import {pinThing, type PinAuth} from "./intuition-pin";

const MULTI_VAULT = deployments.intuition.multiVault;

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
 * The predicate is `INTUITION_USE_TERM_ID` — the `use` atom published in
 * Appendix B of the partner guide, verified present on **both** mainnet 1155
 * and testnet 13579 under the same id on 2026-10-16. Nothing is pinned for it,
 * which is why this function needs no `PinAuth`: a predicate is not ours to
 * create.
 *
 * ARP previously minted its own `use` atom here. Because atom ids are
 * content-deterministic over the pinned URI, that produced a *fifth* node
 * meaning "use" — invisible to this repo's own connector, which filters on
 * `CAPABILITY_PREDICATE_IDS`, and invisible to everyone else. Every triple and
 * every stake written that way is attached to a node nobody queries.
 *
 * Measured 2026-10-16, atoms labelled `use`/`uses` by edge count:
 * mainnet 185 / **158 (published)** / 36 / 1, testnet **166 (published)** /
 * 152 / 143 / 21 / 0. The published one does not lead on mainnet, and that is
 * deliberately not the tiebreaker — ADR 0015 makes publication the rule, and
 * twenty-seven edges is noise. `docs/07`: "do not mint your own copies — a
 * differently-pinned duplicate is a different node and fragments the staking
 * surface."
 */
export async function declareUsesTriple(params: {
    agentAtomId: Hex;
    toolAtomId: Hex;
    walletClient: WalletClient<Transport, Chain, Account>;
    publicClient: PublicClient;
}): Promise<{tripleId: Hex; created: boolean; tx?: Hex}> {
    const usesAtomId = INTUITION_USE_TERM_ID as Hex;

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
