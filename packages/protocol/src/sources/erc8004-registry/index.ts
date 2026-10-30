import {createPublicClient, http, type Chain, type PublicClient, type Transport} from "viem";
import {base, bsc, mainnet} from "viem/chains";

import {toCaip19} from "../../caip.js";
import {provenanceFor} from "../../provenance.js";
import type {AgentIdentity, Capabilities, ProviderClaim, ResolvedAgentRef} from "../../types.js";
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
/**
 * The chains the **canonical** ERC-8004 registry is deployed on.
 *
 * Not a list of chains this source can read — `config.chains` extends it, and has to, because a
 * registry is deployable anywhere. ARP's own is on Intuition testnet 13579, which is not and
 * should not be in here: this constant describes ERC-8004's deployment, not ARP's.
 *
 * Leaving it un-extendable was a real defect. An agent that registered on ARP's testnet registry
 * had its owner and its registration document on chain and unreadable by the app — `clientFor`
 * returned `null` for 13579, the source answered `null` for every call, and the panel rendered
 * "owner not read / none published" beside a token whose `tokenURI` was 821 bytes long. Found
 * 2026-10-28 the first time an agent registered itself rather than being minted by the deployer.
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
    /**
     * Chains to read beyond {@link SUPPORTED_CHAINS}, by id. Merged over it, so a caller can both
     * add a chain and override one.
     *
     * This is the seam `rules/portability.md` asks for — the package takes its chains as config
     * instead of naming them — and the one place in this repo that names Intuition is
     * `src/arp/chains.ts`, which is where a caller gets these from.
     */
    chains?: Record<number, Chain>;
    /** Pre-built transports, by chain id. Tests inject one here so no network is touched. */
    transports?: Record<number, Transport>;
};

const provenance = provenanceFor(ERC8004_REGISTRY_SOURCE_ID);

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
/**
 * base64 → text, in a browser and in Node alike.
 *
 * `Buffer` is Node-only. Using it here parsed correctly under `bun test` and returned nothing in
 * the browser, where the `ReferenceError` was swallowed by the catch below — so the unit test was
 * green while the page showed the indexer's stand-in. This package is imported by both, so
 * neither runtime's globals can be assumed.
 *
 * `atob` gives latin-1, so the bytes go back through `TextDecoder` to survive UTF-8: one real
 * agent's name is "\u{1F99E} Clawnch \u{1F99E}" and `atob` alone renders it as mojibake.
 */
function decodeBase64(payload: string): string {
    const binary =
        typeof atob === "function"
            ? atob(payload)
            : // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Node-only global, absent in a browser; guarded by the branch above.
              (globalThis as any).Buffer.from(payload, "base64").toString("binary");
    const bytes = Uint8Array.from(binary as string, (char: string) => char.charCodeAt(0));
    return new TextDecoder().decode(bytes);
}

/**
 * `name`, `description` and `image` out of an **inline** registration file.
 *
 * Inline only, and that is the whole scope: a `data:` URI is already in hand after `tokenURI`, so
 * reading it costs no request and cannot fail slowly. A hosted `https://` document is not fetched
 * here — following resolver URLs is `getAgentProfile`'s job and it holds the timeout and the
 * freshness check that a fetch needs.
 *
 * Returns nulls for anything it cannot read, including a malformed document: a registration file
 * is written by the agent and is therefore untrusted input, and a throw here would take the owner
 * down with it when the owner is the one answer this source exists to give.
 *
 * Until 2026-10-28 this source returned `name: null` unconditionally, with its provenance saying
 * "metadata is not read from the registration file in this phase". The cost showed up the first
 * time an agent registered itself: testnet token 6 published an 821-byte document naming it
 * "ARP Loop Agent", and every reader saw `Agent 13579:6`, the indexer's stand-in.
 */
function inlineMetadata(registrationFile: string | null): {
    name: string | null;
    description: string | null;
    image: string | null;
} {
    const empty = {name: null, description: null, image: null};
    if (registrationFile === null || !registrationFile.startsWith("data:")) return empty;
    const comma = registrationFile.indexOf(",");
    if (comma === -1) return empty;
    const payload = registrationFile.slice(comma + 1);
    try {
        const text = registrationFile.slice(0, comma).includes(";base64")
            ? decodeBase64(payload)
            : decodeURIComponent(payload);
        const parsed: unknown = JSON.parse(text);
        if (typeof parsed !== "object" || parsed === null) return empty;
        const read = (key: string): string | null => {
            const value = (parsed as Record<string, unknown>)[key];
            return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
        };
        return {name: read("name"), description: read("description"), image: read("image")};
    } catch {
        return empty;
    }
}

export function erc8004RegistrySource(config: Erc8004RegistrySourceConfig = {}): TrustSource {
    const clients = new Map<number, PublicClient>();

    function clientFor(chainId: number): PublicClient | null {
        const chain = config.chains?.[chainId] ?? SUPPORTED_CHAINS[chainId];
        if (chain === undefined) return null;
        const existing = clients.get(chainId);
        if (existing !== undefined) return existing;

        const transport =
            config.transports?.[chainId] ??
            http(
                config.rpcUrls?.[chainId] ??
                    DEFAULT_RPC_URLS[chainId] ??
                    chain.rpcUrls.default.http[0],
            );
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
                    ...inlineMetadata(registrationFile),
                    url: null,
                    // Never a stand-in: whatever this source reports came off the chain, and a
                    // document that names nothing reports null rather than a synthesised name.
                    isFallback: false,
                },
                provenance: provenance(
                    "claim",
                    `eth_call ownerOf/tokenURI on ${ref.registry} @ chain ${ref.chainId}`,
                    "name, description and image are read from an inline data: registration file; a hosted one is left to the profile's resolver fetch",
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
                tools: [],
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
