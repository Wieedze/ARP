import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";

import {
    createErc8004Client,
    erc8004RegistrySource,
    INTUITION_SAME_AS_TERM_ID,
    type AgentIdentity,
    type Erc8004Client,
    type TrustSource,
} from "@arp-protocol/erc8004";
import {getSmartAccountsEnvironment} from "@metamask/smart-accounts-kit";
import {
    custom,
    encodeAbiParameters,
    getAddress,
    parseEther,
    stringToHex,
    type Account,
    type Address,
    type Hex,
} from "viem";
import {privateKeyToAccount} from "viem/accounts";
import {beforeEach, describe, expect, it, vi, type Mock} from "vitest";

import {intuitionTestnet} from "../../lib/chains";
import {
    INTUITION_MAINNET_CHAIN_ID,
    INTUITION_MAINNET_MULTIVAULT,
    intuitionMainnet,
} from "../../lib/intuition-mainnet";
import {
    ARP_IMPORT_CONTEXT,
    buildImportConsent,
    caip10AccountUris,
    ImportGuardError,
    planOperatorLink,
    randomImportNonce,
    recoverImportConsentSigner,
    resolveCanonicalAgentAtom,
    signImportConsent,
    simulateOperatorLink,
    submitOperatorLink,
    verifyAgentOwnership,
    type ImportedAgent,
    type ImportLinkPlan,
} from "../agent-import";
import {caip10Uri} from "../delegation-redeem";
import {StakeGuardError} from "../trust-stake";

/**
 * Two real agents, with the owners the live Base registry actually returns.
 *
 * Read from `https://mainnet.base.org` on 2026-09-16 through the connector's
 * registry source. The live read that produced them is re-run by the opt-in
 * test at the bottom of this file; these values are what it asserts against.
 */
const CLAWNCH = {tokenId: "2340", owner: "0x729a121c347cd89C14f5FF9CD289cA8c70B1de1d"} as const;
const BARE = {tokenId: "6649", owner: "0x5c422e353D04F8c47F1c5DDC1c83E71d50c8775c"} as const;

const OPERATOR_PK: Hex = `0x${"07".repeat(32)}`;
const OPERATOR = privateKeyToAccount(OPERATOR_PK);
/** A checksummed address with letters in it, so its two CAIP-10 spellings differ. */
const SMART_ACCOUNT: Address = "0x5050A4F4b3f9338C3472dcC01A87C76A144b3c9c";
const AGENT_ATOM: Hex = `0x${"a1".repeat(32)}`;
const ACCOUNT_ATOM_CHECKSUMMED: Hex = `0x${"c5".repeat(32)}`;
const ACCOUNT_ATOM_LOWERCASE: Hex = `0x${"10".repeat(32)}`;
const TRIPLE: Hex = `0x${"33".repeat(32)}`;
const ATOM_COST = 100_000_000_001_000_000n;
const TRIPLE_COST = 100_000_000_002_000_000n;

/* -------------------------------------------------------------------------- */
/* Doubles                                                                     */
/* -------------------------------------------------------------------------- */

const OWNER_OF = "0x6352211e";
const TOKEN_URI = "0xc87b56dd";

/**
 * An EIP-1193 transport over the two registry reads, encoded for real.
 *
 * The values are the ones the live Base registry returns. Encoding them rather
 * than stubbing the source means viem's decoding runs, so a change to the ABI
 * or to how the source reads it fails here instead of in production.
 */
function recordedRegistry(owners: Record<string, Address>) {
    return custom({
        request: async ({method, params}) => {
            if (method === "eth_chainId") return "0x2105";
            if (method !== "eth_call") throw new Error(`unexpected RPC method ${method}`);
            const call = Array.isArray(params) ? (params[0] as {data?: string}) : null;
            const data = call?.data;
            if (typeof data !== "string") throw new Error("eth_call without data");

            const tokenId = BigInt(`0x${data.slice(10)}`).toString();
            const owner = owners[tokenId];
            // An unminted token id reverts on `ownerOf`, which is how the
            // registry says "this agent does not exist".
            if (owner === undefined) throw new Error("execution reverted");
            if (data.startsWith(OWNER_OF)) {
                return encodeAbiParameters([{type: "address"}], [owner]);
            }
            if (data.startsWith(TOKEN_URI)) {
                return encodeAbiParameters([{type: "string"}], [""]);
            }
            throw new Error(`unexpected selector ${data.slice(0, 10)}`);
        },
    });
}

