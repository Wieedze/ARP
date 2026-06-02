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
        deployedTxs: {
            moduleRegistry: Hex;
            domainScopeEnforcer: Hex;
            trustStakeCapEnforcer: Hex;
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
