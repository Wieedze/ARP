import {DEFAULT_TIMEOUT_MS, defaultFetch, type FetchLike} from "./http.js";
import {erc8004RegistrySource} from "./sources/erc8004-registry/index.js";
import {intuitionSource} from "./sources/intuition/index.js";
import type {TrustSource} from "./sources/source.js";

export type Erc8004ClientConfig = {
    /**
     * Sources, consulted in this order. Order is meaningful: the first source to
     * answer a field owns it, and any later source that answers differently is
     * recorded as a conflict rather than dropped.
     *
     * Omit for the default pair — Intuition first (it is the only one with
     * markets), the raw registry second (it is the only one that reaches BSC and
     * Ethereum). Pass `[erc8004RegistrySource()]` for a client with no Intuition
     * in it at all.
     */
    sources?: TrustSource[];
    fetch?: FetchLike;
    timeoutMs?: number;
};

export type Erc8004Client = {
    readonly sources: readonly TrustSource[];
    readonly fetch: FetchLike;
    readonly timeoutMs: number;
};

/**
 * Build a client over an ordered list of sources.
 *
 *     const client = createErc8004Client();
 *     const profile = await getAgentProfile(client, {chainId: 8453, tokenId: "2340"});
 *
 * The client holds no credentials and no signer. Every read in this package is
 * unauthenticated and nothing here can send a transaction.
 */
export function createErc8004Client(config: Erc8004ClientConfig = {}): Erc8004Client {
    const fetchImpl = config.fetch ?? defaultFetch();
    const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const sources = config.sources ?? [
        intuitionSource({fetch: fetchImpl, timeoutMs}),
        erc8004RegistrySource(),
    ];

    return {sources, fetch: fetchImpl, timeoutMs};
}
