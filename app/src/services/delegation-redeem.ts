import {
    createExecution,
    type Delegation,
    type ExecutionStruct,
} from "@metamask/smart-accounts-kit";
import {
    encodeFunctionData,
    stringToHex,
    type Account,
    type Address,
    type Chain,
    type Hex,
    type PublicClient,
    type Transport,
    type WalletClient,
} from "viem";

import {identityRegistryAbi} from "../lib/abi/identity-registry";
import {multiVaultAbi} from "../lib/abi/multi-vault";
import {deployments} from "../lib/deployments";

import {redeemArpDelegation} from "./agent-action";
import {pinThing} from "./intuition-pin";

/**
 * Agent-side helpers that wrap `redeemArpDelegation` for each concrete ARP
 * action class. Every function here takes a `signedDelegation` whose
 * `delegate` is `agentWalletClient.account.address` — the runtime EOA
 * acting under the operator's bounded authority.
 *
 * The delegations come in two flavors (built in `lib/caveat-builder.ts`):
 *
 *   - **Publish delegation** (DomainScope + TrustStakeCap)  — gates
 *     `ModuleRegistry.registerModule` to operator-approved domains.
 *   - **Compose delegation** (AllowedTargets + AllowedMethods +
 *     TrustStakeCap) — gates `MultiVault.{deposit, createAtoms,
 *     createTriples}` to a per-period spend cap.
 *
 * The functions surface the same return shape as their direct-EOA
 * counterparts in `agent-identity` / `atom-stake` / `intuition-graph` so
 * the headless runtime can swap one for the other without reshaping its
 * data flow.
 */

const MULTI_VAULT = deployments.intuition.multiVault;
const MODULE_REGISTRY = deployments.arp.moduleRegistry;
const IDENTITY_REGISTRY = deployments.arp.identityRegistry;

const moduleRegistryAbi = [
    {
        type: "function",
        stateMutability: "nonpayable",
        name: "registerModule",
        inputs: [
            {name: "name", type: "string"},
            {name: "domain", type: "string"},
            {name: "schemaURI", type: "string"},
            {name: "description", type: "string"},
        ],
        outputs: [{name: "id", type: "uint256"}],
    },
] as const;

/** Common params shared by every redeem helper. */
type RedeemCommon = {
    signedDelegation: Delegation;
    agentWalletClient: WalletClient<Transport, Chain, Account>;
};

/**
 * Redeem the **publish** delegation to register a new module on the
 * `ModuleRegistry`. The `DomainScopeEnforcer` rejects any `domain` outside
 * the delegation's allow-list — capture the error to surface "out of
 * scope" cleanly in the UI / log.
 */
export async function redeemRegisterModule(
    params: RedeemCommon & {
        name: string;
        domain: string;
        schemaURI: string;
        description: string;
    },
): Promise<Hex> {
    const callData = encodeFunctionData({
        abi: moduleRegistryAbi,
        functionName: "registerModule",
        args: [params.name, params.domain, params.schemaURI, params.description],
    });
    const execution: ExecutionStruct = createExecution({
        target: MODULE_REGISTRY,
        value: 0n,
        callData,
    });
    return redeemArpDelegation({
        signedDelegation: params.signedDelegation,
        execution,
        agentWalletClient: params.agentWalletClient,
    });
}

/**
 * Redeem the **compose** delegation to deposit native tTRUST onto an
 * atom's vault. The `TrustStakeCapEnforcer` accrues against the
 * delegation's per-period cap; the `AllowedTargets`/`AllowedMethods`
 * enforcers verify the target is MultiVault and the selector is
 * `deposit`.
 */
export async function redeemStakeOnAtom(
    params: RedeemCommon & {
        atomId: Hex;
        amount: bigint;
        publicClient: PublicClient;
        receiver?: Address;
        minShares?: bigint;
    },
): Promise<Hex> {
    const curveConfig = await params.publicClient.readContract({
        address: MULTI_VAULT,
        abi: multiVaultAbi,
        functionName: "getBondingCurveConfig",
    });

    const callData = encodeFunctionData({
        abi: multiVaultAbi,
        functionName: "deposit",
        args: [
            params.receiver ?? params.agentWalletClient.account.address,
            params.atomId,
            curveConfig.defaultCurveId,
            params.minShares ?? 0n,
        ],
    });
    const execution: ExecutionStruct = createExecution({
        target: MULTI_VAULT,
        value: params.amount,
        callData,
    });

    return redeemArpDelegation({
        signedDelegation: params.signedDelegation,
        execution,
        agentWalletClient: params.agentWalletClient,
    });
}

