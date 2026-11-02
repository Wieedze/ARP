import {createPublicClient, http, type Chain, type PublicClient} from "viem";

import {intuitionTestnet} from "./chains";

const clients = new Map<number, PublicClient>();

/**
 * The one read client per chain id for the life of the page. Every caller shares it, so a page
 * that renders a hundred rows opens one transport per chain rather than one per row.
 */
export function publicClientFor(chain: Chain): PublicClient {
    const cached = clients.get(chain.id);
    if (cached !== undefined) return cached;
    const client = createPublicClient({chain, transport: http()});
    clients.set(chain.id, client);
    return client;
}

/** Intuition Testnet, where ARP's own contracts are. */
export const publicClient = publicClientFor(intuitionTestnet);
