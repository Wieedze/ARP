import {getAddress, isAddress, isHex, keccak256, recoverTypedDataAddress, type Hex} from "viem";

import {canonicalBytesRfc8785, CanonicalizationError} from "./canonicalize.js";
import {isRecord, omitPath, readArray, readPath, readString} from "./json.js";
import type {SignatureAttempt, SignatureStrategyConfidence, SignatureVerdict} from "./types.js";

/** The typed-data block as published, after narrowing. */
type Eip712Block = {
    domain: Record<string, unknown>;
    types: Record<string, {name: string; type: string}[]>;
    primaryType: string;
    fields: {name: string; type: string}[];
};

/** Everything a value strategy gets to work from. */
export type SignatureStrategyInput = {
    /** The document exactly as parsed, signature block included. */
    document: unknown;
    /** keccak256 over the RFC-8785 canonical form with `payload.excludes` applied. */
    contentHash: Hex;
    /** The struct fields the document's own `types` declares for its `primaryType`. */
    fields: readonly {name: string; type: string}[];
};

/**
 * A named way of reconstructing the values that went into the signed struct.
 *
 * The struct's field *names* are published in the document; the *values* behind
 * `provider` and `agent` are not. That gap is the reason this is a swappable
 * strategy rather than a hardcoded mapping, and the reason each one carries a
 * confidence grade.
 */
export type SignatureValueStrategy = {
    readonly id: string;
    /**
     *   - `confirmed`   — validated against live signed documents; the date and
     *                     the documents are named at the definition site.
     *   - `speculative` — plausible, never observed to recover. A speculative
     *                     strategy failing proves nothing about the document.
     */
    readonly confidence: SignatureStrategyConfidence;
    /** Returns the struct message, or null when this strategy does not apply. */
    build(input: SignatureStrategyInput): Record<string, unknown> | null;
};

const FEEDBACK_FIELDS = ["provider", "agent", "contentHash"] as const;

function hasExactFields(
    fields: readonly {name: string; type: string}[],
    expected: readonly string[],
): boolean {
    if (fields.length !== expected.length) return false;
    return expected.every((name, index) => fields[index]?.name === name);
}

function agentCaip19From(document: unknown, lowercaseRegistry: boolean): string | null {
    const agent = readPath(document, ["agent"]);
    if (!isRecord(agent)) return null;
    const chainId = agent["chainId"];
    const registry = readString(agent, "registry");
    const tokenId = agent["tokenId"];
    if (typeof chainId !== "number" || registry === null) return null;
    if (typeof tokenId !== "string" && typeof tokenId !== "number") return null;
    const address = lowercaseRegistry ? registry.toLowerCase() : registry;
    return `eip155:${chainId}/erc721:${address}/${String(tokenId)}`;
}

/**
 * The reconstruction Deep3 Labs actually signs with.
 *
 * `provider` is the provider's slug id (`provider.id`), not its display name;
 * `agent` is the CAIP-19 asset id with the registry address exactly as the
 * document writes it (checksummed). Confirmed 2026-09-16 by recovering
 * `0x27A6265e6daf8d9935A3031f2E7cDC4bDFbe2Ebe` — the signer those documents
 * declare — from all three live
 * `api.deep3.ai/.well-known/intuition/erc8004/agents/8453/{1380,2340,6649}`
 * feedback-trust-assessment documents.
 */
export const providerIdCaip19Strategy: SignatureValueStrategy = {
    id: "provider-id-caip19",
    confidence: "confirmed",
    build({document, contentHash, fields}) {
        if (!hasExactFields(fields, FEEDBACK_FIELDS)) return null;
        const providerId = readString(readPath(document, ["provider"]), "id");
        const agent = agentCaip19From(document, false);
        if (providerId === null || agent === null) return null;
        return {provider: providerId, agent, contentHash};
    },
};

/** Same shape, registry lowercased. Never observed to recover; kept because CAIP-19 casing is not universally checksummed. */
export const providerIdCaip19LowercaseStrategy: SignatureValueStrategy = {
    id: "provider-id-caip19-lowercase-registry",
    confidence: "speculative",
    build({document, contentHash, fields}) {
        if (!hasExactFields(fields, FEEDBACK_FIELDS)) return null;
        const providerId = readString(readPath(document, ["provider"]), "id");
        const agent = agentCaip19From(document, true);
        if (providerId === null || agent === null) return null;
        return {provider: providerId, agent, contentHash};
    },
};