function registryClient(
    owners: Record<string, Address> = {[CLAWNCH.tokenId]: CLAWNCH.owner},
): Erc8004Client {
    return createErc8004Client({
        sources: [erc8004RegistrySource({transports: {8453: recordedRegistry(owners)}})],
        fetch: async () => {
            throw new Error("the import's ownership read must not make an HTTP request");
        },
    });
}

/** A graph source that answers the preflight with a fixed handle. */
function graphClient(sourceHandle: string | null): Erc8004Client {
    const source: TrustSource = {
        id: "intuition",
        resolveAgent: async (ref) =>
            sourceHandle === null
                ? null
                : ({
                      chainId: ref.chainId,
                      tokenId: ref.tokenId,
                      registry: ref.registry,
                      caip19: "unused",
                      sourceHandle,
                      registrationFile: null,
                      owner: null,
                      metadata: {
                          name: "🦞 Clawnch 🦞",
                          description: null,
                          image: null,
                          url: null,
                          isFallback: false,
                      },
                      provenance: {sourceId: "intuition", kind: "claim", origin: sourceHandle},
                  } satisfies AgentIdentity),
        getAssessments: async () => [],
        getCapabilities: async () => ({
            types: [],
            protocols: [],
            chains: [],
            tags: [],
            categories: [],
            provenance: {sourceId: "intuition", kind: "claim", origin: null},
        }),
    };
    return createErc8004Client({sources: [source]});
}

type MockPublic = {readContract: Mock; simulateContract: Mock; waitForTransactionReceipt: Mock};
type MockWallet = {
    account: Account;
    chain: {id: number};
    getChainId: Mock;
    writeContract: Mock;
    signTypedData: Mock;
};

/**
 * `calculateAtomId` answers per URI, so a test can say "the lowercase spelling
 * is the one already on chain" and have the service discover that rather than
 * be told.
 */
function makePublic(options: {
    existing?: Hex[];
    atomIdByUri?: Record<string, Hex>;
    tripleId?: Hex;
}): MockPublic {
    const existing = new Set<string>(options.existing ?? []);
    const byUri = options.atomIdByUri ?? {};
    return {
        readContract: vi.fn(async (args: {functionName: string; args?: readonly unknown[]}) => {
            switch (args.functionName) {
                case "calculateAtomId": {
                    const data = args.args?.[0] as Hex;
                    const match = Object.entries(byUri).find(
                        ([uri]) => stringToHex(uri) === data,
                    )?.[1];
                    if (match === undefined) throw new Error(`no atom id wired for ${data}`);
                    return match;
                }
                case "calculateTripleId":
                    return options.tripleId ?? TRIPLE;
                case "isTermCreated":
                    return existing.has(String(args.args?.[0]));
                case "getAtomCost":
                    return ATOM_COST;
                case "getTripleCost":
                    return TRIPLE_COST;
                default:
                    throw new Error(`unexpected readContract ${args.functionName}`);
            }
        }),
        simulateContract: vi.fn().mockResolvedValue({result: []}),
        waitForTransactionReceipt: vi.fn().mockResolvedValue({status: "success"}),
    };
}

function makeWallet(chainId = INTUITION_MAINNET_CHAIN_ID, liveChainId = chainId): MockWallet {
    return {
        account: OPERATOR,
        chain: chainId === INTUITION_MAINNET_CHAIN_ID ? intuitionMainnet : intuitionTestnet,
        getChainId: vi.fn().mockResolvedValue(liveChainId),
        writeContract: vi.fn().mockResolvedValue(`0x${"ab".repeat(32)}`),
        signTypedData: vi.fn(async (args: Parameters<typeof OPERATOR.signTypedData>[0]) =>
            OPERATOR.signTypedData(args),
        ),
    };
}

