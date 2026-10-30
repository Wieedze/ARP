import {getAddress, hashStruct, isAddress, isHex, stringToHex, type Address, type Hex} from "viem";

import {canonicalizeRfc8785} from "../canonicalize.js";
import {
    encodeCreateAtom as encodeAtom,
    encodeCreateTriple as encodeTriple,
    type MultiVaultReads,
} from "../declare/multivault.js";
import type {PreparedCall} from "../declare/types.js";

/**
 * The delegation register's write side (`docs/tasks/37` 37b): the document pinned for a signed
 * delegation, the check that it was really signed, and the plan that indexes it on Intuition.
 *
 * The shape is Hourglass's (ADR `0092` item 7), so one reader finds both products' delegations:
 *
 * ```
 * (delegator CAIP-10) —delegate to→   (delegate CAIP-10)       the relationship triple
 * (ipfs document)     —in context of→ (the relationship triple) the binding
 * ```
 *
 * Plans only, never a send (ADR `0038`). The sponsoring service and the operator's own wallet are
 * the two signers, and the plan is the same for both, which is what keeps ADR `0092` item 6 true:
 * unplugging the service costs the operator a fee, never the capability.
 */

/**
 * The EIP-712 types the MetaMask Delegation Framework signs, copied from
 * `@metamask/smart-accounts-kit@1.6.0` `SIGNABLE_DELEGATION_TYPED_DATA`, with the domain
 * `{ name: "DelegationManager", version: "1", chainId, verifyingContract: delegationManager }` from
 * its `prepareSignDelegationTypedData`. The struct hash is what `DelegationManager.getDelegationHash`
 * returns and what `disabledDelegations` is keyed by.
 */
export const DELEGATION_TYPES = {
    Caveat: [
        {name: "enforcer", type: "address"},
        {name: "terms", type: "bytes"},
    ],
    Delegation: [
        {name: "delegate", type: "address"},
        {name: "delegator", type: "address"},
        {name: "authority", type: "bytes32"},
        {name: "caveats", type: "Caveat[]"},
        {name: "salt", type: "uint256"},
    ],
} as const;

/**
 * A signed delegation as it travels in JSON, in the kit's own shape: `@metamask/smart-accounts-kit`
 * 1.6 types `salt` as `Hex`, and `apps/web/src/services/delegation.ts` stores it that way.
 */
export type DelegationJson = {
    delegate: Address;
    delegator: Address;
    authority: Hex;
    caveats: {enforcer: Address; terms: Hex; args: Hex}[];
    salt: Hex;
    signature: Hex;
};

/** Where a delegation was signed: the chain and the `DelegationManager` in its domain. */
export type DelegationDomain = {chainId: number; delegationManager: Address};

/**
 * A delegation from untrusted JSON, or the reason it is not one. Addresses come back checksummed,
 * so the document built from them is one byte sequence whatever case the sender used.
 */
export function parseDelegation(value: unknown): DelegationJson | {error: string} {
    if (typeof value !== "object" || value === null) return {error: "delegation is not an object"};
    const d = value as Record<string, unknown>; // An object, checked above; every field is narrowed below.
    for (const key of ["delegate", "delegator"] as const) {
        if (typeof d[key] !== "string" || !isAddress(d[key]))
            return {error: `${key} is not an address`};
    }
    if (typeof d.authority !== "string" || !isHex(d.authority) || d.authority.length !== 66) {
        return {error: "authority is not bytes32"};
    }
    if (typeof d.salt !== "string" || !isHex(d.salt) || d.salt.length < 3 || d.salt.length > 66) {
        return {error: "salt is not a uint256 in hex"};
    }
    if (typeof d.signature !== "string" || !isHex(d.signature) || d.signature.length < 4) {
        return {error: "signature is not hex"};
    }
    if (!Array.isArray(d.caveats)) return {error: "caveats is not an array"};
    const caveats: DelegationJson["caveats"] = [];
    for (const raw of d.caveats as unknown[]) {
        if (typeof raw !== "object" || raw === null) return {error: "a caveat is not an object"};
        const c = raw as Record<string, unknown>; // An object, checked above; narrowed field by field.
        if (typeof c.enforcer !== "string" || !isAddress(c.enforcer)) {
            return {error: "a caveat's enforcer is not an address"};
        }
        if (typeof c.terms !== "string" || !isHex(c.terms))
            return {error: "a caveat's terms are not hex"};
        const args = c.args ?? "0x";
        if (typeof args !== "string" || !isHex(args)) return {error: "a caveat's args are not hex"};
        caveats.push({enforcer: getAddress(c.enforcer), terms: c.terms, args});
    }
    // An empty caveat list is an unrestricted delegation; the kit refuses to sign one by default and
    // nothing ARP publishes should index one as a guard rail.
    if (caveats.length === 0) return {error: "a delegation without caveats is not published"};
    return {
        // Both checked by `isAddress` in the loop above, which TypeScript cannot carry out of it.
        delegate: getAddress(d.delegate as string),
        delegator: getAddress(d.delegator as string),
        authority: d.authority,
        caveats,
        salt: d.salt,
        signature: d.signature,
    };
}

