/**
 * Inline ABI for ARP's `ModuleRegistry`. Hand-curated to expose only the
 * surface the UI needs (4 reads + 1 event). The full Foundry artifact lives
 * at `contracts/out/ModuleRegistry.sol/ModuleRegistry.json` if more is ever
 * needed; importing the whole artifact is overkill for a 4-function UI.
 */
export const moduleRegistryAbi = [
    {
        type: "function",
        stateMutability: "view",
        name: "totalModules",
        inputs: [],
        outputs: [{name: "", type: "uint256"}],
    },
    {
        type: "function",
        stateMutability: "view",
        name: "getModule",
        inputs: [{name: "id", type: "uint256"}],
        outputs: [
            {
                name: "",
                type: "tuple",
                components: [
                    {name: "id", type: "uint256"},
                    {name: "name", type: "string"},
                    {name: "domain", type: "string"},
                    {name: "schemaURI", type: "string"},
                    {name: "description", type: "string"},
                    {name: "creator", type: "address"},
                    {name: "createdAt", type: "uint256"},
                ],
            },
        ],
    },
    {
        type: "function",
        stateMutability: "view",
        name: "getModulesByDomain",
        inputs: [{name: "domain", type: "string"}],
        outputs: [{name: "", type: "uint256[]"}],
    },
    {
        type: "function",
        stateMutability: "nonpayable",
        name: "registerModule",
        inputs: [
            {name: "name", type: "string"},
            {name: "domain", type: "string"},
            {name: "schemaURI", type: "string"},
            {name: "description", type: "string"},
        ],
        outputs: [{name: "id", type: "uint256"}],
    },
    {
        type: "event",
        name: "ModuleRegistered",
        inputs: [
            {name: "id", type: "uint256", indexed: true},
            {name: "creator", type: "address", indexed: true},
            {name: "domain", type: "string", indexed: true},
            {name: "name", type: "string", indexed: false},
            {name: "schemaURI", type: "string", indexed: false},
        ],
    },
] as const;

export type Module = {
    id: bigint;
    name: string;
    domain: string;
    schemaURI: string;
    description: string;
    creator: `0x${string}`;
    createdAt: bigint;
};
