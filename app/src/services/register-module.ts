import {
    decodeEventLog,
    parseAbiItem,
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

const MODULE_REGISTRY = deployments.arp.moduleRegistry;
const MULTI_VAULT = deployments.intuition.multiVault;

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

const REGISTERED_EVENT = parseAbiItem(
    "event ModuleRegistered(uint256 indexed id, address indexed creator, string name, string domain, string schemaURI)",
);

export type RegisterModuleArgs = {
    name: string;
    domain: string;
    schemaURI: string;
    description: string;
};

/**
 * Two-step "register a tool" flow from a human EOA's perspective:
 *
 *   1. `ModuleRegistry.registerModule(...)` — records the tool in ARP's
 *      catalogue. Cheap, only gas. Returns the new module id (decoded
 *      from the `ModuleRegistered` event in the receipt).
 *   2. `MultiVault.createAtoms([schemaURIBytes], [atomCost + initialStake])`
 *      — materialises the tool's atom on Intuition AND opens the
 *      creator's initial position on the atom (the remainder of
 *      `assets[i]` after the atomCost is the initial vault deposit).
 *      `value` must equal the sum of `assets[]`.
 *
 * The initial stake is the "skin in the game" minimum that turns a fresh
 * module into a non-zero TVL atom — keeps the marketplace honest by
 * making spam costlier than zero gas.
 *
 * Two wallet popups (one per tx) — explicit and inspectable.
 */
export async function registerModule(params: {
    args: RegisterModuleArgs;
    initialStakeWei: bigint;
    walletClient: WalletClient<Transport, Chain, Account>;
    publicClient: PublicClient;
}): Promise<{
    moduleId: bigint;
    registerTx: Hex;
    atomTx: Hex;
    atomId: Hex;
}> {
    const {args, initialStakeWei, walletClient, publicClient} = params;

    // 1. Register the module in ARP's registry.
    const registerTx = await walletClient.writeContract({
        address: MODULE_REGISTRY,
        abi: moduleRegistryAbi,
        functionName: "registerModule",
        args: [args.name, args.domain, args.schemaURI, args.description],
        chain: intuitionTestnet,
    });
    const receipt = await publicClient.waitForTransactionReceipt({
        hash: registerTx,
    });

    // Decode the moduleId from the ModuleRegistered event.
    let moduleId: bigint | null = null;
    for (const log of receipt.logs) {
        if (log.address.toLowerCase() !== MODULE_REGISTRY.toLowerCase()) continue;
        try {
            const decoded = decodeEventLog({
                abi: [REGISTERED_EVENT],
                data: log.data,
                topics: log.topics,
            });
            if (decoded.eventName === "ModuleRegistered") {
                moduleId = decoded.args.id;
                break;
            }
        } catch {
            /* not our event — keep scanning */
        }
    }
    if (moduleId === null) {
        throw new Error(
            "registerModule succeeded but no ModuleRegistered event found in the receipt — registry ABI may have drifted",
        );
    }

    // 2. Create the tool atom + initial stake.
    const atomData = stringToHex(args.schemaURI);
    const atomCost = await publicClient.readContract({
        address: MULTI_VAULT,
        abi: multiVaultAbi,
        functionName: "getAtomCost",
    });
    const atomId = await publicClient.readContract({
        address: MULTI_VAULT,
        abi: multiVaultAbi,
        functionName: "calculateAtomId",
        args: [atomData],
    });
    const assets = atomCost + initialStakeWei;
    const atomTx = await walletClient.writeContract({
        address: MULTI_VAULT,
        abi: multiVaultAbi,
        functionName: "createAtoms",
        args: [[atomData], [assets]],
        value: assets,
        chain: intuitionTestnet,
    });
    await publicClient.waitForTransactionReceipt({hash: atomTx});

    return {moduleId, registerTx, atomTx, atomId};
}