// The services take viem client interfaces; the doubles expose only the
// methods under test, which is the supported viem testing shape.
/* eslint-disable @typescript-eslint/no-explicit-any */
const asPublic = (client: MockPublic) => client as any;
const asWallet = (client: MockWallet) => client as any;
/* eslint-enable @typescript-eslint/no-explicit-any */

const [LOWERCASE_URI, CHECKSUMMED_URI] = caip10AccountUris(
    SMART_ACCOUNT,
    INTUITION_MAINNET_CHAIN_ID,
);
const ATOM_IDS = {
    [CHECKSUMMED_URI]: ACCOUNT_ATOM_CHECKSUMMED,
    [LOWERCASE_URI]: ACCOUNT_ATOM_LOWERCASE,
};

const CAIP19 = "eip155:8453/erc721:0x8004A169FB4a3325136EB29fA0ceB6D2e539a432/2340";

async function importedAgent(overrides: Partial<ImportedAgent> = {}): Promise<ImportedAgent> {
    const consent =
        overrides.consent ??
        buildImportConsent({
            caip19: CAIP19,
            operator: OPERATOR.address,
            operatingAccount: SMART_ACCOUNT,
            nonce: 42n,
            issuedAt: 1_700_000_000n,
        });
    const wallet = makeWallet();
    const {signature, chainId} = await signImportConsent({
        walletClient: asWallet(wallet),
        consent,
    });
    return {
        ref: {
            chainId: 8453,
            tokenId: "2340",
            registry: "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432",
        },
        caip19: CAIP19,
        owner: OPERATOR.address,
        agentAtomId: AGENT_ATOM,
        agentLabel: "🦞 Clawnch 🦞",
        operatingAccount: SMART_ACCOUNT,
        consent,
        signature,
        signedOnChainId: chainId,
        ...overrides,
    };
}

/* -------------------------------------------------------------------------- */
/* Ownership — the whole proof                                                 */
/* -------------------------------------------------------------------------- */

describe("verifyAgentOwnership", () => {
    it("accepts the wallet the registry names as owner", async () => {
        const verdict = await verifyAgentOwnership({
            ref: {chainId: 8453, tokenId: CLAWNCH.tokenId},
            connected: CLAWNCH.owner,
            client: registryClient(),
        });
        expect(verdict.status).toBe("owned");
        if (verdict.status !== "owned") return;
        expect(verdict.owner).toBe(CLAWNCH.owner);
        expect(verdict.caip19).toBe(CAIP19);
    });

    it("accepts a lowercase connected address — casing is not ownership", async () => {
        const verdict = await verifyAgentOwnership({
            ref: {chainId: 8453, tokenId: CLAWNCH.tokenId},
            connected: CLAWNCH.owner.toLowerCase() as Address,
            client: registryClient(),
        });
        expect(verdict.status).toBe("owned");
    });

    it("refuses a wallet that is not the owner, and says who is", async () => {
        const verdict = await verifyAgentOwnership({
            ref: {chainId: 8453, tokenId: CLAWNCH.tokenId},
            connected: OPERATOR.address,
            client: registryClient(),
        });
        expect(verdict.status).toBe("owner-mismatch");
        if (verdict.status !== "owner-mismatch") return;
        expect(verdict.owner).toBe(CLAWNCH.owner);
        expect(verdict.connected).toBe(OPERATOR.address);
    });

    it("reports a token that was never minted as not found, not as a mismatch", async () => {
        const verdict = await verifyAgentOwnership({
            ref: {chainId: 8453, tokenId: "999999999"},
            connected: OPERATOR.address,
            client: registryClient(),
        });
        expect(verdict.status).toBe("not-found");
    });

    it("reads both agents the live registry holds, each with its own owner", async () => {
        const client = registryClient({
            [CLAWNCH.tokenId]: CLAWNCH.owner,
            [BARE.tokenId]: BARE.owner,
        });
        for (const agent of [CLAWNCH, BARE]) {
            const verdict = await verifyAgentOwnership({
                ref: {chainId: 8453, tokenId: agent.tokenId},
                connected: agent.owner,
                client,
            });
            expect(verdict.status).toBe("owned");
        }
        // And the two do not stand in for each other.
        const crossed = await verifyAgentOwnership({
            ref: {chainId: 8453, tokenId: BARE.tokenId},
            connected: CLAWNCH.owner,
            client,
        });
        expect(crossed.status).toBe("owner-mismatch");
    });
});