/** Display name instead of slug. Never observed to recover. */
export const providerNameCaip19Strategy: SignatureValueStrategy = {
    id: "provider-name-caip19",
    confidence: "speculative",
    build({document, contentHash, fields}) {
        if (!hasExactFields(fields, FEEDBACK_FIELDS)) return null;
        const providerName = readString(readPath(document, ["provider"]), "name");
        const agent = agentCaip19From(document, false);
        if (providerName === null || agent === null) return null;
        return {provider: providerName, agent, contentHash};
    },
};

/** Provider homepage instead of slug. Never observed to recover. */
export const providerUrlCaip19Strategy: SignatureValueStrategy = {
    id: "provider-url-caip19",
    confidence: "speculative",
    build({document, contentHash, fields}) {
        if (!hasExactFields(fields, FEEDBACK_FIELDS)) return null;
        const providerUrl = readString(readPath(document, ["provider"]), "url");
        const agent = agentCaip19From(document, false);
        if (providerUrl === null || agent === null) return null;
        return {provider: providerUrl, agent, contentHash};
    },
};

/**
 * Tried in order. The confirmed strategy leads; the speculative ones exist so a
 * document signed with a near variant is reported as a near variant rather than
 * as an unknown.
 */
export const DEFAULT_SIGNATURE_STRATEGIES: readonly SignatureValueStrategy[] = [
    providerIdCaip19Strategy,
    providerIdCaip19LowercaseStrategy,
    providerNameCaip19Strategy,
    providerUrlCaip19Strategy,
];

export type VerifyAssessmentSignatureOptions = {
    strategies?: readonly SignatureValueStrategy[];
};

function narrowEip712(signature: unknown): Eip712Block | null {
    const eip712 = readPath(signature, ["eip712"]);
    if (!isRecord(eip712)) return null;
    const domain = eip712["domain"];
    const types = eip712["types"];
    const primaryType = readString(eip712, "primaryType");
    if (!isRecord(domain) || !isRecord(types) || primaryType === null) return null;

    const narrowedTypes: Record<string, {name: string; type: string}[]> = {};
    for (const [typeName, members] of Object.entries(types)) {
        if (!Array.isArray(members)) return null;
        const narrowedMembers: {name: string; type: string}[] = [];
        for (const member of members) {
            const name = readString(member, "name");
            const type = readString(member, "type");
            if (name === null || type === null) return null;
            narrowedMembers.push({name, type});
        }
        narrowedTypes[typeName] = narrowedMembers;
    }

    const fields = narrowedTypes[primaryType];
    if (fields === undefined) return null;
    return {domain, types: narrowedTypes, primaryType, fields};
}

function computeContentHash(document: unknown, excludes: readonly string[]): Hex | null {
    let payload: unknown = document;
    for (const path of excludes) {
        const pruned = omitPath(payload, path);
        // A declared exclusion that does not apply means we would hash a
        // different document than the provider signed. Refuse rather than guess.
        if (pruned === null) return null;
        payload = pruned;
    }
    try {
        return keccak256(canonicalBytesRfc8785(payload));
    } catch (error) {
        if (error instanceof CanonicalizationError) return null;
        throw error;
    }
}

function unverified(
    reason: string,
    declaredSigner: `0x${string}` | null,
    attempts: SignatureAttempt[] = [],
): SignatureVerdict {
    return {status: "unverified", reason, declaredSigner, attempts};
}

/**
 * Check that an assessment document's EIP-712 signature recovers to the address
 * the document itself names as the signer.
 *
 * Pure: no client, no network, no configuration. Hand it the parsed JSON a
 * provider served and it answers. This is the smallest useful unit of the
 * package and it is exported on its own for exactly that reason.
 *
 * The verdict is deliberately conservative. `verified` is returned only when
 * recovery produced the declared signer; a reconstruction this package cannot
 * perform yields `unverified` with the attempts recorded, never a guess.
 *
 * Async because recovery is: viem's `recoverTypedDataAddress` returns a promise.
 */
