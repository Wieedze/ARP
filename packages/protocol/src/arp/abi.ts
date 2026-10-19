/**
 * Inline ABI fragments — the SDK is intentionally self-contained, so we
 * don't depend on the app's ABI directory. Each fragment is the minimal
 * surface the SDK reads from. Keep these in lockstep with the deployed
 * contracts: a method-signature drift on chain is silent here until a
 * call reverts.
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
        stateMutability: "view",
        name: "getModuleIdBySchemaURI",
        inputs: [{name: "schemaURI", type: "string"}],
        outputs: [{name: "", type: "uint256"}],
    },
] as const;

export const identityRegistryAbi = [
    {
        type: "function",
        stateMutability: "view",
        name: "totalAgents",
        inputs: [],
        outputs: [{name: "count", type: "uint256"}],
    },
    {
        type: "function",
        stateMutability: "view",
        name: "getAgentWallet",
        inputs: [{name: "agentId", type: "uint256"}],
        outputs: [{name: "wallet", type: "address"}],
    },
    {
        type: "function",
        stateMutability: "view",
        name: "ownerOf",
        inputs: [{name: "tokenId", type: "uint256"}],
        outputs: [{name: "", type: "address"}],
    },
    {
        type: "event",
        name: "Registered",
        inputs: [
            {name: "agentId", type: "uint256", indexed: true},
            {name: "agentURI", type: "string", indexed: false},
            {name: "to", type: "address", indexed: true},
        ],
    },
] as const;

export const multiVaultAbi = [
    {
        type: "function",
        stateMutability: "pure",
        name: "calculateAtomId",
        inputs: [{name: "atomData", type: "bytes"}],
        outputs: [{name: "", type: "bytes32"}],
    },
    {
        type: "function",
        stateMutability: "view",
        name: "getBondingCurveConfig",
        inputs: [],
        outputs: [
            {
                name: "",
                type: "tuple",
                components: [
                    {name: "registry", type: "address"},
                    {name: "defaultCurveId", type: "uint256"},
                ],
            },
        ],
    },
    {
        type: "function",
        stateMutability: "view",
        name: "getVault",
        inputs: [
            {name: "termId", type: "bytes32"},
            {name: "curveId", type: "uint256"},
        ],
        outputs: [
            {name: "totalAssets", type: "uint256"},
            {name: "totalShares", type: "uint256"},
        ],
    },
    {
        type: "event",
        name: "Deposited",
        inputs: [
            {name: "sender", type: "address", indexed: true},
            {name: "receiver", type: "address", indexed: true},
            {name: "termId", type: "bytes32", indexed: true},
            {name: "curveId", type: "uint256", indexed: false},
            {name: "assets", type: "uint256", indexed: false},
            {name: "assetsAfterFees", type: "uint256", indexed: false},
            {name: "shares", type: "uint256", indexed: false},
            {name: "totalShares", type: "uint256", indexed: false},
            {name: "vaultType", type: "uint8", indexed: false},
        ],
    },
] as const;