/** The typed-data block the delegator signed, for recovery or for EIP-1271. */
export function delegationTypedData(delegation: DelegationJson, domain: DelegationDomain) {
    return {
        domain: {
            name: "DelegationManager",
            version: "1",
            chainId: domain.chainId,
            verifyingContract: domain.delegationManager,
        },
        types: DELEGATION_TYPES,
        primaryType: "Delegation" as const,
        message: {
            delegate: delegation.delegate,
            delegator: delegation.delegator,
            authority: delegation.authority,
            // `args` is not signed: it is supplied at redemption, so it is left out of the hash.
            caveats: delegation.caveats.map(({enforcer, terms}) => ({enforcer, terms})),
            salt: BigInt(delegation.salt),
        },
    };
}

/** The delegation hash, as `DelegationManager.getDelegationHash` computes it. */
export function delegationHash(delegation: DelegationJson): Hex {
    const {types, message} = delegationTypedData(delegation, {
        chainId: 1,
        delegationManager: "0x0000000000000000000000000000000000000000",
    });
    // The struct hash does not involve the domain, so any domain gives the same value here.
    return hashStruct({data: message, primaryType: "Delegation", types});
}

/**
 * Checks a signature against the delegator's address, EOA or smart account. A viem
 * `PublicClient.verifyTypedData` satisfies it: it recovers for an EOA and calls EIP-1271's
 * `isValidSignature` on a deployed contract.
 */
export type TypedDataVerifier = (
    args: ReturnType<typeof delegationTypedData> & {address: Address; signature: Hex},
) => Promise<boolean>;

/**
 * Whether the delegator signed this delegation. The relay's first step, and nothing is pinned or
 * written before it (ADR `0092` item 2). A verifier that throws is a refusal: an unverifiable
 * delegation is not published.
 */
export async function verifyDelegationSignature(
    delegation: DelegationJson,
    domain: DelegationDomain,
    verify: TypedDataVerifier,
): Promise<boolean> {
    try {
        return await verify({
            ...delegationTypedData(delegation, domain),
            address: delegation.delegator,
            signature: delegation.signature,
        });
    } catch {
        return false;
    }
}

/** A CAIP-10 account URI, checksummed, in the form Hourglass writes (`caip10:eip155:<chain>:<address>`). */
export function caip10AccountUri(chainId: number, address: Address): string {
    return `caip10:eip155:${chainId}:${getAddress(address)}`;
}

/** The name every ARP delegation document carries. Generic on purpose, like Hourglass's. */
export const DELEGATION_DOCUMENT_NAME = "ARP delegation";

/**
 * The JSON pinned to IPFS for a delegation, as the exact string to pin.
 *
 * A schema.org Thing, so Intuition's indexer reads its name, carrying the whole signed struct.
 * **Canonical (RFC 8785)**, because Hourglass found that a different key order pins a different CID,
 * and a different CID is a different atom: the same delegation published twice would be two.
 */
export function delegationDocument(delegation: DelegationJson, domain: DelegationDomain): string {
    return canonicalizeRfc8785({
        "@context": "https://schema.org",
        "@type": "Thing",
        name: DELEGATION_DOCUMENT_NAME,
        description: `A MetaMask delegation from ${delegation.delegator} to ${delegation.delegate} on chain ${domain.chainId}, with ${delegation.caveats.length} caveat${delegation.caveats.length === 1 ? "" : "s"}.`,
        chainId: domain.chainId,
        delegationManager: getAddress(domain.delegationManager),
        delegationHash: delegationHash(delegation),
        delegation,
    });
}

