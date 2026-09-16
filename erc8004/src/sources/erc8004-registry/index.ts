import {createPublicClient, http, type Chain, type PublicClient, type Transport} from "viem";
import {base, bsc, mainnet} from "viem/chains";

import {toCaip19} from "../../caip.js";
import type {
    AgentIdentity,
    Capabilities,
    Provenance,
    ProviderClaim,
    ResolvedAgentRef,
} from "../../types.js";
import type {TrustSource} from "../source.js";
import {identityRegistryAbi} from "./abi.js";

export const ERC8004_REGISTRY_SOURCE_ID = "erc8004-registry";

/**
 * The chains whose ERC-8004 Identity Registry this source can read.
 *
 * Roughly 73,000 agents live in the BSC and Ethereum registries and are absent
 * from the Intuition graph, which mirrors Base only. They are readable here one
 * at a time, on request — bulk mirroring is a partnership question, not a
 * feature of this package.
 */
export const SUPPORTED_CHAINS: Readonly<Record<number, Chain>> = {
    [base.id]: base,
    [bsc.id]: bsc,
    [mainnet.id]: mainnet,
};

const DEFAULT_RPC_URLS: Readonly<Record<number, string>> = {
    [base.id]: "https://mainnet.base.org",
    [bsc.id]: "https://bsc-dataseed.binance.org",
    [mainnet.id]: "https://ethereum-rpc.publicnode.com",
};

export type Erc8004RegistrySourceConfig = {
    rpcUrls?: Record<number, string>;
    /** Pre-built transports, by chain id. Tests inject one here so no network is touched. */
    transports?: Record<number, Transport>;
};

function provenance(kind: Provenance["kind"], origin: string | null, note?: string): Provenance {
    return note === undefined
        ? {sourceId: ERC8004_REGISTRY_SOURCE_ID, kind, origin}
        : {sourceId: ERC8004_REGISTRY_SOURCE_ID, kind, origin, note};
}

/**
 * The ERC-8004 Identity Registry itself, read directly with viem.
 *
 * This is the source that makes the portability claim testable rather than
 * rhetorical: a client configured with only this source still resolves an agent,
 * because nothing in the read path touches Intuition, a knowledge graph, or
 * TRUST.
 *
 * It answers narrowly and says so. It has no trust claims (the registry stores
 * none) and no capabilities (they live in the registration file, whose parsing
 * is a later phase — the URI is exposed on the identity and nothing more is
 * inferred from it). It implements no `getMarkets`, because a registry has no
 * market.
 */
export function erc8004RegistrySource(config: Erc8004RegistrySourceConfig = {}): TrustSource {
    const clients = new Map<number, PublicClient>();

    function clientFor(chainId: number): PublicClient | null {
        const chain = SUPPORTED_CHAINS[chainId];
        if (chain === undefined) return null;
        const existing = clients.get(chainId);
        if (existing !== undefined) return existing;

        const transport =
            config.transports?.[chainId] ??
            http(config.rpcUrls?.[chainId] ?? DEFAULT_RPC_URLS[chainId]);
        // viem's PublicClient generics narrow to the chain passed in; the source
        // holds them behind one map, so the base type is what is stored.
        const client = createPublicClient({chain, transport}) as PublicClient;
        clients.set(chainId, client);
        return client;
    }

    return {
        id: ERC8004_REGISTRY_SOURCE_ID,

        async resolveAgent(ref: ResolvedAgentRef): Promise<AgentIdentity | null> {
            const client = clientFor(ref.chainId);
            if (client === null) return null;

            const contract = {
                address: ref.registry,
                abi: identityRegistryAbi,
                args: [BigInt(ref.tokenId)],
            } as const;

            // An unminted token id reverts on `ownerOf`. That is "this agent does
            // not exist", which is an answer, not a failure.
            const owner = await client
                .readContract({...contract, functionName: "ownerOf"})
                .catch(() => null);
            if (owner === null) return null;

            const registrationFile = await client
                .readContract({...contract, functionName: "tokenURI"})
                .catch(() => null);

            return {
                chainId: ref.chainId,
                tokenId: ref.tokenId,
                registry: ref.registry,
                caip19: toCaip19(ref),
                sourceHandle: `${ref.chainId}:${ref.registry}:${ref.tokenId}`,
                registrationFile,
                owner,
                metadata: {
                    name: null,
                    description: null,
                    image: null,
                    url: null,
                    isFallback: false,
                },
                provenance: provenance(
                    "claim",
                    `eth_call ownerOf/tokenURI on ${ref.registry} @ chain ${ref.chainId}`,
                    "metadata is not read from the registration file in this phase",
                ),
            };
        },

        async getAssessments(): Promise<ProviderClaim[]> {
            return [];
        },

        async getCapabilities(ref: ResolvedAgentRef): Promise<Capabilities> {
            return {
                types: [],
                protocols: [],
                chains: [],
                tags: [],
                categories: [],
                provenance: provenance(
                    "claim",
                    `chain ${ref.chainId}`,
                    "the registry declares no capabilities; the registration file is exposed unparsed on the identity",
                ),
            };
        },
    };
}