/* -------------------------------------------------------------------------- */
/* Nothing is minted                                                           */
/* -------------------------------------------------------------------------- */

describe("the import path mints nothing", () => {
    const source = readFileSync(
        fileURLToPath(new URL("../agent-import.ts", import.meta.url)),
        "utf8",
    );

    it("does not reach the mint service, the pin service or any identity registry", () => {
        // A static check, because the regression it guards against is an
        // import someone adds later, not a call this suite would happen to run.
        expect(source).not.toMatch(/from "\.\/agent-identity"/);
        expect(source).not.toMatch(/from "\.\/intuition-pin"/);
        expect(source).not.toMatch(/identity-registry/);
        expect(source).not.toMatch(/pinThing/);
        expect(source).not.toMatch(/registerAgent/);
    });

    it("sends nothing but the two graph writes, and only to the mainnet MultiVault", async () => {
        const publicClient = makePublic({atomIdByUri: ATOM_IDS});
        const wallet = makeWallet();
        const imported = await importedAgent();
        const plan = await planOperatorLink(asPublic(publicClient), imported);

        await submitOperatorLink({
            walletClient: asWallet(wallet),
            publicClient: asPublic(publicClient),
            imported,
            plan,
        });

        const calls = wallet.writeContract.mock.calls.map(
            (call) => call[0] as {address: Address; functionName: string},
        );
        expect(calls).toHaveLength(2);
        for (const call of calls) {
            expect(call.address).toBe(INTUITION_MAINNET_MULTIVAULT);
        }
        expect(calls.map((call) => call.functionName)).toEqual(["createAtoms", "createTriples"]);
    });

    it("writes nothing at all when the link is already on the graph", async () => {
        const publicClient = makePublic({
            atomIdByUri: ATOM_IDS,
            existing: [ACCOUNT_ATOM_LOWERCASE, TRIPLE],
        });
        const wallet = makeWallet();
        const imported = await importedAgent();
        const plan = await planOperatorLink(asPublic(publicClient), imported);

        expect(plan.totalCost).toBe(0n);
        await expect(
            submitOperatorLink({
                walletClient: asWallet(wallet),
                publicClient: asPublic(publicClient),
                imported,
                plan,
            }),
        ).resolves.toEqual({});
        expect(wallet.writeContract).not.toHaveBeenCalled();
    });
});

/* -------------------------------------------------------------------------- */
/* The canonical atom                                                          */
/* -------------------------------------------------------------------------- */

describe("resolveCanonicalAgentAtom", () => {
    it("takes the atom from the connector's preflight, never deriving one", async () => {
        const atom = await resolveCanonicalAgentAtom({
            ref: {chainId: 8453, tokenId: "2340"},
            client: graphClient(
                "0x20dd3a62fee16233e1747a597291dd8faa10a1eb6783afe2bc52eab62df89028",
            ),
        });
        expect(atom?.atomId).toBe(
            "0x20dd3a62fee16233e1747a597291dd8faa10a1eb6783afe2bc52eab62df89028",
        );
        expect(atom?.label).toBe("🦞 Clawnch 🦞");
    });

    it("returns null when the graph does not mirror the agent", async () => {
        await expect(
            resolveCanonicalAgentAtom({
                ref: {chainId: 56, tokenId: "17"},
                client: graphClient(null),
            }),
        ).resolves.toBeNull();
    });

    it("refuses a handle that is not an atom id rather than passing it on", async () => {
        await expect(
            resolveCanonicalAgentAtom({
                ref: {chainId: 8453, tokenId: "2340"},
                client: graphClient("8453:0x8004A169FB4a3325136EB29fA0ceB6D2e539a432:2340"),
            }),
        ).rejects.toBeInstanceOf(ImportGuardError);
    });
});

/* -------------------------------------------------------------------------- */
/* Consent                                                                     */
/* -------------------------------------------------------------------------- */

