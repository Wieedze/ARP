import {
    createPublicClient,
    defineChain,
    http,
    type PublicClient,
    type Address,
    type Transport,
    type Chain,
} from "viem";

/**
 * The Intuition Testnet chain definition (chainId 13579). Intuition is
 * an L3 not yet indexed by Etherscan, so consumers can't auto-resolve
 * the chain from viem — we bake it in here.
 */
export const intuitionTestnet = defineChain({
    id: 13579,
    name: "Intuition Testnet",
    nativeCurrency: {decimals: 18, name: "Test Trust", symbol: "tTRUST"},
    rpcUrls: {
        default: {http: ["https://testnet.rpc.intuition.systems/http"]},
    },
    blockExplorers: {
        default: {
            name: "Intuition Testnet Explorer",
            url: "https://testnet.explorer.intuition.systems",
        },
    },
    testnet: true,
});

/**
 * The Intuition Mainnet chain definition (chainId 1155).
 */
export const intuitionMainnet = defineChain({
    id: 1155,
    name: "Intuition",
    nativeCurrency: {decimals: 18, name: "Intuition", symbol: "TRUST"},
    rpcUrls: {
        default: {http: ["https://rpc.intuition.systems/http"]},
    },
    blockExplorers: {
        default: {
            name: "Intuition Explorer",
            url: "https://explorer.intuition.systems",
        },
    },
});

/**
 * The set of contract addresses the SDK reads from. Defaults target
 * Intuition Testnet — consumers running against a different deployment
 * pass their own.
 */
export type ArpDeployment = {
    chain: Chain;
    /** ERC-8004 IdentityRegistry */
    identityRegistry: Address;
    /** ARP ModuleRegistry (the tools catalog) */
    moduleRegistry: Address;
    /** Intuition MultiVault (atoms + triples + bonding curve) */
    multiVault: Address;
};

/**
 * Default deployment — Intuition Testnet. Mirrors `deployments/13579.json`.
 *
 * If the user's repo evolves (e.g. a v3 ModuleRegistry redeploy), update
 * these to match. The SDK ships an explicit default so consumers don't
 * have to chase down addresses to get started.
 */
export const DEFAULT_DEPLOYMENT: ArpDeployment = {
    chain: intuitionTestnet,
    identityRegistry: "0xC165A2AD2E540A4069E02834009161E2b4490d5A",
    moduleRegistry: "0xc9a2f66775828017e984E8be077fA2d17e0A41F4",
    multiVault: "0x2Ece8D4dEdcB9918A398528f3fa4688b1d2CAB91",
};

/**
 * Configuration accepted by every SDK function. All fields are optional
 * — omitting `client` builds a public client from `chain.rpcUrls.default`
 * on first use, and `deployment` defaults to Intuition Testnet.
 */
export type ArpClient = {
    publicClient: PublicClient;
    deployment: ArpDeployment;
};

export type ArpClientConfig = {
    /** Custom public client. Built from `chain` if omitted. */
    publicClient?: PublicClient;
    /** Custom transport (e.g. a different RPC). Ignored if `publicClient` is provided. */
    transport?: Transport;
    /** Override the deployment addresses + chain. */
    deployment?: ArpDeployment;
};

/**
 * Build an `ArpClient` from a partial config. Convenient default for
 * "just give me a working client on Intuition Testnet":
 *
 *     const arp = createArpClient();
 *     const modules = await getModulesByDomain(arp, "solidity-audit");
 */
export function createArpClient(config: ArpClientConfig = {}): ArpClient {
    const deployment = config.deployment ?? DEFAULT_DEPLOYMENT;
    const publicClient =
        config.publicClient ??
        createPublicClient({
            chain: deployment.chain,
            transport: config.transport ?? http(),
        });
    return {publicClient, deployment};
}
