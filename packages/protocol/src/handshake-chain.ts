import {createPublicClient, getAddress, http, type PublicClient} from "viem";

import type {HandshakeChain} from "./handshake.js";
import {identityRegistryAbi} from "./sources/erc8004-registry/abi.js";

/**
 * The chain reads the handshake needs, backed by viem: `ownerOf` on the registry and
 * `verifyMessage`, which falls back to ERC-1271 and ERC-6492 when the owner is a contract account.
 *
 * Keyed by chain id, with no default (`portability.md`: no chain constant at module scope). A
 * registry on a chain the caller gave no RPC for is unreadable, said so, never guessed at.
 */
export function handshakeChain(config: {
    rpcUrls?: Readonly<Record<number, string>>;
    /** Pre-built clients, by chain id. Tests inject one so no network is touched. */
    clients?: Readonly<Record<number, PublicClient>>;
}): HandshakeChain {
    const built = new Map<number, PublicClient>();
    const clientFor = (chainId: number): PublicClient => {
        const given = config.clients?.[chainId];
        if (given !== undefined) return given;
        const cached = built.get(chainId);
        if (cached !== undefined) return cached;
        const url = config.rpcUrls?.[chainId];
        if (url === undefined) throw new Error(`no RPC configured for chain ${chainId}`);
        // No `chain` given, so viem's generic narrows nothing; the base type is what is held, the
        // same device `multiVaultReads` uses.
        const client = createPublicClient({transport: http(url)}) as PublicClient;
        built.set(chainId, client);
        return client;
    };

    return {
        async ownerOf({chainId, registry, agentId}) {
            const owner = await clientFor(chainId).readContract({
                address: registry,
                abi: identityRegistryAbi,
                functionName: "ownerOf",
                args: [agentId],
            });
            return getAddress(owner);
        },
        async verifyMessage({chainId, address, message, signature}) {
            return clientFor(chainId).verifyMessage({address, message, signature});
        },
    };
}
