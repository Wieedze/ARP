import {getAddress, isAddress, isHex, type Address, type Hex} from "viem";

import {
    DEFAULT_TIMEOUT_MS,
    defaultFetch,
    fetchWithTimeout,
    HttpError,
    type FetchLike,
} from "./http.js";
import {isRecord, readArray, readNumber, readPath, readRecord, readString} from "./json.js";
import type {
    AssessmentDocument,
    AssessmentEvidence,
    AssessmentFetch,
    AssessmentSignature,
    ProviderClaim,
} from "./types.js";

export type FetchAssessmentOptions = {
    fetch?: FetchLike;
    timeoutMs?: number;
};

const EXCERPT_LENGTH = 200;

function narrowEvidence(entries: readonly unknown[]): AssessmentEvidence[] {
    return entries.filter(isRecord).map((entry) => ({
        type: readString(entry, "type"),
        url: readString(entry, "url"),
        sha256: readString(entry, "sha256"),
    }));
}

function narrowDimensions(source: unknown): Record<string, number> | null {
    if (!isRecord(source)) return null;
    const dimensions: Record<string, number> = {};
    for (const [key, value] of Object.entries(source)) {
        if (typeof value === "number" && Number.isFinite(value)) dimensions[key] = value;
    }
    return Object.keys(dimensions).length > 0 ? dimensions : null;
}

function narrowSignature(source: unknown): AssessmentSignature | null {
    if (!isRecord(source)) return null;

    const signerRaw = readString(source, "signer");
    const signer: Address | null =
        signerRaw !== null && isAddress(signerRaw) ? getAddress(signerRaw) : null;

    const valueRaw = readString(source, "value");
    const value: Hex | null = valueRaw !== null && isHex(valueRaw) ? valueRaw : null;

    const eip712Raw = readRecord(source, "eip712");
    let eip712: AssessmentSignature["eip712"] = null;
    if (eip712Raw !== null) {
        const domain = readRecord(eip712Raw, "domain");
        const typesRaw = readRecord(eip712Raw, "types");
        const primaryType = readString(eip712Raw, "primaryType");
        if (domain !== null && typesRaw !== null && primaryType !== null) {
            const types: Record<string, {name: string; type: string}[]> = {};
            for (const [typeName, members] of Object.entries(typesRaw)) {
                if (!Array.isArray(members)) continue;
                types[typeName] = members.filter(isRecord).flatMap((member) => {
                    const name = readString(member, "name");
                    const type = readString(member, "type");
                    return name !== null && type !== null ? [{name, type}] : [];
                });
            }
            eip712 = {domain, types, primaryType};
        }
    }

    const payloadRaw = readRecord(source, "payload");
    const payload: AssessmentSignature["payload"] =
        payloadRaw === null
            ? null
            : {
                  canonicalization: readString(payloadRaw, "canonicalization"),
                  hash: readString(payloadRaw, "hash"),
                  excludes: readArray(payloadRaw, "excludes").filter(
                      (entry): entry is string => typeof entry === "string",
                  ),
              };

    return {alg: readString(source, "alg"), signer, value, eip712, payload};
}

/**
 * Narrow an untrusted assessment document into the fields this package reads.
 *
 * `raw` keeps the document exactly as parsed — the signature check hashes the
 * original bytes, so a normalised view can never be substituted for it.
 */
export function narrowAssessmentDocument(raw: unknown): AssessmentDocument {
    const agentRaw = readRecord(raw, "agent");
    const tokenIdRaw = agentRaw === null ? null : agentRaw["tokenId"];
    const providerRaw = readRecord(raw, "provider");
    const assessment = readRecord(raw, "assessment");

    return {
        agent:
            agentRaw === null
                ? null
                : {
                      chainId: readNumber(agentRaw, "chainId"),
                      tokenId:
                          typeof tokenIdRaw === "string" || typeof tokenIdRaw === "number"
                              ? String(tokenIdRaw)
                              : null,
                      registry: readString(agentRaw, "registry"),
                  },
        provider:
            providerRaw === null
                ? null
                : {
                      id: readString(providerRaw, "id"),
                      name: readString(providerRaw, "name"),
                      url: readString(providerRaw, "url"),
                  },
        score: readNumber(assessment, "score"),
        scoreScale: readString(assessment, "scoreScale"),
        riskLevel: readString(assessment, "riskLevel"),
        lastUpdated: readString(assessment, "lastUpdated"),
        dimensions: narrowDimensions(readPath(assessment, ["dimensions"])),
        evidence: narrowEvidence(readArray(assessment, "evidence")),
        freshness:
            readRecord(assessment, "freshness") === null
                ? null
                : {
                      validUntil: readString(readRecord(assessment, "freshness"), "validUntil"),
                      refreshIntervalSeconds: readNumber(
                          readRecord(assessment, "freshness"),
                          "refreshIntervalSeconds",
                      ),
                  },
        signature: narrowSignature(readPath(assessment, ["signature"])),
        raw,
    };
}

/**
 * Follow a claim's resolver URL and parse what comes back.
 *
 * The URL is `ProviderClaim.resolverUrl` — the live document. It is never the
 * pinned immutable URI, which points at the snapshot the atom was minted from.
 *
 * Never throws. A provider that is down, slow, serving HTML behind a login wall,
 * or serving malformed JSON is a fact about that provider, and the caller needs
 * it as data rather than as an exception that takes the whole profile with it.
 */
export async function fetchAssessment(
    claim: Pick<ProviderClaim, "resolverUrl">,
    options: FetchAssessmentOptions = {},
): Promise<AssessmentFetch> {
    const url = claim.resolverUrl;
    if (url === null || url.length === 0) {
        return {status: "error", url: null, error: {kind: "no-resolver-url"}};
    }

    const fetchImpl = options.fetch ?? defaultFetch();
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

    let response: Response;
    try {
        response = await fetchWithTimeout(
            fetchImpl,
            url,
            {method: "GET", headers: {accept: "application/json"}},
            timeoutMs,
        );
    } catch (error) {
        if (error instanceof HttpError && error.kind === "timeout") {
            return {status: "error", url, error: {kind: "timeout", timeoutMs}};
        }
        return {
            status: "error",
            url,
            error: {
                kind: "network",
                message: error instanceof Error ? error.message : String(error),
            },
        };
    }

    if (!response.ok) {
        return {
            status: "error",
            url,
            error: {kind: "http", status: response.status, statusText: response.statusText},
        };
    }

    let body: string;
    try {
        body = await response.text();
    } catch (error) {
        return {
            status: "error",
            url,
            error: {
                kind: "network",
                message: error instanceof Error ? error.message : String(error),
            },
        };
    }

    let parsed: unknown;
    try {
        parsed = JSON.parse(body);
    } catch (error) {
        const contentType = response.headers.get("content-type");
        const looksLikeMarkup = /^\s*</.test(body);
        if (looksLikeMarkup) {
            return {
                status: "error",
                url,
                error: {
                    kind: "not-json",
                    contentType,
                    excerpt: body.slice(0, EXCERPT_LENGTH),
                },
            };
        }
        return {
            status: "error",
            url,
            error: {
                kind: "malformed",
                message: error instanceof Error ? error.message : String(error),
            },
        };
    }

    if (!isRecord(parsed)) {
        return {
            status: "error",
            url,
            error: {kind: "malformed", message: "document root is not a JSON object"},
        };
    }

    return {
        status: "ok",
        url,
        httpStatus: response.status,
        document: narrowAssessmentDocument(parsed),
    };
}
