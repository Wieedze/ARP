import {
    INTUITION_SAME_AS_TERM_ID,
    resolveAgent,
    resolveRef,
    toCaip19,
    type AgentRef,
    type Erc8004Client,
    type ResolvedAgentRef,
} from "@arp-protocol/erc8004";
import {
    getAddress,
    recoverTypedDataAddress,
    stringToHex,
    type Account,
    type Address,
    type Chain,
    type Hex,
    type PublicClient,
    type Transport,
    type WalletClient,
} from "viem";

import {multiVaultAbi} from "../lib/abi/multi-vault";
import {
    INTUITION_MAINNET_CHAIN_ID,
    INTUITION_MAINNET_MULTIVAULT,
    intuitionMainnet,
} from "../lib/intuition-mainnet";

import {erc8004GraphClient, erc8004RegistryClient} from "./erc8004-connector";
import {assertMainnetWallet, MAX_STAKE_WEI} from "./trust-stake";

/**
 * Importing an ERC-8004 agent that already exists — the second door, beside the
 * mint in `agent-identity.ts`, which this module does not touch.
 *
 * 28,648 agents already hold an ERC-8004 identity. None of them needs another
 * one, and ARP has no business issuing one: `docs/12` is explicit that a
 * parallel ARP identity namespace is the failure this protocol is supposed to
 * avoid. So nothing here mints. Not an ERC-8004 token on Base, not a
 * replacement agent atom on Intuition, not a row in ARP's own testnet registry.
 *
 * **Where the proof comes from.** The ERC-8004 Identity Registry is an ERC-721
 * and names the `owner` of every token. `verifyAgentOwnership` reads it and
 * compares that address to the connected wallet. That comparison — a contract
 * read against a wallet address — is the proof, entire. The EIP-712 signature
 * taken afterwards is *consent*: the operator's recorded, replayable statement
 * that they want this agent in ARP, bound to the account that will act for it.
 * It proves nothing about ownership that the read did not already settle, and
 * nothing on chain verifies it.
 *
 * **What it writes.** One edge on Intuition mainnet, and only one:
 * `(canonical agent atom, same as, CAIP-10 of the operating account)`. Without
 * it a tool stake is attributable to an address and to nothing else, so tool
 * reputation works and agent reputation does not — and agent reputation is half
 * of the mechanism in `docs/12`. The predicate is Intuition's canonical
 * `same as`, taken from the connector rather than resolved by label or minted
 * fresh; ADR 0026 records why that predicate and not another.
 *
 * The subject is the canonical agent atom, resolved through the connector's
 * preflight. It already exists for every agent the Base mirror covers, and
 * deriving a replacement would produce a differently-pinned duplicate, which
 * `docs/07` says plainly is a different node that fragments the staking surface.
 */

/** What the operator's EIP-712 statement says, in as many words. */
export const ARP_IMPORT_CONTEXT =
    "Agent Reputation Protocol — import of an existing ERC-8004 agent";

/**
 * The EIP-712 struct the operator signs.
 *
 * `agent` is the CAIP-19 asset id, which carries the registry chain and token
 * id, so the statement is unambiguous about *which* agent across all of them.
 * `operatingAccount` is the address whose deposits this import claims for the
 * agent — naming it inside the signed payload is what stops a signed consent
 * being replayed to link a different account.
 */
export const IMPORT_CONSENT_TYPES = {
    AgentImport: [
        {name: "agent", type: "string"},
        {name: "operator", type: "address"},
        {name: "operatingAccount", type: "address"},
        {name: "context", type: "string"},
        {name: "nonce", type: "uint256"},
        {name: "issuedAt", type: "uint256"},
    ],
} as const;

export type ImportConsent = {
    agent: string;
    operator: Address;
    operatingAccount: Address;
    context: string;
    nonce: bigint;
    issuedAt: bigint;
};

