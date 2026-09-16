/**
 * Minimal ABI fragment for Intuition's MultiVault.
 *
 * Address-free on purpose: the same contract is deployed on testnet (see
 * `deployments/13579.json`) and on mainnet (`lib/intuition-mainnet.ts`), and
 * this file is used against both. The caller supplies the address; getting it
 * from the wrong module is the mistake this file must not help anyone make.
 *
 * ARP needs the deposit + read surface only — atom staking on testnet, and
 * claim staking on mainnet. The full ABI (batch ops, redemption, advanced curve
 * config) is much larger; see `.claude/skills/intuition/` for the canonical
 * guide.
 */
export const multiVaultAbi = [
    {
        type: "function",
        stateMutability: "view",
        name: "getAtomCost",
        inputs: [],
        outputs: [{name: "", type: "uint256"}],
    },
    {
        type: "function",
        stateMutability: "view",
        name: "isTermCreated",
        inputs: [{name: "termId", type: "bytes32"}],
        outputs: [{name: "", type: "bool"}],
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
        type: "function",
        stateMutability: "view",
        name: "previewDeposit",
        inputs: [
            {name: "termId", type: "bytes32"},
            {name: "curveId", type: "uint256"},
            {name: "assets", type: "uint256"},
        ],
        outputs: [
            {name: "expectedShares", type: "uint256"},
            {name: "assetsAfterFees", type: "uint256"},
        ],
    },
    {
        type: "function",
        stateMutability: "payable",
        name: "deposit",
        inputs: [
            {name: "receiver", type: "address"},
            {name: "termId", type: "bytes32"},
            {name: "curveId", type: "uint256"},
            {name: "minShares", type: "uint256"},
        ],
        outputs: [{name: "shares", type: "uint256"}],
    },
    {
        type: "function",
        stateMutability: "view",
        name: "calculateAtomId",
        inputs: [{name: "atomData", type: "bytes"}],
        outputs: [{name: "", type: "bytes32"}],
    },
    {
        type: "function",
        stateMutability: "pure",
        name: "calculateTripleId",
        inputs: [
            {name: "subjectId", type: "bytes32"},
            {name: "predicateId", type: "bytes32"},
            {name: "objectId", type: "bytes32"},
        ],
        outputs: [{name: "", type: "bytes32"}],
    },
    {
        type: "function",
        stateMutability: "payable",
        name: "createAtoms",
        inputs: [
            {name: "atomDatas", type: "bytes[]"},
            {name: "assets", type: "uint256[]"},
        ],
        outputs: [{name: "", type: "bytes32[]"}],
    },
    {
        type: "function",
        stateMutability: "view",
        name: "getTripleCost",
        inputs: [],
        outputs: [{name: "", type: "uint256"}],
    },
    {
        type: "function",
        stateMutability: "payable",
        name: "createTriples",
        inputs: [
            {name: "subjectIds", type: "bytes32[]"},
            {name: "predicateIds", type: "bytes32[]"},
            {name: "objectIds", type: "bytes32[]"},
            {name: "assets", type: "uint256[]"},
        ],
        outputs: [{name: "", type: "bytes32[]"}],
    },
    {
        type: "function",
        stateMutability: "view",
        name: "getGeneralConfig",
        inputs: [],
        outputs: [
            {
                name: "",
                type: "tuple",
                components: [
                    {name: "admin", type: "address"},
                    {name: "protocolMultisig", type: "address"},
                    {name: "feeDenominator", type: "uint256"},
                    {name: "trustBonding", type: "address"},
                    {name: "minDeposit", type: "uint256"},
                    {name: "minShare", type: "uint256"},
                    {name: "atomDataMaxLength", type: "uint256"},
                    {name: "feeThreshold", type: "uint256"},
                ],
            },
        ],
    },
    {
        type: "function",
        stateMutability: "pure",
        name: "getCounterIdFromTripleId",
        inputs: [{name: "tripleId", type: "bytes32"}],
        outputs: [{name: "", type: "bytes32"}],
    },
    {
        type: "function",
        stateMutability: "view",
        name: "currentSharePrice",
        inputs: [
            {name: "termId", type: "bytes32"},
            {name: "curveId", type: "uint256"},
        ],
        outputs: [{name: "", type: "uint256"}],
    },
    {
        type: "function",
        stateMutability: "view",
        name: "getShares",
        inputs: [
            {name: "account", type: "address"},
            {name: "termId", type: "bytes32"},
            {name: "curveId", type: "uint256"},
        ],
        outputs: [{name: "", type: "uint256"}],
    },
] as const;