/** The two predicates, read from the graph before the first write (`rules/portability.md`). */
export type DelegationPredicates = {delegateTo: Hex; inContextOf: Hex};

export class PredicateMissingError extends Error {
    constructor(
        readonly label: string,
        readonly termId: Hex,
    ) {
        super(
            `predicate "${label}" (${termId}) is not on this chain; read it from the graph first`,
        );
        this.name = "PredicateMissingError";
    }
}

export type PublishDelegationPlan = {
    calls: PreparedCall[];
    /** Term ids already on the chain, so no call was planned for them. Republishing is a no-op. */
    existingTerms: Hex[];
    totalValue: bigint;
    chainId: number;
    terms: {
        delegator: Hex;
        delegate: Hex;
        document: Hex;
        relationship: Hex;
        context: Hex;
    };
};

/**
 * The unsigned calls that index a pinned delegation document on Intuition.
 *
 * Each term is skipped when it already exists (`isTermCreated`), so the plan is idempotent: term ids
 * are content-addressed, and publishing one delegation twice writes nothing the second time (ADR
 * `0092` item 4).
 *
 * Each created term is born with a position, `cost + birthDeposit` (ADR `0053`); the deposit
 * defaults to the chain's `minDeposit`, read. Calls are in execution order: an atom before the
 * triple that references it, the relationship before the binding that references it.
 */
export async function planPublishDelegation(params: {
    delegation: DelegationJson;
    domain: DelegationDomain;
    /** `ipfs://…` of {@link delegationDocument}, as the pinning service returned it. */
    documentUri: string;
    predicates: DelegationPredicates;
    reads: MultiVaultReads;
    birthDeposit?: bigint;
}): Promise<PublishDelegationPlan> {
    const {delegation, domain, documentUri, predicates, reads} = params;
    if (!documentUri.startsWith("ipfs://")) {
        throw new Error(`documentUri must be ipfs://, got "${documentUri.slice(0, 80)}"`);
    }
    for (const [label, id] of [
        ["delegate to", predicates.delegateTo],
        ["in context of", predicates.inContextOf],
    ] as const) {
        if (!(await reads.termExists(id))) throw new PredicateMissingError(label, id);
    }

    const [atomCost, tripleCost, birthDeposit] = await Promise.all([
        reads.atomCost(),
        reads.tripleCost(),
        params.birthDeposit ?? reads.minDeposit(),
    ]);
    const calls: PreparedCall[] = [];
    const existingTerms: Hex[] = [];

    async function atom(uri: string, label: string): Promise<Hex> {
        const data = stringToHex(uri);
        const id = await reads.atomId(data);
        if (await reads.termExists(id)) {
            existingTerms.push(id);
            return id;
        }
        const assets = atomCost + birthDeposit;
        const preview = await reads.previewAtomCreate(id, assets);
        calls.push({
            kind: "create-atom",
            chainId: reads.chainId,
            to: reads.address,
            value: assets,
            data: encodeAtom(data, assets),
            why: `create the ${label} atom ${uri}`,
            preview: {shares: preview.shares, assetsAfterFees: preview.assetsAfterFees},
        });
        return id;
    }

    async function triple(s: Hex, p: Hex, o: Hex, label: string): Promise<Hex> {
        const id = await reads.tripleId(s, p, o);
        if (await reads.termExists(id)) {
            existingTerms.push(id);
            return id;
        }
        const assets = tripleCost + birthDeposit;
        const preview = await reads.previewTripleCreate(id, assets);
        calls.push({
            kind: "create-triple",
            chainId: reads.chainId,
            to: reads.address,
            value: assets,
            data: encodeTriple(s, p, o, assets),
            why: `create the ${label} triple`,
            preview: {shares: preview.shares, assetsAfterFees: preview.assetsAfterFees},
        });
        return id;
    }

    const delegator = await atom(
        caip10AccountUri(domain.chainId, delegation.delegator),
        "delegator",
    );
    const delegate = await atom(caip10AccountUri(domain.chainId, delegation.delegate), "delegate");
    const document = await atom(documentUri, "document");
    const relationship = await triple(delegator, predicates.delegateTo, delegate, "delegate to");
    const context = await triple(document, predicates.inContextOf, relationship, "in context of");

    return {
        calls,
        existingTerms,
        totalValue: calls.reduce((sum, call) => sum + call.value, 0n),
        chainId: reads.chainId,
        terms: {delegator, delegate, document, relationship, context},
    };
}
