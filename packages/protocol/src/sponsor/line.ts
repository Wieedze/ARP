import {getAddress, isAddress, isHex, recoverTypedDataAddress, type Address, type Hex} from "viem";

import {isUsageOutcome, isUsageReason, type UsageOutcome, type UsageReason} from "../declare/usage-context.js";

/**
 * What an agent signs to have ARP's sponsoring service write one line about a tool it used (ADR `0144`):
 * form B, paid by the service, with a position in the agent's own name on each level.
 *
 * "Agent `agentId`, held by `agent`, says it used `tool`, in `domain`, with this outcome and reason,
 * before `expiresAt`." **Nothing here proves the use**, which is the difference from a sponsored
 * deposit: a failure the hook noted has no receipt. So a line is the agent's word, and it is bounded by
 * daily caps and the budget rather than by a proof. Testnet 13579 only.
 *
 * **Nothing on chain checks this signature**, so the domain has no `verifyingContract`, as in
 * `request.ts`. The service spends each `nonce` once, in its ledger.
 */
export const LINE_REQUEST_TYPES = {
    LineRequest: [
        {name: "agent", type: "address"},
        {name: "agentRegistry", type: "string"},
        {name: "agentId", type: "string"},
        {name: "tool", type: "bytes32"},
        {name: "domain", type: "string"},
        {name: "outcome", type: "string"},
        {name: "reason", type: "string"},
        {name: "nonce", type: "bytes32"},
        {name: "expiresAt", type: "uint256"},
    ],
} as const;

export const LINE_MAX_TTL_SECONDS = 3_600;
/** Longer than any category in the tree. Free text is refused later by the tree itself. */
export const LINE_MAX_DOMAIN_LENGTH = 64;

export type LineRequest = {
    /** The address that holds the agent, and that receives the positions. */
    agent: Address;
    agentRegistry: string;
    agentId: string;
    /** The tool's atom. */
    tool: Hex;
    /** A category under `tool`, or `""` for none. */
    domain: string;
    outcome: UsageOutcome;
    /** Only with `failed`. `""` for none. */
    reason: UsageReason | "";
    nonce: Hex;
    /** Unix seconds. */
    expiresAt: number;
};

export type SignedLineRequest = {request: LineRequest; chainId: number; signature: Hex};

export type LineRequestVerdict =
    | {status: "valid"; address: Address}
    | {status: "mismatch"; declared: Address; recovered: Address}
    | {status: "expired"; expiresAt: number}
    | {status: "malformed"; reason: string};

export function lineRequestTypedData(request: LineRequest, chainId: number) {
    return {
        domain: {name: "ARP Line Request", version: "1", chainId} as const,
        types: LINE_REQUEST_TYPES,
        primaryType: "LineRequest" as const,
        message: {...request, expiresAt: BigInt(request.expiresAt)},
    };
}

export type LineRequestSigner = {
    signTypedData(data: ReturnType<typeof lineRequestTypedData>): Promise<Hex>;
};

export async function signLineRequest(
    request: LineRequest,
    chainId: number,
    signer: LineRequestSigner,
): Promise<SignedLineRequest> {
    return {request, chainId, signature: await signer.signTypedData(lineRequestTypedData(request, chainId))};
}

const isBytes32 = (value: unknown): value is Hex => typeof value === "string" && isHex(value) && value.length === 66;

/** Every field is read before the signer is recovered. `now` is unix seconds. */
export async function verifyLineRequest(signed: unknown, now: number): Promise<LineRequestVerdict> {
    if (typeof signed !== "object" || signed === null) return {status: "malformed", reason: "no request"};
    const {request, chainId, signature} = signed as Partial<SignedLineRequest>; // each field is checked below
    if (typeof request !== "object" || request === null) return {status: "malformed", reason: "no request"};
    if (typeof chainId !== "number" || !Number.isInteger(chainId)) return {status: "malformed", reason: "chainId"};
    if (typeof signature !== "string" || !isHex(signature)) return {status: "malformed", reason: "signature"};
    const {agent, agentRegistry, agentId, tool, domain, outcome, reason, nonce, expiresAt} = request;
    if (typeof agent !== "string" || !isAddress(agent)) return {status: "malformed", reason: "agent"};
    if (typeof agentRegistry !== "string" || typeof agentId !== "string") return {status: "malformed", reason: "agent reference"};
    if (!isBytes32(tool)) return {status: "malformed", reason: "tool"};
    if (typeof domain !== "string" || domain.length > LINE_MAX_DOMAIN_LENGTH) return {status: "malformed", reason: "domain"};
    if (!isUsageOutcome(outcome)) return {status: "malformed", reason: "outcome"};
    if (reason !== "" && !isUsageReason(reason)) return {status: "malformed", reason: "reason"};
    if (reason !== "" && outcome !== "failed") return {status: "malformed", reason: "a reason only follows a failure"};
    if (!isBytes32(nonce)) return {status: "malformed", reason: "nonce"};
    if (typeof expiresAt !== "number" || !Number.isInteger(expiresAt)) return {status: "malformed", reason: "expiresAt"};
    if (expiresAt <= now) return {status: "expired", expiresAt};
    if (expiresAt > now + LINE_MAX_TTL_SECONDS) return {status: "malformed", reason: "expires too far ahead"};
    let recovered: Address;
    try {
        recovered = await recoverTypedDataAddress({...lineRequestTypedData(request as LineRequest, chainId), signature}); // checked above
    } catch {
        return {status: "malformed", reason: "signature"};
    }
    const declared = getAddress(agent);
    return getAddress(recovered) === declared ? {status: "valid", address: declared} : {status: "mismatch", declared, recovered};
}
