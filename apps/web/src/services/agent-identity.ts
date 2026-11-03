import {parseAbiItem, type Address, type PublicClient} from "viem";

import {deployments} from "../lib/deployments";

const ADDRESS = deployments.arp.identityRegistry;

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
