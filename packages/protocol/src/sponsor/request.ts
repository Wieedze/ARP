import {getAddress, isAddress, isHex, recoverTypedDataAddress, type Address, type Hex} from "viem";

import {hireDigest} from "../hire-receipt.js";

/**
 * What an agent signs to ask ARP's sponsoring service for one deposit (ADR `0094` §3).
 *
 * "Agent `agent`, which is token `agentId` of `agentRegistry`, asks for a deposit on `termId`,
 * backed by the proof whose digest is `proof`, before `expiresAt`."
 *
 * **Nothing on chain checks this signature.** The deposit's on-chain link to the agent is the
 * `receiver`, and the service checks this request before it sends. So, as in `receipt.ts`, the
 * domain has no `verifyingContract`: naming one would imply a check that does not exist. The
 * domain's `chainId` is the chain the deposit is made on, so a testnet request does not verify as a
 * mainnet one.
 *
 * **The nonce is the proof.** The service sponsors one deposit per proof and keeps the record
 * (`apps/sponsor`), so `proof` already makes the request single-use. `nonce` is still here so an
 * agent can ask twice about one proof after a refusal without producing an identical signature.
 */
export const SPONSOR_REQUEST_VERSION = 1;

/** Field order is the struct's order, and changing it changes every hash. */
export const SPONSOR_REQUEST_TYPES = {
    SponsorRequest: [
        {name: "version", type: "uint256"},
        {name: "agent", type: "address"},
        {name: "agentRegistry", type: "string"},
        {name: "agentId", type: "uint256"},
        {name: "termId", type: "bytes32"},
        {name: "proof", type: "bytes32"},
        {name: "nonce", type: "bytes32"},
        {name: "expiresAt", type: "uint256"},
    ],
} as const;

export function sponsorRequestDomain(chainId: number) {
    return {name: "ARP Sponsor Request", version: "1", chainId} as const;
}

/** The request as it travels in JSON. The token id is a decimal string, never a number. */
export type SponsorRequest = {
    version: number;
    /** The agent's wallet: the `receiver` of the deposit and the owner of the ERC-8004 token. */
    agent: Address;
    /** `eip155:<chainId>:<identityRegistry>`, as ERC-8004 writes it. */
    agentRegistry: string;
    agentId: string;
    /** The `(agent, uses, tool)` triple to deposit on. */
    termId: Hex;
    /** {@link sponsorProofDigest} of the proof sent with the request. */
    proof: Hex;
    nonce: Hex;
    /** Unix seconds. */
    expiresAt: number;
};

export type SignedSponsorRequest = {
    request: SponsorRequest;
    chainId: number;
    signature: Hex;
};

export type SponsorRequestVerdict =
    | {status: "valid"; agent: Address}
    | {status: "mismatch"; declared: Address; recovered: Address}
    | {status: "expired"; expiresAt: number}
    | {status: "malformed"; reason: string};

/**
 * The digest that binds a request to the proof it travels with: `hireDigest` (keccak256 over RFC
 * 8785) of the proof as parsed JSON. Without it, one signed request could be replayed with any proof
 * the agent later finds.
 */
export function sponsorProofDigest(proof: unknown): Hex {
    return hireDigest(proof);
}

export function sponsorRequestTypedData(request: SponsorRequest, chainId: number) {
    return {
        domain: sponsorRequestDomain(chainId),
        types: SPONSOR_REQUEST_TYPES,
        primaryType: "SponsorRequest" as const,
        message: {
            version: BigInt(request.version),
            agent: request.agent,
            agentRegistry: request.agentRegistry,
            agentId: BigInt(request.agentId),
            termId: request.termId,
            proof: request.proof,
            nonce: request.nonce,
            expiresAt: BigInt(request.expiresAt),
        },
    };
}

/** Signs a typed-data block. The agent's runtime supplies one; this module never sees a key. */
export type SponsorRequestSigner = {
    signTypedData(data: ReturnType<typeof sponsorRequestTypedData>): Promise<Hex>;
};

export async function signSponsorRequest(
    request: SponsorRequest,
    chainId: number,
    signer: SponsorRequestSigner,
): Promise<SignedSponsorRequest> {
    return {
        request,
        chainId,
        signature: await signer.signTypedData(sponsorRequestTypedData(request, chainId)),
    };
}

const DECIMAL = /^(0|[1-9][0-9]*)$/;
const ERC8004_REGISTRY = /^eip155:[1-9][0-9]*:0x[0-9a-fA-F]{40}$/;

function malformed(reason: string): SponsorRequestVerdict {
    return {status: "malformed", reason};
}

function isBytes32(value: unknown): value is Hex {
    return typeof value === "string" && isHex(value) && value.length === 66;
}

/**
 * Recover the signer and compare it to the agent the request names. `now` is unix seconds.
 *
 * An EOA's signature only: an agent whose wallet is a smart account is refused as `mismatch`. ARP's
 * testnet agents are held by EOAs, and the delegation register (`delegation-register.ts`) is where
 * EIP-1271 is needed and handled.
 */
export async function verifySponsorRequest(
    signed: SignedSponsorRequest,
    now: number,
): Promise<SponsorRequestVerdict> {
    const {request, chainId, signature} = signed;
    if (typeof request !== "object" || request === null) return malformed("no request");
    if (request.version !== SPONSOR_REQUEST_VERSION)
        return malformed(`unknown version ${String(request.version)}`);
    if (typeof request.agent !== "string" || !isAddress(request.agent))
        return malformed("agent is not an address");
    if (typeof request.agentRegistry !== "string" || !ERC8004_REGISTRY.test(request.agentRegistry))
        return malformed("agentRegistry is not eip155:<chainId>:<address>");
    if (typeof request.agentId !== "string" || !DECIMAL.test(request.agentId))
        return malformed("agentId is not a decimal integer");
    for (const key of ["termId", "proof", "nonce"] as const) {
        if (!isBytes32(request[key])) return malformed(`${key} is not bytes32`);
    }
    if (!Number.isInteger(request.expiresAt) || request.expiresAt < 0)
        return malformed("expiresAt is not a unix timestamp");
    if (!Number.isInteger(chainId) || chainId <= 0) return malformed("chainId is not a chain id");
    if (typeof signature !== "string" || !isHex(signature))
        return malformed("signature is not hex");
    if (request.expiresAt <= now) return {status: "expired", expiresAt: request.expiresAt};

    const declared = getAddress(request.agent);
    let recovered: Address;
    try {
        recovered = await recoverTypedDataAddress({
            ...sponsorRequestTypedData(request, chainId),
            signature,
        });
    } catch (error) {
        return malformed(error instanceof Error ? error.message : String(error));
    }
    if (recovered !== declared) return {status: "mismatch", declared, recovered};
    return {status: "valid", agent: recovered};
}