export async function verifyAssessmentSignature(
    document: unknown,
    options: VerifyAssessmentSignatureOptions = {},
): Promise<SignatureVerdict> {
    const signature = readPath(document, ["assessment", "signature"]);
    if (!isRecord(signature)) {
        return unverified("no signature block at assessment.signature", null);
    }

    const declaredSignerRaw = readString(signature, "signer");
    const declaredSigner =
        declaredSignerRaw !== null && isAddress(declaredSignerRaw)
            ? getAddress(declaredSignerRaw)
            : null;

    const alg = readString(signature, "alg");
    if (alg !== "EIP-712") {
        return unverified(`unsupported signature alg: ${alg ?? "absent"}`, declaredSigner);
    }
    if (declaredSigner === null) {
        return unverified("signature declares no valid signer address", null);
    }

    const value = readString(signature, "value");
    if (value === null || !isHex(value)) {
        return unverified("signature value is not hex", declaredSigner);
    }

    const eip712 = narrowEip712(signature);
    if (eip712 === null) {
        return unverified(
            "signature.eip712 is missing domain, types or primaryType",
            declaredSigner,
        );
    }

    const payload = readPath(signature, ["payload"]);
    const canonicalization = readString(payload, "canonicalization");
    if (canonicalization !== null && canonicalization !== "RFC8785") {
        return unverified(`unsupported canonicalization: ${canonicalization}`, declaredSigner);
    }
    const hashAlgorithm = readString(payload, "hash");
    if (hashAlgorithm !== null && hashAlgorithm !== "keccak256") {
        return unverified(`unsupported payload hash: ${hashAlgorithm}`, declaredSigner);
    }

    const excludes = readArray(payload, "excludes").filter(
        (entry): entry is string => typeof entry === "string",
    );
    const contentHash = computeContentHash(document, excludes);
    if (contentHash === null) {
        return unverified(
            "could not reconstruct the signed payload: a declared exclusion path is absent or the document is not canonicalisable",
            declaredSigner,
        );
    }

    const strategies = options.strategies ?? DEFAULT_SIGNATURE_STRATEGIES;
    const attempts: SignatureAttempt[] = [];
    let confirmedApplied: {strategyId: string; recovered: `0x${string}`} | null = null;

    for (const strategy of strategies) {
        const message = strategy.build({document, contentHash, fields: eip712.fields});
        if (message === null) {
            attempts.push({
                strategyId: strategy.id,
                confidence: strategy.confidence,
                recovered: null,
                error: "strategy does not apply to this document shape",
            });
            continue;
        }
        let recovered: `0x${string}`;
        try {
            recovered = await recoverTypedDataAddress({
                domain: eip712.domain,
                types: eip712.types,
                primaryType: eip712.primaryType,
                message,
                signature: value,
            });
        } catch (error) {
            attempts.push({
                strategyId: strategy.id,
                confidence: strategy.confidence,
                recovered: null,
                error: error instanceof Error ? error.message : String(error),
            });
            continue;
        }
        attempts.push({
            strategyId: strategy.id,
            confidence: strategy.confidence,
            recovered,
        });
        if (recovered === declaredSigner) {
            return {
                status: "verified",
                declaredSigner,
                recovered,
                strategyId: strategy.id,
                contentHash,
            };
        }
        if (strategy.confidence === "confirmed" && confirmedApplied === null) {
            confirmedApplied = {strategyId: strategy.id, recovered};
        }
    }

    // A reconstruction we have confirmed against live signed documents applied
    // cleanly and produced someone else. That is a tampered or mis-signed
    // document, not an unknown format — say so.
    if (confirmedApplied !== null) {
        return {
            status: "mismatch",
            declaredSigner,
            recovered: confirmedApplied.recovered,
            strategyId: confirmedApplied.strategyId,
            contentHash,
            attempts,
        };
    }

    return unverified(
        "could not reconstruct the signed payload: no confirmed strategy applies to this document's struct shape",
        declaredSigner,
        attempts,
    );
}
