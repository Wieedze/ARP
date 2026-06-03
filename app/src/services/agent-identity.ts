import {
    parseAbiItem,
    type Account,
    type Address,
    type Chain,
    type Hex,
    type PublicClient,
    type Transport,
    type WalletClient,
} from "viem";

import {identityRegistryAbi} from "../lib/abi/identity-registry";
import {deployments} from "../lib/deployments";

const ADDRESS = deployments.arp.identityRegistry;

/**
 * Mint a new ERC-8004 agent NFT for the caller. The `register()` overload
 * with no arguments creates an agent without an off-chain metadata URI;
 * the agentURI can be set later via `setAgentURI` (out of MVP scope).
 *
 * Returns the assigned `agentId` (also emitted as the `Registered` event
 * topic — we parse the receipt to recover it).
 */
export async function registerAgent(params: {
    walletClient: WalletClient<Transport, Chain, Account>;
    publicClient: PublicClient;
}): Promise<{agentId: bigint; tx: Hex}> {
    const tx = await params.walletClient.writeContract({
        address: ADDRESS,
        abi: identityRegistryAbi,
        functionName: "register",
        args: [],
    });
    const receipt = await params.publicClient.waitForTransactionReceipt({hash: tx});

    // Recover the agentId from the Registered event. `to` is indexed; the
    // event signature matches the ABI item we provided.
    const event = parseAbiItem(
        "event Registered(uint256 indexed agentId, string agentURI, address indexed to)",
    );
    const logs = await params.publicClient.getLogs({
        address: ADDRESS,
        event,
        fromBlock: receipt.blockNumber,
        toBlock: receipt.blockNumber,
        args: {to: params.walletClient.account.address},
    });

    const last = logs[logs.length - 1];
    if (!last || last.args.agentId === undefined) {
        throw new Error("registerAgent: Registered event not found in receipt block");
    }
    return {agentId: last.args.agentId, tx};
}

/**
 * Find the latest agentId owned by `owner`. Uses a `Registered` event scan
 * over the full chain history (cheap enough for our MVP — the registry is
 * small). Returns `null` if the address has never registered.
 *
 * If `owner` registered multiple agents, the most recent is returned.
 */
export async function findAgentIdByOwner(params: {
    owner: Address;
    publicClient: PublicClient;
}): Promise<bigint | null> {
    const event = parseAbiItem(
        "event Registered(uint256 indexed agentId, string agentURI, address indexed to)",
    );
    const logs = await params.publicClient.getLogs({
        address: ADDRESS,
        event,
        fromBlock: 0n,
        toBlock: "latest",
        args: {to: params.owner},
    });
    if (logs.length === 0) return null;

    // Pick the most recent; logs are returned in chronological order.
    const last = logs[logs.length - 1];
    return last.args.agentId ?? null;
}
