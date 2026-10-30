/**
 * The receipt an agent's node signs when it is hired, and the check anyone can run on it.
 *
 * Pure, like `receipt.ts`: no key, no transport, no clock. `signHireReceipt` takes a signer the node
 * supplies and `verifyHireReceipt` takes the envelope.
 *
 * ## What it says
 *
 * "Agent `agentId` of `agentRegistry` was paid `paid` by `requester` in `payment`, was asked
 * `requestHash` and answered `resultHash`, at `issuedAt`." The hirer's later `(hirer, uses, agent)`
 * edge is anchored to it — `docs/14:159`'s top rung is a payment, and this is the payment plus the
 * agent's own signature that it did the job the payment bought.
 *
 * ## What it replaced, and why
 *
 * Until 2026-10-30 the node signed `keccak256(requestHash ‖ resultHash)` with EIP-191: no domain,
 * no chain, no date, no agent identity. A receipt from a testnet hire verified exactly like one from
 * a mainnet hire, and nothing in it said which agent signed as which ERC-8004 identity.
 *
 * ## How other protocols do it, and what was taken from each
 *
 * - **x402's Offer & Receipt extension** (`x402-foundation/x402`,
 *   `specs/extensions/extension-offer-and-receipt.md` §3.2, §5.2–5.3): a server signs an EIP-712
 *   `Receipt { version, network, resourceUrl, payer, issuedAt, transaction }` under the domain
 *   `{ name: "x402 receipt", version: "1", chainId: 1 }`, with the schema normative and never
 *   transmitted. Taken: EIP-712, a payload `version`, the payer, an issuance time, the payment's
 *   transaction, the rule that an optional string field is `""` rather than absent. Not taken: the
 *   constant `chainId: 1` — x402 hardcodes it so non-EVM payments sign uniformly, and this node
 *   only accepts an EVM payment, so the payment's own chain goes in the domain where it separates
 *   a testnet receipt from a mainnet one. And x402 omits the transaction by default for privacy;
 *   here it is the whole point, so it is required.
 * - **ERC-8004** (`eips.ethereum.org/EIPS/eip-8004`, draft): an agent is
 *   `{namespace}:{chainId}:{identityRegistry}` plus its `agentId`, and the feedback file's
 *   optional `proofOfPayment` is `{ fromAddress, toAddress, chainId, txHash }`. Taken: the identity
 *   in exactly that form, so a receipt names the agent the way a registration file does, and the
 *   four facts of `proofOfPayment` (from = `requester`, to = the recovered signer, chain = the
 *   domain, tx = `payment`).
 * - **EAS off-chain attestations** sign EIP-712 under a domain that names the EAS contract as
 *   `verifyingContract`. Not taken, for the reason `receipt.ts` gives: no contract checks this
 *   signature, and naming one would imply an on-chain check that does not exist.
 *
 * ## The nonce is the payment
 *
 * `.claude/rules/security.md` asks for nonce + chainId + verifying contract. The chain is in the
 * domain, the contract is absent with cause, and the nonce is `payment`: the node refuses a payment
 * it has already been paid with (`apps/node/src/task.ts`, `PaymentLedger`), so one transaction hash
 * is one receipt. Two receipts naming one payment are evidence against the node that signed both.
 *
 * ## What a verifier still has to do
 *
 * Recovery says which key signed. Whether that key **is** agent `agentId` is a chain read this
 * module does not make: the registry's `agentWallet` for that id, or the address the registration
 * file publishes. And whether the payment happened is `getTransaction(payment)` on `chainId`. Both
 * are a stranger's to run without asking the node anything.
 */
import {
    getAddress,
    isAddress,
    isHex,
    keccak256,
    recoverTypedDataAddress,
    type Address,
    type Hex,
} from "viem";

import {canonicalBytesRfc8785} from "./canonicalize.js";

/** The payload's semantic version, signed. Bump with the struct, together with the domain's. */
export const HIRE_RECEIPT_VERSION = 1;

/** What the node signs. Field order is the struct's order and changing it changes every hash. */
export const HIRE_RECEIPT_TYPES = {
    HireReceipt: [
        {name: "version", type: "uint256"},
        {name: "agentRegistry", type: "string"},
        {name: "agentId", type: "uint256"},
        {name: "requester", type: "address"},
        {name: "payment", type: "bytes32"},
        {name: "paid", type: "uint256"},
        {name: "requestHash", type: "bytes32"},
        {name: "resultHash", type: "bytes32"},
        {name: "issuedAt", type: "uint256"},
    ],
} as const;

/** The domain, bound to the chain the payment was made on. */
export function hireReceiptDomain(chainId: number) {
    return {name: "ARP Hire Receipt", version: "1", chainId} as const;
}

/** The claim itself, as it travels in JSON. Amounts are decimal strings, never numbers. */
export type HireReceipt = {
    version: number;
    /** `eip155:<chainId>:<identityRegistry>` as ERC-8004 writes it, or `""` when not registered. */
    agentRegistry: string;
    /** The ERC-721 token id in that registry, decimal. `"0"` when `agentRegistry` is `""`. */
    agentId: string;
    requester: Address;
    /** The payment's transaction hash. One payment, one receipt. */
    payment: Hex;
    /** Wei, decimal. What the payment actually moved, read from the chain. */
    paid: string;
    /** `hireDigest` of the payload the requester sent. */
    requestHash: Hex;
    /** `hireDigest` of the result the node returned. */
    resultHash: Hex;
    /** Unix seconds. */
    issuedAt: number;
};