/**
 * The EIP-712 domain, bound to the chain the wallet is actually on at signing
 * time.
 *
 * There is deliberately no `verifyingContract`: no contract verifies this
 * signature, because no contract needs to. Naming one would imply an on-chain
 * check that does not exist. `.claude/rules/security.md` asks for nonce +
 * chainId + verifying contract on signatures; the first two are here, and the
 * third is absent with cause rather than by oversight — the replay surface it
 * guards against is cross-contract replay, and this payload is never submitted
 * to a contract.
 */
export function importConsentDomain(chainId: number) {
    return {name: "ARP Agent Import", version: "1", chainId} as const;
}

export type ImportGuardCode =
    | "wrong-chain"
    | "not-owner"
    | "no-canonical-atom"
    | "consent-mismatch"
    | "cost-above-ceiling"
    | "unusable-atom-id";

/** A guard refused to proceed. Carries a code the UI branches on. */
export class ImportGuardError extends Error {
    readonly code: ImportGuardCode;

    constructor(code: ImportGuardCode, message: string) {
        super(message);
        this.name = "ImportGuardError";
        this.code = code;
    }
}

export type OwnershipVerdict =
    | {status: "not-found"; ref: ResolvedAgentRef; caip19: string}
    | {
          status: "owner-mismatch";
          ref: ResolvedAgentRef;
          caip19: string;
          owner: Address;
          connected: Address;
      }
    | {
          status: "owned";
          ref: ResolvedAgentRef;
          caip19: string;
          owner: Address;
          connected: Address;
          registrationFile: string | null;
      };

/**
 * Read the ERC-8004 registry and compare its `owner` to the connected wallet.
 *
 * This is the whole ownership proof. There is no bridge, no cross-chain
 * message and no second identity, because the registry already answers the
 * question and the answer is free to read.
 *
 * Three outcomes, kept distinct because conflating them misleads: the token
 * does not exist, someone else owns it (and the verdict names them, so the
 * operator can see whether they connected the wrong wallet), or it is theirs.
 * A source failure is not an outcome — it throws, from the connector.
 */
export async function verifyAgentOwnership(params: {
    ref: AgentRef;
    connected: Address;
    client?: Erc8004Client;
}): Promise<OwnershipVerdict> {
    const ref = resolveRef(params.ref);
    const caip19 = toCaip19(ref);
    const identity = await resolveAgent(params.client ?? erc8004RegistryClient(), ref);

    if (identity === null || identity.owner === null) {
        return {status: "not-found", ref, caip19};
    }

    const owner = getAddress(identity.owner);
    const connected = getAddress(params.connected);
    if (owner !== connected) {
        return {status: "owner-mismatch", ref, caip19, owner, connected};
    }
    return {
        status: "owned",
        ref,
        caip19,
        owner,
        connected,
        registrationFile: identity.registrationFile,
    };
}

export type CanonicalAgentAtom = {
    atomId: Hex;
    label: string | null;
    caip19: string;
};

const BYTES32 = /^0x[0-9a-fA-F]{64}$/;

/**
 * The agent's canonical Intuition atom, from the connector's preflight.
 *
 * Returns `null` when the graph does not mirror this agent — true for every
 * agent on BSC and Ethereum, and for a Base agent the mirror has not picked up.
 * That is an answer about the agent, not a failure, and the import surfaces it
 * as such rather than minting the missing atom: pinning is server-side only
 * (ADR 0016) and a locally-derived replacement would be a different node.
 */
export async function resolveCanonicalAgentAtom(params: {
    ref: AgentRef;
    client?: Erc8004Client;
}): Promise<CanonicalAgentAtom | null> {
    const ref = resolveRef(params.ref);
    const identity = await resolveAgent(params.client ?? erc8004GraphClient(), ref);
    if (identity === null || identity.sourceHandle === null) return null;
    if (!BYTES32.test(identity.sourceHandle)) {
        throw new ImportGuardError(
            "unusable-atom-id",
            `The graph returned "${identity.sourceHandle}" where an atom id was expected. Nothing was written.`,
        );
    }
    return {
        atomId: identity.sourceHandle as Hex,
        label: identity.metadata.name,
        caip19: toCaip19(ref),
    };
}

