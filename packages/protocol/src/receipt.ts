/**
 * The receipt a node signs when it serves a tool's content, and the check anyone can run on it.
 *
 * Pure. No key, no transport, no clock of its own — `signContentReceipt` takes a signing callback
 * and `verifyContentReceipt` takes the bytes. So this module can be tested without a network and
 * without ever holding a secret, which is the same line ADR `0038` draws for the rest of the
 * package: the protocol layer describes, the node acts.
 *
 * ## What a receipt is for
 *
 * `tasks/31`. A declaration — "this agent used this tool" — is the agent's word about the agent,
 * which `docs/14` puts on the bottom rung. If ARP served the bytes, ARP is a second party to the
 * exchange and can say so:
 *
 * ```
 * the node's receipt    "I served this file to this key at T"    signed by the node
 * the runtime's log     "I invoked this skill at T"              written by the hook
 * ```
 *
 * Two records, two parties, interests that do not coincide. **It attests access, never use** —
 * whether the bytes changed what the agent did stays unobservable, and nothing here pretends
 * otherwise.
 *
 * **A receipt can only add.** A declaration already stands on its own: somebody identified paid to
 * make it. Distrust the signer and you ignore the receipt and have exactly what you had before.
 * That is why the key is uninteresting to attack and why nothing routes through it.
 *
 * ## Verification is the deliverable, and it has two halves
 *
 * A receipt nobody else can check is a log entry. So there are two checks, and both matter:
 *
 * - `verifyContentReceipt` — who signed it, by EIP-712 recovery.
 * - `receiptMatchesContent` — whether the bytes in hand are the bytes it names, by sha256.
 *
 * The second is what makes the receipt re-derivable by a stranger: fetch `url`'s repository at
 * `path`, run `sha256sum`, compare. **sha256 and not keccak256 for exactly that reason** — a third
 * party has `sha256sum` on their machine and does not have to trust a library of ours.
 * `measure/skill-content-duplicates.ts` made the same argument for git's blob sha.
 *
 * ## Why `path` is in the payload
 *
 * Measured 2026-10-29 by `scripts/measure/skill-layouts.ts`: of 662 catalogued skills, **46 exist
 * at several paths inside one repository** (`.agents/skills/<skill>/` beside
 * `.claude/skills/<skill>/`, byte-identical), 2 more at paths that differ, and 19 distinct layouts
 * across 31 repositories.
 * An atom names a repository and a skill; it does not name a file. Without `path` a verifier cannot
 * find the bytes the digest is over, so the second half of the verification would not exist.
 *
 * ## Why EIP-712 and not a signed JSON string
 *
 * `tasks/31` §5.2 sketched EIP-191 over a canonical encoding. EIP-712 is used instead:
 *
 * - **Domain separation is the replay guard that actually matters here.** An atom id is a pure
 *   function of its URL (ADR `0054`), so *the same tool has the same atom id on 13579 and on 1155*.
 *   Without the chain in the domain, a testnet receipt verifies as a mainnet receipt. The domain
 *   carries `chainId`, so it cannot.
 * - It avoids hand-rolling canonical JSON. `canonicalize.ts` exists and is correct, but key order,
 *   unicode and number formatting are a standing footgun, and EIP-712's encoding is settled.
 * - It is the same mechanism `signature.ts` already verifies for third-party documents and
 *   `agent-import.ts` already signs with. One pattern in the repository rather than two.
 *
 * As in `agent-import.ts` there is deliberately **no `verifyingContract`**: no contract checks this
 * signature, and naming one would imply an on-chain check that does not exist.
 * `.claude/rules/security.md` asks for nonce + chainId + verifying contract; the first two are
 * here and the third is absent with cause.
 *
 * The honest note on the nonce: replaying a receipt buys an attacker nothing, because it attests
 * access and `resolveInvocations` neither weights repeats nor sums them (ADR `0046`). It is here so
 * that two fetches in the same second are two distinct records rather than one signature twice.
 */
import {
    getAddress,
    isAddress,
    isHex,
    recoverTypedDataAddress,
    sha256,
    type Address,
    type Hex,
} from "viem";

/** What the node signs. Field order is the struct's order and changing it changes every hash. */
export const CONTENT_RECEIPT_TYPES = {
    ContentReceipt: [
        {name: "atom", type: "bytes32"},
        {name: "url", type: "string"},
        {name: "path", type: "string"},
        {name: "digest", type: "bytes32"},
        {name: "to", type: "address"},
        {name: "servedAt", type: "uint256"},
        {name: "nonce", type: "bytes32"},
    ],
} as const;

/** The address that stands for "served to nobody in particular". */
export const UNAUTHENTICATED = "0x0000000000000000000000000000000000000000" as const;

/**
 * The EIP-712 domain, bound to the chain the served tool's atom lives on.
 *
 * Not the node's chain and not the caller's: the atom id is the subject of the receipt, and it is
 * the thing that would otherwise be ambiguous across chains.
 */
export function contentReceiptDomain(chainId: number) {
    return {name: "ARP Content Receipt", version: "1", chainId} as const;
}

/** The claim itself, with no signature attached. */
export type ContentReceipt = {
    /** The tool's atom id, as the chain computes it from the normalised URL (ADR `0054`). */
    atom: Hex;
    /** The normalised tool URL, so a verifier needs no catalogue of ours to find the origin. */
    url: string;
    /** The path inside the repository whose bytes were served. */
    path: string;
    /** sha256 of those exact bytes. */
    digest: Hex;
    /** The caller as it authenticated, or null when it did not. */
    to: Address | null;
    /** Unix seconds. */
    servedAt: number;
    nonce: Hex;
};

