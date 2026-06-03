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
import {intuitionTestnet} from "../lib/chains";
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

/**
 * Common params shared by every redeem helper.
 *
 * `signedDelegation` can be a single signed delegation (direct redeem)
 * or an array ordered `[leaf, ..., root]` representing the validation
 * chain when a sub-delegation is involved. The framework walks the chain
 * top-to-bottom.
 */
type RedeemCommon = {
    signedDelegation: Delegation | Delegation[];
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
 *
 * **Receiver default: the runtime EOA** (`agentWalletClient.account.address`).
 * This makes the *agent* the on-chain position holder — what gets read as
 * "agent X has Y shares on tool T" reflects the agent's reputation
 * directly. MultiVault guards `deposit` with `_isApprovedToDeposit(sender,
 * receiver)`; when the agent redeems, the on-chain `msg.sender` is the
 * Smart Account (because the DelegationManager calls
 * `IDeleGatorCore.executeFromExecutor` on the delegator). For the check
 * to pass, the runtime must have called `MultiVault.approve(SA, DEPOSIT)`
 * once at bootstrap — see `ensureAgentDelegatedToSA` (typically run from
 * `scripts/agent-loop.ts` startup).
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
 * `ApprovalTypes` packed flag values per MultiVault.
 * NONE = 0, DEPOSIT = 1, REDEMPTION = 2, BOTH = 3.
 */
export const APPROVAL_DEPOSIT = 1;
export const APPROVAL_REDEMPTION = 2;
export const APPROVAL_BOTH = 3;

const approvalAbi = [
    {
        type: "function",
        stateMutability: "nonpayable",
        name: "approve",
        inputs: [
            {name: "sender", type: "address"},
            {name: "approvalType", type: "uint8"},
        ],
        outputs: [],
    },
] as const;

/**
 * Grant the **Smart Account** `DEPOSIT` approval to act on the **runtime
 * EOA**'s behalf. Called by the runtime so that subsequent
 * `MultiVault.deposit(receiver=runtime, ...)` calls (via redeem) do not
 * revert with `MultiVault_SenderNotApproved` — the on-chain msg.sender
 * is the SA (executeFromExecutor) and the check is
 * `sender == receiver || approvals[receiver][sender] & DEPOSIT`.
 *
 * **Operator workflow** — call this **once** via `scripts/agent-approve-sa.ts`
 * after funding the runtime EOA with gas. The approval persists on chain
 * until explicitly revoked. The agent-loop assumes it is already granted
 * and surfaces a clear pointer if a stake reverts with the matching
 * selector.
 *
 * MultiVault's `approvals` mapping is `internal` with no public getter,
 * so this helper does not attempt an existence check — that is the
 * operator's discipline by running the setup script once.
 *
 * @returns The transaction hash.
 */
export async function grantSmartAccountDepositApproval(params: {
    agentWalletClient: WalletClient<Transport, Chain, Account>;
    smartAccountAddress: Address;
    publicClient: PublicClient;
}): Promise<Hex> {
    const tx = await params.agentWalletClient.writeContract({
        address: MULTI_VAULT,
        abi: approvalAbi,
        functionName: "approve",
        args: [params.smartAccountAddress, APPROVAL_DEPOSIT],
        chain: intuitionTestnet,
    });
    await params.publicClient.waitForTransactionReceipt({hash: tx});
    return tx;
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
 * `(subject, predicate, object)` triple — **idempotent**.
 *
 * The triple's bytes32 id is deterministic via
 * `MultiVault.calculateTripleId(s, p, o)`. If the resulting term already
 * exists on chain, this helper returns `{tripleId, created: false}` and
 * sends no transaction. Otherwise it pays `getTripleCost()` and redeems
 * `createTriples`.
 *
 * The caller is responsible for having ensured all three referenced
 * atoms already exist (otherwise `MultiVault.createTriples` reverts with
 * `MultiVault_TermDoesNotExist`).
 */
export async function redeemDeclareTriple(
    params: RedeemCommon & {
        subjectAtomId: Hex;
        predicateAtomId: Hex;
        objectAtomId: Hex;
        publicClient: PublicClient;
    },
): Promise<{tripleId: Hex; created: boolean; tx?: Hex}> {
    const tripleId = await params.publicClient.readContract({
        address: MULTI_VAULT,
        abi: multiVaultAbi,
        functionName: "calculateTripleId",
        args: [params.subjectAtomId, params.predicateAtomId, params.objectAtomId],
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
    const tx = await redeemArpDelegation({
        signedDelegation: params.signedDelegation,
        execution,
        agentWalletClient: params.agentWalletClient,
    });
    await params.publicClient.waitForTransactionReceipt({hash: tx});
    return {tripleId, created: true, tx};
}

// Re-export the identity registry address so the agent loop can sanity-check
// at startup that the runtime keypair matches the on-chain runtime wallet.
export const IDENTITY_REGISTRY_ADDRESS = IDENTITY_REGISTRY;
export const identityRegistryAbiFragment = identityRegistryAbi;
