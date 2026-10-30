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
 * `docs/tasks/31`. A declaration — "this agent used this tool" — is the agent's word about the agent,
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
 * That holds for a declaration the agent pays for itself, which is this path. ADR `0094` makes a
 * receipt the condition of an ARP-sponsored deposit and of the _proven_ label; that refusal belongs
 * to the sponsoring service, which is not built.
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
 * `docs/tasks/31` §5.2 sketched EIP-191 over a canonical encoding. EIP-712 is used instead:
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

/**
 * What a caller signs to be named in a receipt.
 *
 * **The caller supplies the nonce and the node signs over it**, which is what makes this stateless
 * without being replayable into a second record. Replaying a request signature produces a
 * **byte-identical receipt** — same atom, same caller, same nonce — so it is the same receipt rather
 * than a new one, and a reader counting receipts counts one. A server-issued challenge would need
 * state for no gain; a bare timestamp would leave a window.
 *
 * It is also why **a third party whose signer the reader does not accept** cannot manufacture
 * receipts in somebody else's name: the only thing a stolen request signature buys is a copy of a
 * receipt that already exists. It is not a bound on a node the reader *does* accept — a receipt
 * carries no caller signature, so any node can put any address in `to` and a verifier takes its
 * word. That is coherent with constraint 4 rather than a hole in it: accepting a signer is
 * accepting what it says about who it served.
 */
export const CONTENT_REQUEST_TYPES = {
    ContentRequest: [
        {name: "atom", type: "bytes32"},
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

/** The domain a caller's request is signed under. Same separation, same reasons. */
export function contentRequestDomain(chainId: number) {
    return {name: "ARP Content Request", version: "1", chainId} as const;
}

/** The typed-data block a caller signs. Exported so a caller can build it without this package. */
export function contentRequestTypedData(atom: Hex, nonce: Hex, chainId: number) {
    return {
        domain: contentRequestDomain(chainId),
        types: CONTENT_REQUEST_TYPES,
        primaryType: "ContentRequest" as const,
        message: {atom, nonce},
    };
}

/**
 * Who asked, recovered from their signature, or `null` when the request does not identify anyone.
 *
 * `null` is a served state and not an error: an unauthenticated fetch gets the bytes and a receipt
 * that corroborates nobody (`docs/tasks/31` §5.3). The index stays open to anyone; the receipt is what
 * has a price.
 */
export async function recoverContentRequester(
    atom: Hex,
    nonce: Hex,
    chainId: number,
    signature: Hex,
): Promise<Address | null> {
    if (!isHex(signature) || signature.length < 132) return null;
    try {
        return await recoverTypedDataAddress({
            ...contentRequestTypedData(atom, nonce, chainId),
            signature,
        });
    } catch {
        return null;
    }
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
 * `docs/tasks/31` §9: the key that signs a receipt must not be a key that can move value.
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
        // stays open to anyone and the receipt is what has a price. `docs/tasks/31` §5.3.
        namesNobody: receipt.to === null || getAddress(receipt.to) === UNAUTHENTICATED,
    };
}

/** What a receipt adds to a declaration made by a given address. */
export type Corroboration =
    /** The signer differs from the declarer AND the reader named it as one it accepts. */
    | {status: "second-party"; signer: Address}
    /**
     * The signer differs from the declarer and the reader does not know it.
     *
     * **This is not "two parties".** A node an operator installs generates its own key
     * (`apps/mcp/src/content.ts`), so its address differs from that operator's agent key while the
     * same hand holds both. Addresses cannot tell that apart from a genuinely separate node, and
     * saying "second-party" here was reporting the strongest verdict for the weakest case.
     */
    | {status: "unknown-signer"; signer: Address}
    /** The signer IS the declaring address. One key, and the only same-hand case that is visible. */
    | {status: "self-signed"; signer: Address}
    /** The receipt is about a different caller than the one who declared. */
    | {status: "other-caller"; servedTo: Address}
    /** The fetch was unauthenticated, so the receipt names no caller at all. */
    | {status: "names-nobody"};

/**
 * What a receipt is worth **to a reader**, given who made the declaration and which signers the
 * reader accepts.
 *
 * ADR `0080`: both the node an operator installs and a node somebody else runs hold a key and
 * sign, so a receipt's value is not a property of the receipt.
 *
 * ```
 * receipt.to     the caller the node served
 * signer         who signed, recovered by `verifyContentReceipt`
 * declaredBy     the address that wrote the edge on chain
 * accepted       the signers THIS reader recognises. Empty is the honest default
 * ```
 *
 * ## Why `accepted` exists, and why the first version of this was wrong
 *
 * The first version returned `second-party` whenever the signer differed from the declarer. In the
 * shipped configuration that is **every locally-served receipt**: the node generates a fresh key,
 * the caller signs with another, and the declaring address is a third. Three keys, one operator,
 * and the label said two parties. `self-signed` was unreachable except by deliberately configuring
 * `ARP_RECEIPT_KEY` to the declaring key, which nobody will do.
 *
 * The mistake was comparing **keys** where ADR `0080` argues about **hands**, and that cannot be
 * closed by a better comparison: an operator-run node's key is unlinkable to their agent's key.
 * Nothing in a receipt distinguishes it from a node somebody else runs.
 *
 * What does distinguish them is **the reader**, which is constraint 4 of the ADR and was already
 * written down: _a reader decides which signers it accepts, the same way ARP's index already names
 * the attestor it reads through._ So that decision is a parameter. With no `accepted` list a
 * reader gets `unknown-signer` and the truth: this may be a second party, and it may be the
 * operator's own node, and the receipt cannot say.
 *
 * ## It reports and never refuses
 *
 * The user's reasoning, and it is why none of these is an error: a forged local receipt costs the
 * agent the price of the claim and earns it a reputation on a tool it never used, which is worth
 * nothing the day somebody picks an agent by that reputation. A status, never a weight — ADR
 * `0046` composes no score, and this is the same shape as the distinct-declarer count and the
 * declarer-creator overlap in `docs/tasks/31` §8.
 *
 * Hand it a `signer` that came from a `valid` verdict. A signer this never checked is an address
 * from the envelope, and comparing addresses nobody recovered answers a different question.
 */
export function corroborationOf(
    receipt: ContentReceipt,
    signer: Address,
    declaredBy: Address,
    accepted: readonly Address[] = [],
): Corroboration {
    const served = receipt.to === null ? UNAUTHENTICATED : getAddress(receipt.to);
    if (served === UNAUTHENTICATED) return {status: "names-nobody"};

    const declarer = getAddress(declaredBy);
    // A genuine receipt about somebody else's fetch. Without this the easiest forgery in the
    // system is to present a stranger's valid receipt.
    if (served !== declarer) return {status: "other-caller", servedTo: served};

    const who = getAddress(signer);
    if (who === declarer) return {status: "self-signed", signer: declarer};
    // `isAddress` before `getAddress`, because `getAddress` throws and every other input to this
    // function is REPORTED rather than thrown. A caller handing it a user-supplied list would get
    // an exception where the module's whole contract is a verdict.
    if (accepted.some((address) => isAddress(address) && getAddress(address) === who)) {
        return {status: "second-party", signer: who};
    }
    return {status: "unknown-signer", signer: who};
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