describe("the consent statement", () => {
    it("recovers to the operator who signed it", async () => {
        const consent = buildImportConsent({
            caip19: CAIP19,
            operator: OPERATOR.address,
            operatingAccount: SMART_ACCOUNT,
            nonce: 1n,
            issuedAt: 2n,
        });
        const wallet = makeWallet();
        const {signature, chainId} = await signImportConsent({
            walletClient: asWallet(wallet),
            consent,
        });
        await expect(recoverImportConsentSigner({consent, signature, chainId})).resolves.toBe(
            OPERATOR.address,
        );
    });

    it("names the agent, the account and the ARP context", () => {
        const consent = buildImportConsent({
            caip19: CAIP19,
            operator: OPERATOR.address,
            operatingAccount: SMART_ACCOUNT.toLowerCase() as Address,
        });
        expect(consent.agent).toBe(CAIP19);
        expect(consent.operatingAccount).toBe(getAddress(SMART_ACCOUNT));
        expect(consent.context).toBe(ARP_IMPORT_CONTEXT);
    });

    it("carries a distinct nonce per statement", () => {
        expect(randomImportNonce()).not.toBe(randomImportNonce());
    });

    it("is signed on the chain the wallet reports, not one the app assumed", async () => {
        const wallet = makeWallet(INTUITION_MAINNET_CHAIN_ID, 8453);
        const consent = buildImportConsent({
            caip19: CAIP19,
            operator: OPERATOR.address,
            operatingAccount: SMART_ACCOUNT,
            nonce: 1n,
            issuedAt: 2n,
        });
        const {chainId, signature} = await signImportConsent({
            walletClient: asWallet(wallet),
            consent,
        });
        expect(chainId).toBe(8453);
        // Recovering against the wrong domain chain id yields a different address.
        await expect(
            recoverImportConsentSigner({consent, signature, chainId: 1155}),
        ).resolves.not.toBe(OPERATOR.address);
    });
});

/* -------------------------------------------------------------------------- */
/* The link                                                                    */
/* -------------------------------------------------------------------------- */

describe("caip10AccountUris", () => {
    it("offers the lowercase spelling first — the one chain 1155 predominantly carries", () => {
        const [first, second] = caip10AccountUris(
            SMART_ACCOUNT.toLowerCase() as Address,
            INTUITION_MAINNET_CHAIN_ID,
        );
        expect(first).toBe(`caip10:eip155:1155:${SMART_ACCOUNT.toLowerCase()}`);
        expect(second).toBe(`caip10:eip155:1155:${getAddress(SMART_ACCOUNT)}`);
    });

    it("agrees with `caip10Uri`, the spelling ARP already writes on testnet", () => {
        const [lowercase] = caip10AccountUris(SMART_ACCOUNT, INTUITION_MAINNET_CHAIN_ID);
        expect(lowercase).toBe(caip10Uri(SMART_ACCOUNT, INTUITION_MAINNET_CHAIN_ID));
    });
});

describe("planOperatorLink", () => {
    it("uses Intuition's canonical `same as`, not a predicate of our own", async () => {
        const publicClient = makePublic({atomIdByUri: ATOM_IDS});
        const plan = await planOperatorLink(asPublic(publicClient), await importedAgent());
        expect(plan.predicateId).toBe(INTUITION_SAME_AS_TERM_ID);
    });

    it("converges on the spelling already on chain rather than minting a duplicate", async () => {
        const publicClient = makePublic({
            atomIdByUri: ATOM_IDS,
            existing: [ACCOUNT_ATOM_CHECKSUMMED],
        });
        const plan = await planOperatorLink(asPublic(publicClient), await importedAgent());
        expect(plan.accountAtomUri).toBe(CHECKSUMMED_URI);
        expect(plan.accountAtomExists).toBe(true);
        expect(plan.atomCost).toBe(0n);
        expect(plan.tripleCost).toBe(TRIPLE_COST);
    });

    it("falls back to the lowercase spelling when neither exists", async () => {
        const publicClient = makePublic({atomIdByUri: ATOM_IDS});
        const plan = await planOperatorLink(asPublic(publicClient), await importedAgent());
        expect(plan.accountAtomUri).toBe(LOWERCASE_URI);
        expect(plan.accountAtomExists).toBe(false);
        expect(plan.totalCost).toBe(ATOM_COST + TRIPLE_COST);
    });

    it("keys the triple on the agent atom, the predicate and the account atom", async () => {
        const publicClient = makePublic({atomIdByUri: ATOM_IDS});
        await planOperatorLink(asPublic(publicClient), await importedAgent());
        const call = publicClient.readContract.mock.calls
            .map((entry) => entry[0] as {functionName: string; args?: readonly unknown[]})
            .find((args) => args.functionName === "calculateTripleId");
        expect(call?.args).toEqual([AGENT_ATOM, INTUITION_SAME_AS_TERM_ID, ACCOUNT_ATOM_LOWERCASE]);
    });
});

