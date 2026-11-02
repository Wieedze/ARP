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
 *   `verifyingContract`. Not taken when v1 was fixed, for the reason `receipt.ts` gives: no
 *   contract checked this signature. **Taken in v2** (task 44, user decision 2026-10-30, ADR
 *   `0098`): two verifiers now consume this receipt, `contracts/src/enforcers/ReceiptEnforcer.sol`
 *   and the sponsoring service (`apps/sponsor`), and a receipt that names neither could be
 *   sponsored once by each. A v2 receipt names the one verifier it is for, and each verifier
 *   accepts only receipts that name it.
 *
 * ## v1 and v2
 *
 * | | domain | struct adds | who accepts it |
 * | --- | --- | --- | --- |
 * | v1 | `{name, version: "1", chainId}` | — | nobody that sponsors; still verifies here |
 * | v2 | `{name, version: "2", chainId, verifyingContract}` | `termId`, `expiresAt` | the verifier it names |
 *
 * New receipts are v2: {@link signHireReceipt} signs nothing else. v1 stays readable, so a receipt
 * issued before task 44 still verifies by {@link verifyHireReceipt}; it just unlocks nothing,
 * because the enforcer and the service both refuse a receipt that names no verifier.
 *
 * `verifyingContract` is the enforcer's address when the receipt is for the enforcer, and the
 * sponsoring account's address when it is for the service. The hirer asks for one when it hires
 * (`apps/node`'s `POST /task` takes `verifier` and `termId`), and the node signs what was asked.
 * `termId` is the term the hirer will deposit on, `(hirer, uses, agent)`. `expiresAt` is the
 * node's own bound on the receipt's life, in unix seconds.
 *
 * ## The nonce is the payment
 *
 * `.claude/rules/security.md` asks for nonce + chainId + verifying contract. The chain and, in v2,
 * the verifying contract are in the domain, and the nonce is `payment`: the node refuses a payment
 * it has already been paid with (`apps/node/src/task.ts`, `PaymentLedger`), so one transaction hash
 * is one receipt, and that receipt names one verifier. Two receipts naming one payment are evidence
 * against the node that signed both.
 *
 * ## What a verifier still has to do
 *
 * Recovery says which key signed. Whether that key **is** agent `agentId` is a chain read this
 * module does not make: the registry's `agentWallet` for that id, or the address the registration
 * file publishes. And whether the payment happened is `getTransaction(payment)` on `chainId`. Both
 * are a stranger's to run without asking the node anything.
 *
 * `ReceiptEnforcer` settles the first from the delegator's own binding of key to agent in its
 * terms. It does not settle the second: it holds "an accepted key signed this receipt", never "a
 * payment was made" (user decision, 2026-10-30, ADR `0098`). The sponsoring service reads the
 * payment transaction.
 *
 * And a verifier acts only on a receipt that names **it**, and only before `expiresAt`:
 * {@link hireReceiptIsFor}. Recovery cannot say this, because the address and the clock are the
 * verifier's.
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

/** The payload version new receipts carry, signed. Bump with the struct, together with the domain's. */
export const HIRE_RECEIPT_VERSION = 2;

/** v1's struct, kept so a receipt issued before task 44 still verifies. Never signed any more. */
export const HIRE_RECEIPT_V1_TYPES = {
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

/**
 * What the node signs: v1's fields in v1's order, then `termId` and `expiresAt`. Field order is the
 * struct's order and changing it changes every hash; `ReceiptEnforcer.RECEIPT_TYPEHASH` is the same
 * string.
 */
export const HIRE_RECEIPT_TYPES = {
    HireReceipt: [
        ...HIRE_RECEIPT_V1_TYPES.HireReceipt,
        {name: "termId", type: "bytes32"},
        {name: "expiresAt", type: "uint256"},
    ],
} as const;

/** v1's domain: the payment's chain, and no verifier. */
export function hireReceiptV1Domain(chainId: number) {
    return {name: "ARP Hire Receipt", version: "1", chainId} as const;
}

/** The domain: the payment's chain, and the one verifier the receipt is for. */
export function hireReceiptDomain(chainId: number, verifyingContract: Address) {
    return {name: "ARP Hire Receipt", version: "2", chainId, verifyingContract} as const;
}

/** The fields both versions sign. Amounts are decimal strings, never numbers. */
export type HireReceiptFields = {
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

/** A v1 claim, as it travels in JSON. Readable, never signed any more. */
export type HireReceiptV1 = HireReceiptFields & {version: 1};

/** The claim new receipts make, as it travels in JSON. */
export type HireReceipt = HireReceiptFields & {
    version: 2;
    /** The term the requester will deposit on: the `(requester, uses, agent)` triple. */
    termId: Hex;
    /** Unix seconds. A verifier refuses the receipt after this. */
    expiresAt: number;
};

/** A receipt as it travels: the claim, its domain, who claims to have signed it, the signature. */
export type SignedHireReceipt = {
    format: "eip712";
    receipt: HireReceipt;
    chainId: number;
    /** The one verifier this receipt is for: an enforcer's address, or a service's own. */
    verifyingContract: Address;
    /** The address the node says signed. Recovery is what confirms it. */
    agent: Address;
    signature: Hex;
};

/** A v1 receipt as it travelled. No verifier in it. */
export type SignedHireReceiptV1 = {
    format: "eip712";
    receipt: HireReceiptV1;
    chainId: number;
    agent: Address;
    signature: Hex;
};

/** Either version, as a verifier receives it. */
export type AnySignedHireReceipt = SignedHireReceipt | SignedHireReceiptV1;

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

function v1Message(receipt: HireReceiptFields & {version: number}) {
    return {
        version: BigInt(receipt.version),
        agentRegistry: receipt.agentRegistry,
        agentId: BigInt(receipt.agentId),
        requester: receipt.requester,
        payment: receipt.payment,
        paid: BigInt(receipt.paid),
        requestHash: receipt.requestHash,
        resultHash: receipt.resultHash,
        issuedAt: BigInt(receipt.issuedAt),
    };
}

/** The typed-data block, for signing or for recovery. */
export function hireReceiptTypedData(
    receipt: HireReceipt,
    chainId: number,
    verifyingContract: Address,
) {
    return {
        domain: hireReceiptDomain(chainId, verifyingContract),
        types: HIRE_RECEIPT_TYPES,
        primaryType: "HireReceipt" as const,
        message: {
            ...v1Message(receipt),
            termId: receipt.termId,
            expiresAt: BigInt(receipt.expiresAt),
        },
    };
}

/** v1's typed-data block, for recovery only. */
export function hireReceiptV1TypedData(receipt: HireReceiptV1, chainId: number) {
    return {
        domain: hireReceiptV1Domain(chainId),
        types: HIRE_RECEIPT_V1_TYPES,
        primaryType: "HireReceipt" as const,
        message: v1Message(receipt),
    };
}

/** Signs a typed-data block. The node supplies one; this module never sees a key. */
export type HireReceiptSigner = {
    address: Address;
    signTypedData(data: ReturnType<typeof hireReceiptTypedData>): Promise<Hex>;
};

/** Sign a v2 receipt for the one verifier named in `domain`. There is no way to sign a v1. */
export async function signHireReceipt(
    receipt: HireReceipt,
    domain: {chainId: number; verifyingContract: Address},
    signer: HireReceiptSigner,
): Promise<SignedHireReceipt> {
    const verifyingContract = getAddress(domain.verifyingContract);
    return {
        format: "eip712",
        receipt,
        chainId: domain.chainId,
        verifyingContract,
        agent: getAddress(signer.address),
        signature: await signer.signTypedData(
            hireReceiptTypedData(receipt, domain.chainId, verifyingContract),
        ),
    };
}

const DECIMAL = /^(0|[1-9][0-9]*)$/;
const ERC8004_REGISTRY = /^eip155:[1-9][0-9]*:0x[0-9a-fA-F]{40}$/;

function malformed(reason: string): HireReceiptVerdict {
    return {status: "malformed", reason};
}

function isBytes32(value: unknown): boolean {
    return typeof value === "string" && isHex(value) && value.length === 66;
}

/** The checks both versions share, or the reason the receipt is malformed. */
function malformedFields(signed: AnySignedHireReceipt): string | null {
    const {receipt, chainId, agent, signature} = signed;
    if (!isAddress(agent)) return "agent is not an address";
    if (!isHex(signature)) return "signature is not hex";
    if (!Number.isInteger(chainId) || chainId <= 0) return "chainId is not a chain id";
    if (receipt.agentRegistry !== "" && !ERC8004_REGISTRY.test(receipt.agentRegistry)) {
        return "agentRegistry is not eip155:<chainId>:<address>";
    }
    if (!DECIMAL.test(receipt.agentId)) return "agentId is not a decimal integer";
    if (receipt.agentRegistry === "" && receipt.agentId !== "0") {
        return "agentId without an agentRegistry";
    }
    if (!isAddress(receipt.requester)) return "requester is not an address";
    for (const key of ["payment", "requestHash", "resultHash"] as const) {
        if (!isBytes32(receipt[key])) return `${key} is not bytes32`;
    }
    if (!DECIMAL.test(receipt.paid)) return "paid is not a decimal integer";
    if (!Number.isInteger(receipt.issuedAt) || receipt.issuedAt < 0) {
        return "issuedAt is not a unix timestamp";
    }
    return null;
}

/** Narrowed by `version`; the receipt is a stranger's JSON, so nothing else is assumed. */
function isV2(signed: AnySignedHireReceipt): signed is SignedHireReceipt {
    return signed.receipt.version === 2;
}

/**
 * Recover the signer and compare it to the one the envelope declares. Either version.
 *
 * Same three outcomes as `verifyContentReceipt`, and the same conservatism: anything this cannot
 * even attempt is `malformed` with the reason. `valid` says who signed — not that the signer is the
 * agent it names, which is a chain read (see the module note), and not that the receipt is for the
 * verifier holding it or still live, which take that verifier's address and clock
 * ({@link hireReceiptIsFor}).
 */
export async function verifyHireReceipt(signed: AnySignedHireReceipt): Promise<HireReceiptVerdict> {
    if (signed.format !== "eip712") return malformed("format is not eip712");
    const version: unknown = signed.receipt.version;
    if (version !== 1 && version !== 2) return malformed(`unknown version ${String(version)}`);
    const reason = malformedFields(signed);
    if (reason !== null) return malformed(reason);
    if (isV2(signed)) {
        if (!isAddress(signed.verifyingContract)) {
            return malformed("verifyingContract is not an address");
        }
        if (!isBytes32(signed.receipt.termId)) return malformed("termId is not bytes32");
        const {expiresAt, issuedAt} = signed.receipt;
        if (!Number.isInteger(expiresAt) || expiresAt < issuedAt) {
            return malformed("expiresAt is not a unix timestamp at or after issuedAt");
        }
    }

    const declared = getAddress(signed.agent);
    let recovered: Address;
    try {
        recovered = isV2(signed)
            ? await recoverTypedDataAddress({
                  ...hireReceiptTypedData(signed.receipt, signed.chainId, signed.verifyingContract),
                  signature: signed.signature,
              })
            : await recoverTypedDataAddress({
                  ...hireReceiptV1TypedData(signed.receipt, signed.chainId),
                  signature: signed.signature,
              });
    } catch (error) {
        return malformed(error instanceof Error ? error.message : String(error));
    }
    if (recovered !== declared) return {status: "mismatch", declared, recovered};
    return {status: "valid", signer: recovered};
}

/**
 * Whether the verifier at `verifier` may act on a receipt at `nowSeconds`: it is v2, it names that
 * verifier, and it is not past `expiresAt`. The half of acceptance that needs the verifier's own
 * address and clock, which {@link verifyHireReceipt} does not have. A v1 receipt is for no one.
 */
export function hireReceiptIsFor(
    signed: AnySignedHireReceipt,
    verifier: Address,
    nowSeconds: number,
): {ok: true} | {ok: false; reason: string} {
    if (!isV2(signed)) return {ok: false, reason: "a v1 receipt names no verifier"};
    if (!isAddress(signed.verifyingContract) || !isAddress(verifier)) {
        return {ok: false, reason: "verifyingContract is not an address"};
    }
    if (getAddress(signed.verifyingContract) !== getAddress(verifier)) {
        return {
            ok: false,
            reason: `receipt is for verifier ${signed.verifyingContract}, not ${getAddress(verifier)}`,
        };
    }
    if (nowSeconds > signed.receipt.expiresAt) {
        return {ok: false, reason: `receipt expired at ${signed.receipt.expiresAt}`};
    }
    return {ok: true};
}

/**
 * Whether a receipt is about the exchange in hand: the payload the requester sent and the result it
 * received, both as parsed JSON. The half that needs no signature.
 */
export function hireReceiptMatches(
    receipt: HireReceiptFields,
    payload: unknown,
    result: unknown,
): boolean {
    return (
        hireDigest(payload) === receipt.requestHash.toLowerCase() &&
        hireDigest(result) === receipt.resultHash.toLowerCase()
    );
}