/**
 * Redeem the **compose** delegation to create a single atom. Idempotent
 * at the application level: the caller decides whether to ensure or skip;
 * this helper unconditionally calls `createAtoms` and reverts upstream if
 * the atom already exists. Use `redeemEnsureAtomForThing` for the
 * pin-then-check-then-create flow.
 */
export async function redeemCreateAtom(
    params: RedeemCommon & {
        atomData: Hex;
        atomCost: bigint;
    },
): Promise<Hex> {
    const callData = encodeFunctionData({
        abi: multiVaultAbi,
        functionName: "createAtoms",
        args: [[params.atomData], [params.atomCost]],
    });
    const execution: ExecutionStruct = createExecution({
        target: MULTI_VAULT,
        value: params.atomCost,
        callData,
    });
    return redeemArpDelegation({
        signedDelegation: params.signedDelegation,
        execution,
        agentWalletClient: params.agentWalletClient,
    });
}

/**
 * Ensure the atom for a canonical URI exists on chain, creating it via
 * the compose delegation if needed. Mirrors `ensureAtomForURI` from
 * `intuition-graph.ts` but redeems through the DelegationManager so the
 * Smart Account (delegator) becomes the atom's creator on chain.
 *
 * Use this for tool atoms (where the canonical URI is the module's
 * `schemaURI`). Use `redeemEnsureAtomForThing` for the agent/predicate
 * atoms (where the Thing is pinned freshly and its URI is the result).
 */
export async function redeemEnsureAtomForURI(
    params: RedeemCommon & {
        uri: string;
        publicClient: PublicClient;
    },
): Promise<{atomId: Hex; created: boolean; tx?: Hex}> {
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
    const tx = await redeemCreateAtom({
        signedDelegation: params.signedDelegation,
        agentWalletClient: params.agentWalletClient,
        atomData,
        atomCost,
    });
    await params.publicClient.waitForTransactionReceipt({hash: tx});
    return {atomId, created: true, tx};
}

/**
 * Pin a Thing, check if the resulting atom exists on chain, and create it
 * under the compose delegation if not. Mirrors `ensureAtomForThing` from
 * `intuition-graph.ts` but routes the create through `redeemDelegation`
 * instead of direct EOA write.
 */
export async function redeemEnsureAtomForThing(
    params: RedeemCommon & {
        thing: {name: string; description: string; image?: string; url?: string};
        publicClient: PublicClient;
    },
): Promise<{atomId: Hex; uri: string; created: boolean; tx?: Hex}> {
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

    const tx = await redeemCreateAtom({
        signedDelegation: params.signedDelegation,
        agentWalletClient: params.agentWalletClient,
        atomData,
        atomCost,
    });
    await params.publicClient.waitForTransactionReceipt({hash: tx});
    return {atomId, uri, created: true, tx};
}

/**
 * Redeem the **compose** delegation to create a single
 * `(subject, predicate, object)` triple. The caller is responsible for
 * having ensured all three referenced atoms already exist (otherwise
 * `MultiVault.createTriples` reverts).
 */
export async function redeemDeclareTriple(
    params: RedeemCommon & {
        subjectAtomId: Hex;
        predicateAtomId: Hex;
        objectAtomId: Hex;
        publicClient: PublicClient;
    },
): Promise<Hex> {
    const tripleCost = await params.publicClient.readContract({
        address: MULTI_VAULT,
        abi: multiVaultAbi,
        functionName: "getTripleCost",
    });
    const callData = encodeFunctionData({
        abi: multiVaultAbi,
        functionName: "createTriples",
        args: [
            [params.subjectAtomId],
            [params.predicateAtomId],
            [params.objectAtomId],
            [tripleCost],
        ],
    });
    const execution: ExecutionStruct = createExecution({
        target: MULTI_VAULT,
        value: tripleCost,
        callData,
    });
    return redeemArpDelegation({
        signedDelegation: params.signedDelegation,
        execution,
        agentWalletClient: params.agentWalletClient,
    });
}

// Re-export the identity registry address so the agent loop can sanity-check
// at startup that the runtime keypair matches the on-chain runtime wallet.
export const IDENTITY_REGISTRY_ADDRESS = IDENTITY_REGISTRY;
export const identityRegistryAbiFragment = identityRegistryAbi;