describe("simulateOperatorLink", () => {
    it("defers the triple until its object atom exists", async () => {
        const publicClient = makePublic({atomIdByUri: ATOM_IDS});
        const plan = await planOperatorLink(asPublic(publicClient), await importedAgent());
        await expect(
            simulateOperatorLink(asPublic(publicClient), plan, OPERATOR.address),
        ).resolves.toEqual({atom: "ok", triple: "deferred"});
        expect(publicClient.simulateContract).toHaveBeenCalledTimes(1);
    });

    it("checks the triple for real once the account atom is already there", async () => {
        const publicClient = makePublic({
            atomIdByUri: ATOM_IDS,
            existing: [ACCOUNT_ATOM_LOWERCASE],
        });
        const plan = await planOperatorLink(asPublic(publicClient), await importedAgent());
        await expect(
            simulateOperatorLink(asPublic(publicClient), plan, OPERATOR.address),
        ).resolves.toEqual({atom: "not-needed", triple: "ok"});
    });

    it("calls nothing when both are already published", async () => {
        const publicClient = makePublic({
            atomIdByUri: ATOM_IDS,
            existing: [ACCOUNT_ATOM_LOWERCASE, TRIPLE],
        });
        const plan = await planOperatorLink(asPublic(publicClient), await importedAgent());
        await expect(
            simulateOperatorLink(asPublic(publicClient), plan, OPERATOR.address),
        ).resolves.toEqual({atom: "not-needed", triple: "not-needed"});
        expect(publicClient.simulateContract).not.toHaveBeenCalled();
    });
});

describe("submitOperatorLink", () => {
    let publicClient: MockPublic;
    let plan: ImportLinkPlan;
    let imported: ImportedAgent;

    beforeEach(async () => {
        publicClient = makePublic({atomIdByUri: ATOM_IDS});
        imported = await importedAgent();
        plan = await planOperatorLink(asPublic(publicClient), imported);
    });

    it("refuses a wallet configured for another chain", async () => {
        const wallet = makeWallet(intuitionTestnet.id);
        await expect(
            submitOperatorLink({
                walletClient: asWallet(wallet),
                publicClient: asPublic(publicClient),
                imported,
                plan,
            }),
        ).rejects.toBeInstanceOf(StakeGuardError);
        expect(wallet.writeContract).not.toHaveBeenCalled();
    });

    it("refuses a wallet that moved off mainnet after the plan was built", async () => {
        const wallet = makeWallet(INTUITION_MAINNET_CHAIN_ID, intuitionTestnet.id);
        await expect(
            submitOperatorLink({
                walletClient: asWallet(wallet),
                publicClient: asPublic(publicClient),
                imported,
                plan,
            }),
        ).rejects.toBeInstanceOf(StakeGuardError);
        expect(wallet.writeContract).not.toHaveBeenCalled();
    });

    it("refuses a consent whose fields were changed after signing", async () => {
        const wallet = makeWallet();
        const tampered = {
            ...imported,
            consent: {...imported.consent, operatingAccount: OPERATOR.address},
        };
        await expect(
            submitOperatorLink({
                walletClient: asWallet(wallet),
                publicClient: asPublic(publicClient),
                imported: tampered,
                plan,
            }),
        ).rejects.toBeInstanceOf(ImportGuardError);
        expect(wallet.writeContract).not.toHaveBeenCalled();
    });

    it("refuses a consent signed by somebody other than the owner", async () => {
        const wallet = makeWallet();
        const impostor = {...imported, owner: SMART_ACCOUNT};
        await expect(
            submitOperatorLink({
                walletClient: asWallet(wallet),
                publicClient: asPublic(publicClient),
                imported: impostor,
                plan,
            }),
        ).rejects.toBeInstanceOf(ImportGuardError);
        expect(wallet.writeContract).not.toHaveBeenCalled();
    });

    it("refuses a plan whose cost is above the app's ceiling", async () => {
        const wallet = makeWallet();
        const expensive: ImportLinkPlan = {...plan, totalCost: parseEther("100")};
        await expect(
            submitOperatorLink({
                walletClient: asWallet(wallet),
                publicClient: asPublic(publicClient),
                imported,
                plan: expensive,
            }),
        ).rejects.toMatchObject({code: "cost-above-ceiling"});
        expect(wallet.writeContract).not.toHaveBeenCalled();
    });

    it("simulates each write immediately before sending it", async () => {
        const wallet = makeWallet();
        const result = await submitOperatorLink({
            walletClient: asWallet(wallet),
            publicClient: asPublic(publicClient),
            imported,
            plan,
        });
        expect(publicClient.simulateContract).toHaveBeenCalledTimes(2);
        expect(result.atomTx).toBeDefined();
        expect(result.tripleTx).toBeDefined();
    });

    it("names the mainnet chain on every write, so viem catches a stray wallet", async () => {
        const wallet = makeWallet();
        await submitOperatorLink({
            walletClient: asWallet(wallet),
            publicClient: asPublic(publicClient),
            imported,
            plan,
        });
        for (const entry of wallet.writeContract.mock.calls) {
            expect((entry[0] as {chain: {id: number}}).chain.id).toBe(INTUITION_MAINNET_CHAIN_ID);
        }
    });
});