/** A receipt as it travels: the claim, its chain, who claims to have signed it, the signature. */
export type SignedHireReceipt = {
    format: "eip712";
    receipt: HireReceipt;
    chainId: number;
    /** The address the node says signed. Recovery is what confirms it. */
    agent: Address;
    signature: Hex;
};

export type HireReceiptVerdict =
    | {status: "valid"; signer: Address}
    | {status: "mismatch"; declared: Address; recovered: Address}
    | {status: "malformed"; reason: string};

/**
 * keccak256 over the RFC 8785 canonical form of a JSON value.
 *
 * Canonical rather than `JSON.stringify`, so a requester re-derives the hash of what it sent and
 * what it got back from the parsed JSON alone, in any language, without key order or number
 * formatting deciding the answer. Hash what crossed the wire: a value that went through
 * `JSON.parse`, never one with a `bigint` or an `undefined` still in it.
 */
export function hireDigest(value: unknown): Hex {
    return keccak256(canonicalBytesRfc8785(value ?? null));
}

/** The typed-data block, for signing or for recovery. */
export function hireReceiptTypedData(receipt: HireReceipt, chainId: number) {
    return {
        domain: hireReceiptDomain(chainId),
        types: HIRE_RECEIPT_TYPES,
        primaryType: "HireReceipt" as const,
        message: {
            version: BigInt(receipt.version),
            agentRegistry: receipt.agentRegistry,
            agentId: BigInt(receipt.agentId),
            requester: receipt.requester,
            payment: receipt.payment,
            paid: BigInt(receipt.paid),
            requestHash: receipt.requestHash,
            resultHash: receipt.resultHash,
            issuedAt: BigInt(receipt.issuedAt),
        },
    };
}

/** Signs a typed-data block. The node supplies one; this module never sees a key. */
export type HireReceiptSigner = {
    address: Address;
    signTypedData(data: ReturnType<typeof hireReceiptTypedData>): Promise<Hex>;
};

export async function signHireReceipt(
    receipt: HireReceipt,
    chainId: number,
    signer: HireReceiptSigner,
): Promise<SignedHireReceipt> {
    return {
        format: "eip712",
        receipt,
        chainId,
        agent: getAddress(signer.address),
        signature: await signer.signTypedData(hireReceiptTypedData(receipt, chainId)),
    };
}

const DECIMAL = /^(0|[1-9][0-9]*)$/;
const ERC8004_REGISTRY = /^eip155:[1-9][0-9]*:0x[0-9a-fA-F]{40}$/;

function malformed(reason: string): HireReceiptVerdict {
    return {status: "malformed", reason};
}

/**
 * Recover the signer and compare it to the one the envelope declares.
 *
 * Same three outcomes as `verifyContentReceipt`, and the same conservatism: anything this cannot
 * even attempt is `malformed` with the reason. `valid` says who signed — not that the signer is the
 * agent it names, which is a chain read (see the module note).
 */
export async function verifyHireReceipt(signed: SignedHireReceipt): Promise<HireReceiptVerdict> {
    const {receipt, chainId, agent, signature} = signed;
    if (signed.format !== "eip712") return malformed("format is not eip712");
    if (receipt.version !== HIRE_RECEIPT_VERSION)
        return malformed(`unknown version ${receipt.version}`);
    if (!isAddress(agent)) return malformed("agent is not an address");
    if (!isHex(signature)) return malformed("signature is not hex");
    if (!Number.isInteger(chainId) || chainId <= 0) return malformed("chainId is not a chain id");
    if (receipt.agentRegistry !== "" && !ERC8004_REGISTRY.test(receipt.agentRegistry)) {
        return malformed("agentRegistry is not eip155:<chainId>:<address>");
    }
    if (!DECIMAL.test(receipt.agentId)) return malformed("agentId is not a decimal integer");
    if (receipt.agentRegistry === "" && receipt.agentId !== "0") {
        return malformed("agentId without an agentRegistry");
    }
    if (!isAddress(receipt.requester)) return malformed("requester is not an address");
    for (const key of ["payment", "requestHash", "resultHash"] as const) {
        if (!isHex(receipt[key]) || receipt[key].length !== 66)
            return malformed(`${key} is not bytes32`);
    }
    if (!DECIMAL.test(receipt.paid)) return malformed("paid is not a decimal integer");
    if (!Number.isInteger(receipt.issuedAt) || receipt.issuedAt < 0) {
        return malformed("issuedAt is not a unix timestamp");
    }

    const declared = getAddress(agent);
    let recovered: Address;
    try {
        recovered = await recoverTypedDataAddress({
            ...hireReceiptTypedData(receipt, chainId),
            signature,
        });
    } catch (error) {
        return malformed(error instanceof Error ? error.message : String(error));
    }
    if (recovered !== declared) return {status: "mismatch", declared, recovered};
    return {status: "valid", signer: recovered};
}

/**
 * Whether a receipt is about the exchange in hand: the payload the requester sent and the result it
 * received, both as parsed JSON. The half that needs no signature.
 */
export function hireReceiptMatches(
    receipt: HireReceipt,
    payload: unknown,
    result: unknown,
): boolean {
    return (
        hireDigest(payload) === receipt.requestHash.toLowerCase() &&
        hireDigest(result) === receipt.resultHash.toLowerCase()
    );
}