/** A 256-bit nonce, so two imports of the same agent produce distinct statements. */
export function randomImportNonce(): bigint {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    let value = 0n;
    for (const byte of bytes) value = (value << 8n) | BigInt(byte);
    return value;
}

export function buildImportConsent(params: {
    caip19: string;
    operator: Address;
    operatingAccount: Address;
    nonce?: bigint;
    issuedAt?: bigint;
}): ImportConsent {
    return {
        agent: params.caip19,
        operator: getAddress(params.operator),
        operatingAccount: getAddress(params.operatingAccount),
        context: ARP_IMPORT_CONTEXT,
        nonce: params.nonce ?? randomImportNonce(),
        issuedAt: params.issuedAt ?? BigInt(Math.floor(Date.now() / 1000)),
    };
}

/** Ask the operator's wallet to sign the statement. The chain id comes from the wallet itself. */
export async function signImportConsent(params: {
    walletClient: WalletClient<Transport, Chain, Account>;
    consent: ImportConsent;
}): Promise<{signature: Hex; chainId: number}> {
    const chainId = await params.walletClient.getChainId();
    const signature = await params.walletClient.signTypedData({
        account: params.walletClient.account,
        domain: importConsentDomain(chainId),
        types: IMPORT_CONSENT_TYPES,
        primaryType: "AgentImport",
        message: params.consent,
    });
    return {signature, chainId};
}

/** Recover the address that signed a consent statement on `chainId`. */
export function recoverImportConsentSigner(params: {
    consent: ImportConsent;
    signature: Hex;
    chainId: number;
}): Promise<Address> {
    return recoverTypedDataAddress({
        domain: importConsentDomain(params.chainId),
        types: IMPORT_CONSENT_TYPES,
        primaryType: "AgentImport",
        message: params.consent,
        signature: params.signature,
    });
}

/**
 * Everything the import established, in one value: the proven owner, the
 * canonical atom, the account being linked, and the signed consent.
 */
export type ImportedAgent = {
    ref: ResolvedAgentRef;
    caip19: string;
    owner: Address;
    agentAtomId: Hex;
    agentLabel: string | null;
    operatingAccount: Address;
    consent: ImportConsent;
    signature: Hex;
    /** The chain the consent was signed on — needed to recover the signer again. */
    signedOnChainId: number;
};

/**
 * The two spellings of a CAIP-10 account id for one address, most-likely first.
 *
 * Mainnet carries 5,003 `caip10:eip155:…` atoms and most spell the address in
 * its EIP-55 checksummed form, but both spellings exist — for at least one
 * address, both exist *for the same account*. Atom ids are content-derived, so
 * the two are different nodes, and picking the wrong one links the agent to an
 * account nobody else points at.
 *
 * The plan below therefore checks the chain before it chooses: whichever atom
 * already exists is the one used, and only when neither does is one created, in
 * the checksummed form the mainnet vocabulary predominantly carries. ADR 0026
 * records that this deliberately differs from `caip10Uri` in
 * `delegation-redeem.ts`, which lowercases for ARP's testnet atoms and stays
 * that way — changing it would orphan atoms and triples that already exist.
 */
export function caip10AccountUris(address: Address, chainId: number): [string, string] {
    const checksummed = getAddress(address);
    return [
        `caip10:eip155:${chainId}:${checksummed}`,
        `caip10:eip155:${chainId}:${checksummed.toLowerCase()}`,
    ];
}

export type ImportLinkPlan = {
    agentAtomId: Hex;
    operatingAccount: Address;
    accountAtomUri: string;
    accountAtomId: Hex;
    accountAtomExists: boolean;
    predicateId: Hex;
    tripleId: Hex;
    tripleExists: boolean;
    /** What the MultiVault charges for each write that is still needed. Zero when it is not. */
    atomCost: bigint;
    tripleCost: bigint;
    totalCost: bigint;
};

const vault = {address: INTUITION_MAINNET_MULTIVAULT, abi: multiVaultAbi} as const;

