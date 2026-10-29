import deploymentsJson from "../../../deployments/13579.json";

import type {Address, Hex} from "viem";

/**
 * Typed view of `deployments/13579.json`. The JSON is the canonical record
 * of chain state for Intuition Testnet (chain metadata, external addresses
 * for MetaMask Delegation Framework + Intuition MultiVault, deployed ARP
 * contracts, seeded modules, created atoms).
 *
 * Importing the JSON at module load lets Vite bundle it into the app —
 * future deployments only need to re-run the deploy + seed scripts and
 * commit the updated file; the UI picks it up at next build.
 *
 * If you need to consume this in a non-Vite context (e.g., the CLI demo
 * script in scripts/), load the file at runtime via `fs.readFileSync`
 * instead — Vite's `import` of JSON does not survive a Bun script
 * execution path.
 */
export const deployments = deploymentsJson as Deployments;

export type Deployments = {
    chain: {
        name: string;
        chainId: number;
        chainIdHex: string;
        nativeCurrency: {name: string; symbol: string; decimals: number};
        rpcUrl: string;
        explorerUrl: string;
        graphqlUrl: string;
    };
    intuition: {multiVault: Address};
    metamaskDelegationFramework: {
        version: string;
        delegationManager: Address;
        entryPoint: Address;
        simpleFactory: Address;
        implementations: {
            hybridDeleGator: Address;
            multiSigDeleGator: Address;
            eip7702StatelessDeleGator: Address;
        };
        enforcers: Record<string, Address>;
    };
    arp: {
        deployer: Address;
        deployedAt: string;
        moduleRegistry: Address;
        domainScopeEnforcer: Address;
        trustStakeCapEnforcer: Address;
        identityRegistry: Address;
        deployedTxs: {
            moduleRegistry: Hex;
            domainScopeEnforcer: Hex;
            trustStakeCapEnforcer: Hex;
            identityRegistry: Hex;
        };
        explorerLinks: Record<string, string>;
        modules: Array<{
            id: string;
            name: string;
            domain: string;
            schemaURI: string;
            creator: Address;
            tx: Hex;
        }>;
        intuitionAtoms: Array<{
            atomId: Hex;
            uri: string;
            tx: Hex;
        }>;
    };
};

/**
 * The ERC-8004 registry an agent on this chain lives in, or `undefined` for the canonical one.
 *
 * **ARP's own testnet agents were unreachable without this.** `/agent/13579/4` answered *"No agent
 * there"*: the panel resolved every chain against `DEFAULT_IDENTITY_REGISTRY`, the canonical
 * `0x8004A169…e539a432` on Base, which has no code on 13579. So the rig agents that carry the only
 * real `uses` edges this project has written had no page of their own, while their glyph rendered
 * fine in the claim rows of a tool's page.
 *
 * It asks the deployment record rather than naming a chain: `deployments.chain.chainId` is whichever
 * chain this file describes, so the comparison stays true if that ever changes.
 *
 * `undefined` for every other chain, which lets `resolveRef` apply the canonical default — the
 * right answer for Base, and the one `rules/portability.md` wants the package to keep making on its
 * own.
 */
export function identityRegistryFor(chainId: number): Address | undefined {
    return chainId === deployments.chain.chainId ? deployments.arp.identityRegistry : undefined;
}