/** A receipt as it travels: the claim, who claims to have signed it, and the signature. */
export type SignedContentReceipt = {
    receipt: ContentReceipt;
    /** The chain whose atom id `receipt.atom` is — the domain's `chainId`. */
    chainId: number;
    /** The address the node says signed. Recovery is what confirms it. */
    node: Address;
    signature: Hex;
};

export type ReceiptVerdict =
    | {
          status: "valid";
          signer: Address;
          /** True when `to` is the zero address: the receipt corroborates nobody. */
          namesNobody: boolean;
      }
    | {status: "mismatch"; declared: Address; recovered: Address}
    | {status: "malformed"; reason: string};

/** sha256 over the bytes a node served. What `sha256sum` prints, hex, `0x`-prefixed. */
export function contentDigest(bytes: Uint8Array): Hex {
    return sha256(bytes);
}

/** The typed-data block, for signing or for recovery. Exported so a verifier can rebuild it. */
export function contentReceiptTypedData(receipt: ContentReceipt, chainId: number) {
    return {
        domain: contentReceiptDomain(chainId),
        types: CONTENT_RECEIPT_TYPES,
        primaryType: "ContentReceipt" as const,
        message: {
            atom: receipt.atom,
            url: receipt.url,
            path: receipt.path,
            digest: receipt.digest,
            to: receipt.to ?? UNAUTHENTICATED,
            servedAt: BigInt(receipt.servedAt),
            nonce: receipt.nonce,
        },
    };
}

/** Signs a typed-data block. The node supplies one; this module never sees a key. */
export type TypedDataSigner = {
    address: Address;
    signTypedData(data: ReturnType<typeof contentReceiptTypedData>): Promise<Hex>;
};

/**
 * Produce a signed receipt.
 *
 * The signer is passed in rather than constructed, so the key stays in whatever process holds it.
 * `tasks/31` §9: the key that signs a receipt must not be a key that can move value.
 */
export async function signContentReceipt(
    receipt: ContentReceipt,
    chainId: number,
    signer: TypedDataSigner,
): Promise<SignedContentReceipt> {
    const data = contentReceiptTypedData(receipt, chainId);
    return {
        receipt,
        chainId,
        node: getAddress(signer.address),
        signature: await signer.signTypedData(data),
    };
}

function malformed(reason: string): ReceiptVerdict {
    return {status: "malformed", reason};
}

/**
 * Recover the signer and compare it to the one the receipt declares.
 *
 * Conservative in the same way `verifyAssessmentSignature` is: `valid` means recovery produced the
 * declared address, `mismatch` means it produced a different one, and anything this cannot even
 * attempt is `malformed` with the reason rather than a guess. A caller decides which signers it
 * accepts — nothing here assumes there is one node.
 */
export async function verifyContentReceipt(signed: SignedContentReceipt): Promise<ReceiptVerdict> {
    const {receipt, chainId, node, signature} = signed;
    if (!isAddress(node)) return malformed("node is not an address");
    if (!isHex(signature)) return malformed("signature is not hex");
    if (!isHex(receipt.atom) || receipt.atom.length !== 66) return malformed("atom is not bytes32");
    if (!isHex(receipt.digest) || receipt.digest.length !== 66) {
        return malformed("digest is not bytes32");
    }
    if (!isHex(receipt.nonce) || receipt.nonce.length !== 66)
        return malformed("nonce is not bytes32");
    if (receipt.to !== null && !isAddress(receipt.to)) return malformed("to is not an address");
    if (!Number.isInteger(receipt.servedAt) || receipt.servedAt < 0) {
        return malformed("servedAt is not a unix timestamp");
    }
    if (!Number.isInteger(chainId) || chainId <= 0) return malformed("chainId is not a chain id");

    const declared = getAddress(node);
    let recovered: Address;
    try {
        recovered = await recoverTypedDataAddress({
            ...contentReceiptTypedData(receipt, chainId),
            signature,
        });
    } catch (error) {
        return malformed(error instanceof Error ? error.message : String(error));
    }

    if (recovered !== declared) return {status: "mismatch", declared, recovered};
    return {
        status: "valid",
        signer: recovered,
        // An unauthenticated fetch gets a receipt that corroborates nothing, on purpose: the index
        // stays open to anyone and the receipt is what has a price. `tasks/31` §5.3.
        namesNobody: receipt.to === null || getAddress(receipt.to) === UNAUTHENTICATED,
    };
}

/**
 * Whether the bytes in hand are the bytes the receipt names.
 *
 * The half of the verification that needs no signature and no library of ours: fetch the origin,
 * hash it, compare. A stranger can run this against `url` and `path` without asking us anything,
 * which is `docs/14`'s test for a signal and the reason the digest is sha256.
 *
 * It says nothing about *when* — a repository can change under a path, and then an honest receipt
 * stops matching. That is a limit of pinning content by hash rather than by commit, and it is why a
 * failure here is not evidence of a forgery.
 */
export function receiptMatchesContent(receipt: ContentReceipt, bytes: Uint8Array): boolean {
    return contentDigest(bytes) === receipt.digest.toLowerCase();
}