/**
 * Work out exactly which writes the link needs, and what they cost, before
 * anything is signed.
 *
 * Both writes are idempotent by construction — atom and triple ids are
 * deterministic hashes, so an import run twice sends nothing the second time.
 * A plan where both already exist has a `totalCost` of zero and is the signal
 * that the link is already published.
 */
export async function planOperatorLink(
    publicClient: PublicClient,
    imported: Pick<ImportedAgent, "agentAtomId" | "operatingAccount">,
): Promise<ImportLinkPlan> {
    const predicateId = INTUITION_SAME_AS_TERM_ID as Hex;
    const candidates = caip10AccountUris(imported.operatingAccount, INTUITION_MAINNET_CHAIN_ID);

    // An address whose hex happens to carry no letters checksums to itself, so
    // the two spellings collapse into one. Deduplicating keeps that case from
    // paying for the same pair of reads twice.
    const spellings = [...new Set(candidates)];

    const resolved: {uri: string; atomId: Hex; exists: boolean}[] = [];
    for (const uri of spellings) {
        const atomId = await publicClient.readContract({
            ...vault,
            functionName: "calculateAtomId",
            args: [stringToHex(uri)],
        });
        const exists = await publicClient.readContract({
            ...vault,
            functionName: "isTermCreated",
            args: [atomId],
        });
        resolved.push({uri, atomId, exists});
    }

    // Converge on whatever the graph already holds; fall back to the first
    // spelling, which is the checksummed one the cohort predominantly uses.
    const chosen = resolved.find((entry) => entry.exists) ?? resolved[0];
    if (chosen === undefined) {
        throw new ImportGuardError(
            "unusable-atom-id",
            "No CAIP-10 spelling was produced for the operating account. Nothing was written.",
        );
    }

    const tripleId = await publicClient.readContract({
        ...vault,
        functionName: "calculateTripleId",
        args: [imported.agentAtomId, predicateId, chosen.atomId],
    });
    const tripleExists = await publicClient.readContract({
        ...vault,
        functionName: "isTermCreated",
        args: [tripleId],
    });

    const atomCost = chosen.exists
        ? 0n
        : await publicClient.readContract({...vault, functionName: "getAtomCost"});
    const tripleCost = tripleExists
        ? 0n
        : await publicClient.readContract({...vault, functionName: "getTripleCost"});

    return {
        agentAtomId: imported.agentAtomId,
        operatingAccount: imported.operatingAccount,
        accountAtomUri: chosen.uri,
        accountAtomId: chosen.atomId,
        accountAtomExists: chosen.exists,
        predicateId,
        tripleId,
        tripleExists,
        atomCost,
        tripleCost,
        totalCost: atomCost + tripleCost,
    };
}

export type LinkStepVerdict = "not-needed" | "ok" | "deferred";

/**
 * `eth_call` both writes before anything is signed.
 *
 * The triple can only be simulated once its object atom exists on chain, so a
 * plan that has to create the account atom first reports the triple as
 * `deferred` rather than pretending to have checked it. `submitOperatorLink`
 * simulates it for real, after the atom lands and before the second signature.
 */
export async function simulateOperatorLink(
    publicClient: PublicClient,
    plan: ImportLinkPlan,
    account: Address,
): Promise<{atom: LinkStepVerdict; triple: LinkStepVerdict}> {
    const atom: LinkStepVerdict = plan.accountAtomExists ? "not-needed" : "ok";
    if (!plan.accountAtomExists) {
        await simulateCreateAtom(publicClient, plan, account);
    }

    if (plan.tripleExists) return {atom, triple: "not-needed"};
    if (!plan.accountAtomExists) return {atom, triple: "deferred"};

    await simulateCreateTriple(publicClient, plan, account);
    return {atom, triple: "ok"};
}

function simulateCreateAtom(publicClient: PublicClient, plan: ImportLinkPlan, account: Address) {
    return publicClient.simulateContract({
        ...vault,
        functionName: "createAtoms",
        args: [[stringToHex(plan.accountAtomUri)], [plan.atomCost]],
        value: plan.atomCost,
        account,
    });
}