/* -------------------------------------------------------------------------- */
/* The account being linked                                                    */
/* -------------------------------------------------------------------------- */

describe("the operating account's address is the same on 1155 as on 13579", () => {
    /**
     * The link names the Smart Account, which the app derives through a testnet
     * client. If the framework sat at different addresses on the two chains the
     * derived address would differ and the link would name an account that never
     * stakes on mainnet. It does not, and this asserts it rather than trusting a
     * CREATE2 argument in a comment.
     */
    it("resolves the same factory and Hybrid implementation on both chains", () => {
        const testnet = getSmartAccountsEnvironment(intuitionTestnet.id);
        const mainnet = getSmartAccountsEnvironment(INTUITION_MAINNET_CHAIN_ID);
        expect(mainnet.SimpleFactory).toBe(testnet.SimpleFactory);
        expect(mainnet.implementations.HybridDeleGatorImpl).toBe(
            testnet.implementations.HybridDeleGatorImpl,
        );
    });
});

/* -------------------------------------------------------------------------- */
/* One live read                                                               */
/* -------------------------------------------------------------------------- */

/**
 * The ownership proof, against the real Base registry.
 *
 * Opt-in for the same reason the connector's live smoke test is: the default
 * suite stays hermetic. Reads are free and need no key, so this costs nothing
 * but a round trip. Run with `ERC8004_LIVE=1 bun run test`.
 */
const live = process.env["ERC8004_LIVE"] === "1" ? describe : describe.skip;

live("live ownership read (ERC8004_LIVE=1)", () => {
    it("reads the true owner of two real Base agents", async () => {
        for (const agent of [CLAWNCH, BARE]) {
            const verdict = await verifyAgentOwnership({
                ref: {chainId: 8453, tokenId: agent.tokenId},
                connected: agent.owner,
            });
            expect(verdict.status).toBe("owned");
            if (verdict.status !== "owned") continue;
            expect(verdict.owner).toBe(agent.owner);
        }
    }, 60_000);

    it("refuses a wallet that does not own the agent", async () => {
        const verdict = await verifyAgentOwnership({
            ref: {chainId: 8453, tokenId: CLAWNCH.tokenId},
            connected: BARE.owner,
        });
        expect(verdict.status).toBe("owner-mismatch");
        if (verdict.status !== "owner-mismatch") return;
        expect(verdict.owner).toBe(CLAWNCH.owner);
    }, 60_000);
});
