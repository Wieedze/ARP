/**
 * The app's one agent feed, wired to the browser: a real `EventSource`, and receipts read through
 * the same per-chain clients the rest of the app reads with.
 *
 * **Where it connects.** `VITE_ARP_ACTIVITY_URL` when set. Otherwise, in `vite dev` only, the
 * feed's default address — a demo run from a laptop needs no configuration, and a deployed build
 * never opens a socket to its visitor's localhost unless someone asked it to.
 */
import {
    createPublicClient,
    http,
    TransactionReceiptNotFoundError,
    type Hex,
    type PublicClient,
} from "viem";

import {intuitionMainnet} from "../lib/intuition-mainnet";
import {intuitionTestnet} from "../lib/chains";
import {activityLog} from "./activity-log";
import {AgentFeed, type ReceiptRead} from "./agent-feed";

const configured: string | undefined = import.meta.env.VITE_ARP_ACTIVITY_URL;
export const AGENT_FEED_URL: string | undefined =
    configured !== undefined && configured.length > 0
        ? configured
        : import.meta.env.DEV
          ? "http://127.0.0.1:3003/events"
          : undefined;

const clients = new Map<number, PublicClient>();
function clientFor(chainId: number): PublicClient | null {
    if (chainId !== intuitionTestnet.id && chainId !== intuitionMainnet.id) return null;
    const cached = clients.get(chainId);
    if (cached !== undefined) return cached;
    // Built here rather than taken from `chain-choice`, which is a React module: a service never
    // imports React, not even through a neighbour.
    const client: PublicClient = createPublicClient({
        chain: chainId === intuitionMainnet.id ? intuitionMainnet : intuitionTestnet,
        transport: http(),
    });
    clients.set(chainId, client);
    return client;
}

async function readReceipt(chainId: number, hash: Hex): Promise<ReceiptRead> {
    const client = clientFor(chainId);
    if (client === null) return null;
    try {
        const receipt = await client.getTransactionReceipt({hash});
        return {
            status: receipt.status,
            block: receipt.blockNumber,
            costWei: receipt.gasUsed * receipt.effectiveGasPrice,
        };
    } catch (cause) {
        // Not mined yet, or not on this chain: no confirmation, which is different from a failure.
        if (cause instanceof TransactionReceiptNotFoundError) return null;
        throw cause;
    }
}

export const agentFeed = new AgentFeed(activityLog, {
    url: AGENT_FEED_URL,
    open: (url) => new EventSource(url),
    readReceipt,
});