function simulateCreateTriple(publicClient: PublicClient, plan: ImportLinkPlan, account: Address) {
    return publicClient.simulateContract({
        ...vault,
        functionName: "createTriples",
        args: [[plan.agentAtomId], [plan.predicateId], [plan.accountAtomId], [plan.tripleCost]],
        value: plan.tripleCost,
        account,
    });
}

/**
 * Publish the link. The only write on the import path.
 *
 * Every guard is re-checked here rather than trusted from the render that
 * produced the plan: the wallet's live chain id, the consent signature against
 * the owner the registry named, the statement's own fields against the plan,
 * and the total cost against the same ceiling the trust panel uses. Each write
 * is simulated immediately before it is sent.
 *
 * Returns the hashes of whatever it had to send. Both fields absent means the
 * link was already on the graph and nothing was broadcast.
 */
export async function submitOperatorLink(params: {
    walletClient: WalletClient<Transport, Chain, Account>;
    publicClient: PublicClient;
    imported: ImportedAgent;
    plan: ImportLinkPlan;
}): Promise<{atomTx?: Hex; tripleTx?: Hex}> {
    const {walletClient, publicClient, imported, plan} = params;

    assertMainnetWallet(walletClient.chain?.id);
    assertMainnetWallet(await walletClient.getChainId());

    if (plan.totalCost > MAX_STAKE_WEI) {
        throw new ImportGuardError(
            "cost-above-ceiling",
            `Publishing the link would cost more than this app's per-transaction ceiling (VITE_MAX_STAKE_TRUST). Nothing was sent.`,
        );
    }

    await assertConsentMatches(imported, plan);

    const sender = walletClient.account.address;
    const result: {atomTx?: Hex; tripleTx?: Hex} = {};

    if (!plan.accountAtomExists) {
        await simulateCreateAtom(publicClient, plan, sender);
        const atomTx = await walletClient.writeContract({
            ...vault,
            functionName: "createAtoms",
            args: [[stringToHex(plan.accountAtomUri)], [plan.atomCost]],
            value: plan.atomCost,
            chain: intuitionMainnet,
        });
        await publicClient.waitForTransactionReceipt({hash: atomTx});
        result.atomTx = atomTx;
    }

    if (!plan.tripleExists) {
        await simulateCreateTriple(publicClient, plan, sender);
        const tripleTx = await walletClient.writeContract({
            ...vault,
            functionName: "createTriples",
            args: [[plan.agentAtomId], [plan.predicateId], [plan.accountAtomId], [plan.tripleCost]],
            value: plan.tripleCost,
            chain: intuitionMainnet,
        });
        await publicClient.waitForTransactionReceipt({hash: tripleTx});
        result.tripleTx = tripleTx;
    }

    return result;
}

/**
 * The signed statement has to be about this agent, this account and this owner.
 *
 * Re-derived from the signature rather than read off the object it travels
 * with — a consent that was mutated after signing recovers to a different
 * address and is refused here, which is the only thing the signature is load
 * bearing for.
 */
async function assertConsentMatches(imported: ImportedAgent, plan: ImportLinkPlan): Promise<void> {
    const {consent} = imported;
    if (
        consent.agent !== imported.caip19 ||
        getAddress(consent.operatingAccount) !== getAddress(plan.operatingAccount) ||
        getAddress(consent.operator) !== getAddress(imported.owner) ||
        consent.context !== ARP_IMPORT_CONTEXT
    ) {
        throw new ImportGuardError(
            "consent-mismatch",
            "The signed statement does not match the agent and account being linked. Nothing was sent.",
        );
    }

    const signer = await recoverImportConsentSigner({
        consent,
        signature: imported.signature,
        chainId: imported.signedOnChainId,
    });
    if (getAddress(signer) !== getAddress(imported.owner)) {
        throw new ImportGuardError(
            "consent-mismatch",
            `The consent signature recovers to ${signer}, not to the owner ${imported.owner} the registry named. Nothing was sent.`,
        );
    }
}
