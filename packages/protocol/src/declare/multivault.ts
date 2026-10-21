import {createPublicClient, encodeFunctionData, http, stringToHex} from "viem";
import type {Address, Hex, PublicClient, Transport} from "viem";

/**
 * The MultiVault fragments a declaration needs, and nothing else.
 *
 * Six reads and three writes. The full MultiVault ABI is much larger; carrying only what is used
 * keeps the write surface of this package legible — a reader can see every function the connector
 * can possibly encode by reading this one list.
 *
 * `createAtoms`, `createTriples` and `deposit` appear here as **encoders only**. Nothing in this
 * package sends them (ADR `0038`).
 */
export const multiVaultDeclareAbi = [
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
        stateMutability: "view",
        name: "isTermCreated",
        inputs: [{name: "termId", type: "bytes32"}],
        outputs: [{name: "", type: "bool"}],
    },
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
        name: "getTripleCost",
        inputs: [],
        outputs: [{name: "", type: "uint256"}],
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
        name: "previewAtomCreate",
        inputs: [
            {name: "termId", type: "bytes32"},
            {name: "assets", type: "uint256"},
        ],
        outputs: [
            {name: "shares", type: "uint256"},
            {name: "assetsAfterFixedFees", type: "uint256"},
            {name: "assetsAfterFees", type: "uint256"},
        ],
    },
    {
        type: "function",
        stateMutability: "view",
        name: "previewTripleCreate",
        inputs: [
            {name: "termId", type: "bytes32"},
            {name: "assets", type: "uint256"},
        ],
        outputs: [
            {name: "shares", type: "uint256"},
            {name: "assetsAfterFixedFees", type: "uint256"},
            {name: "assetsAfterFees", type: "uint256"},
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
            {name: "shares", type: "uint256"},
            {name: "assetsAfterFees", type: "uint256"},
        ],
    },
] as const;

/** The atom data for a canonical URI. `keccak256` of these exact bytes is the atom id. */
export function atomDataForUri(uri: string): Hex {
    return stringToHex(uri);
}

/**
 * `assets` is the **deposit**, and the term's creation fee is taken out of it.
 *
 * Measured on testnet 13579, 2026-10-20, by creating one atom each way:
 *
 * | `assets` passed    | the atom's vault ends up with |
 * | ------------------ | ----------------------------- |
 * | `cost` exactly     | 1,000,000 wei, **0 positions** |
 * | `cost + minDeposit`| 980,000,001,000,000 wei, **1 position** |
 *
 * So passing the cost leaves nothing to deposit: the whole amount is the fee, the vault is seeded
 * with `minShare` alone, and the term is born with **no position**. An atom with no position exists
 * on the chain and does not exist as a market — which is the rule this project now holds (ADR
 * `0053`). Re-measured on testnet 13579 on 2026-10-21: of 33 atoms carrying the canonical
 * `Agent 8453:…` fallback label, **6 have no position** and hold exactly 1,000,000 wei, against 27
 * holding 980,000,001,000,000 with one. An earlier version of this comment said "the first three
 * atoms ARP ever created" — the count was never measured, and it is 6.
 *
 * The parameter is therefore named `assets` and not `cost`, and a caller passes
 * `cost + deposit`. `value` on the call must equal it.
 */
export function encodeCreateAtom(atomData: Hex, assets: bigint): Hex {
    return encodeFunctionData({
        abi: multiVaultDeclareAbi,
        functionName: "createAtoms",
        args: [[atomData], [assets]],
    });
}

/** Same as {@link encodeCreateAtom}: `assets` is the deposit and the triple's fee comes out of it. */
export function encodeCreateTriple(
    subjectId: Hex,
    predicateId: Hex,
    objectId: Hex,
    assets: bigint,
): Hex {
    return encodeFunctionData({
        abi: multiVaultDeclareAbi,
        functionName: "createTriples",
        args: [[subjectId], [predicateId], [objectId], [assets]],
    });
}

export function encodeDeposit(
    receiver: Address,
    termId: Hex,
    curveId: bigint,
    minShares: bigint,
): Hex {
    return encodeFunctionData({
        abi: multiVaultDeclareAbi,
        functionName: "deposit",
        args: [receiver, termId, curveId, minShares],
    });
}

/**
 * The reads a plan needs, as an interface rather than a client.
 *
 * Planning is otherwise untestable without a chain, and a mocked viem client is a mock of the
 * wrong thing — it proves a call was shaped, not that a plan was right. A fake reader lets the
 * plan's logic be tested against stated chain state, which is what the tests actually assert.
 */
export type MultiVaultReads = {
    /** The MultiVault address every prepared call targets. */
    readonly address: Address;
    /** The chain the reads came from, carried into the plan so the two cannot drift apart. */
    readonly chainId: number;
    atomId(atomData: Hex): Promise<Hex>;
    tripleId(subjectId: Hex, predicateId: Hex, objectId: Hex): Promise<Hex>;
    termExists(termId: Hex): Promise<boolean>;
    atomCost(): Promise<bigint>;
    tripleCost(): Promise<bigint>;
    defaultCurveId(): Promise<bigint>;
    /**
     * The smallest deposit the protocol accepts, from `getGeneralConfig()`.
     *
     * Read rather than assumed because it differs **10×** between chains: 1e16 (0.01 TRUST) on
     * mainnet 1155 against 1e15 (0.001) on testnet 13579, measured 2026-10-19. An amount tuned on
     * testnet is a tenth of the mainnet floor — `rules/portability.md` rule 3 exactly.
     *
     * `previewDeposit` does **not** catch an amount below it: it returns a value for 0.001 TRUST on
     * mainnet. Reading this does.
     */
    minDeposit(): Promise<bigint>;
    /**
     * What a term creation would actually buy, **before** anything is signed.
     *
     * Measured on both chains 2026-10-21 by `scripts/measure-preview-before-create.ts`, and the two
     * findings are why these are on the reader at all:
     *
     * 1. **Callable on a term that does not exist.** The curve state is empty and it computes from
     *    zero, so the check can happen while it is still free.
     * 2. **It returns `shares = 0` for the fee alone** — on both chains, for atoms and triples. So
     *    ADR `0053`'s "every term is born with a position" stops being an invariant held by
     *    discipline and becomes one verified by a read.
     *
     * `previewDeposit` is **not** symmetric: it reverts on a term that does not exist. Only call it
     * for a term `termExists` confirmed.
     */
    previewAtomCreate(termId: Hex, assets: bigint): Promise<TermPreview>;
    previewTripleCreate(termId: Hex, assets: bigint): Promise<TermPreview>;
    previewDeposit(termId: Hex, curveId: bigint, assets: bigint): Promise<DepositPreview>;
};

/** What `previewAtomCreate` / `previewTripleCreate` return. */
export type TermPreview = {
    /** Shares the creator receives. **Zero means the term is born with no position.** */
    shares: bigint;
    /** The deposit left after the flat creation fee. */
    assetsAfterFixedFees: bigint;
    /** The deposit left after every fee, which is what actually reaches the vault. */
    assetsAfterFees: bigint;
};

/** What `previewDeposit` returns. */
export type DepositPreview = {
    shares: bigint;
    assetsAfterFees: bigint;
};

export type MultiVaultReadsConfig = {
    /**
     * The MultiVault on the chain being written to. **Required, and deliberately not defaulted**:
     * it is `0x6E35…Fe7e` on mainnet 1155 and `0x2Ece…AB91` on testnet 13579, and a default would
     * be a chain constant at module scope (`rules/portability.md` rule 1).
     */
    address: Address;
    chainId: number;
    rpcUrl?: string;
    /** Pre-built transport or client. Tests inject one so no network is touched. */
    transport?: Transport;
    client?: PublicClient;
};

/**
 * A reader backed by viem.
 *
 * No `chain` is passed to `createPublicClient`: these are plain `eth_call` reads, viem does not
 * need a chain definition for them, and requiring one would mean this package carrying a
 * definition of every Intuition chain it might ever read.
 *
 * Costs are read **per plan**, never cached across plans and never copied from `deployments/`.
 * `getAtomCost`, `getTripleCost` and `defaultCurveId` are governance-configurable, and the triple
 * cost is 100× higher on mainnet than on testnet.
 */
export function multiVaultReads(config: MultiVaultReadsConfig): MultiVaultReads {
    const client =
        config.client ??
        // viem's generics narrow a client to the chain it was given, and none is given here
        // deliberately — these are plain `eth_call` reads. The base type is what the reader holds,
        // which is the same device `sources/erc8004-registry` uses for its per-chain client map.
        (createPublicClient({
            transport: config.transport ?? http(config.rpcUrl),
        }) as PublicClient);

    const contract = {address: config.address, abi: multiVaultDeclareAbi} as const;

    return {
        address: config.address,
        chainId: config.chainId,
        async atomId(atomData: Hex): Promise<Hex> {
            return client.readContract({
                ...contract,
                functionName: "calculateAtomId",
                args: [atomData],
            });
        },
        async tripleId(subjectId: Hex, predicateId: Hex, objectId: Hex): Promise<Hex> {
            return client.readContract({
                ...contract,
                functionName: "calculateTripleId",
                args: [subjectId, predicateId, objectId],
            });
        },
        async termExists(termId: Hex): Promise<boolean> {
            return client.readContract({
                ...contract,
                functionName: "isTermCreated",
                args: [termId],
            });
        },
        async atomCost(): Promise<bigint> {
            return client.readContract({...contract, functionName: "getAtomCost"});
        },
        async tripleCost(): Promise<bigint> {
            return client.readContract({...contract, functionName: "getTripleCost"});
        },
        async defaultCurveId(): Promise<bigint> {
            const curve = await client.readContract({
                ...contract,
                functionName: "getBondingCurveConfig",
            });
            return curve.defaultCurveId;
        },
        async minDeposit(): Promise<bigint> {
            const general = await client.readContract({
                ...contract,
                functionName: "getGeneralConfig",
            });
            return general.minDeposit;
        },
        async previewAtomCreate(termId: Hex, assets: bigint): Promise<TermPreview> {
            const [shares, assetsAfterFixedFees, assetsAfterFees] = await client.readContract({
                ...contract,
                functionName: "previewAtomCreate",
                args: [termId, assets],
            });
            return {shares, assetsAfterFixedFees, assetsAfterFees};
        },
        async previewTripleCreate(termId: Hex, assets: bigint): Promise<TermPreview> {
            const [shares, assetsAfterFixedFees, assetsAfterFees] = await client.readContract({
                ...contract,
                functionName: "previewTripleCreate",
                args: [termId, assets],
            });
            return {shares, assetsAfterFixedFees, assetsAfterFees};
        },
        async previewDeposit(
            termId: Hex,
            curveId: bigint,
            assets: bigint,
        ): Promise<DepositPreview> {
            const [shares, assetsAfterFees] = await client.readContract({
                ...contract,
                functionName: "previewDeposit",
                args: [termId, curveId, assets],
            });
            return {shares, assetsAfterFees};
        },
    };
}
