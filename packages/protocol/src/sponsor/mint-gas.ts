import {getAddress, isAddress, isHex, recoverTypedDataAddress, type Address, type Hex} from "viem";

/**
 * What an address signs to ask ARP's sponsoring service for the gas of its own `register()` (ADR
 * `0110`, authenticated by ADR `0116`).
 *
 * "Address `address` asks for its mint gas, before `expiresAt`." The service sends the gas to the
 * address that signed, and to no other: until ADR `0116` the route took a bare address, so anyone
 * could spend the day's cap of new agents on addresses nobody holds.
 *
 * **Nothing on chain checks this signature**, so the domain has no `verifyingContract`, as in
 * `request.ts`. The domain's `chainId` is the chain the gas is sent on. The service spends each
 * `nonce` once, in its ledger, and refuses an `expiresAt` more than {@link MINT_GAS_MAX_TTL_SECONDS}
 * ahead, so a signed request does not stay usable for long.
 */
export const MINT_GAS_REQUEST_TYPES = {
    MintGasRequest: [
        {name: "address", type: "address"},
        {name: "nonce", type: "bytes32"},
        {name: "expiresAt", type: "uint256"},
    ],
} as const;

/** The longest a signed mint-gas request may stay usable, in seconds. */
export const MINT_GAS_MAX_TTL_SECONDS = 3_600;

export type MintGasRequest = {
    /** The address that will send `register()`, and the one that receives the gas. */
    address: Address;
    nonce: Hex;
    /** Unix seconds. */
    expiresAt: number;
};

export type SignedMintGasRequest = {request: MintGasRequest; chainId: number; signature: Hex};

export type MintGasRequestVerdict =
    | {status: "valid"; address: Address}
    | {status: "mismatch"; declared: Address; recovered: Address}
    | {status: "expired"; expiresAt: number}
    | {status: "malformed"; reason: string};

export function mintGasRequestTypedData(request: MintGasRequest, chainId: number) {
    return {
        domain: {name: "ARP Mint Gas Request", version: "1", chainId} as const,
        types: MINT_GAS_REQUEST_TYPES,
        primaryType: "MintGasRequest" as const,
        message: {
            address: request.address,
            nonce: request.nonce,
            expiresAt: BigInt(request.expiresAt),
        },
    };
}

/** Signs a typed-data block. The caller's runtime supplies one; this module never sees a key. */
export type MintGasRequestSigner = {
    signTypedData(data: ReturnType<typeof mintGasRequestTypedData>): Promise<Hex>;
};

export async function signMintGasRequest(
    request: MintGasRequest,
    chainId: number,
    signer: MintGasRequestSigner,
): Promise<SignedMintGasRequest> {
    return {request, chainId, signature: await signer.signTypedData(mintGasRequestTypedData(request, chainId))};
}

/** Recover the signer and compare it to the address the request names. `now` is unix seconds. */
export async function verifyMintGasRequest(
    signed: unknown,
    now: number,
): Promise<MintGasRequestVerdict> {
    if (typeof signed !== "object" || signed === null) return {status: "malformed", reason: "no request"};
    // Each field is checked below before it is used.
    const {request, chainId, signature} = signed as Partial<SignedMintGasRequest>;
    if (typeof request !== "object" || request === null) return {status: "malformed", reason: "no request"};
    if (typeof request.address !== "string" || !isAddress(request.address))
        return {status: "malformed", reason: "address is not an address"};
    if (typeof request.nonce !== "string" || !isHex(request.nonce) || request.nonce.length !== 66)
        return {status: "malformed", reason: "nonce is not bytes32"};
    if (!Number.isInteger(request.expiresAt) || request.expiresAt < 0)
        return {status: "malformed", reason: "expiresAt is not a unix timestamp"};
    if (typeof chainId !== "number" || !Number.isInteger(chainId) || chainId <= 0)
        return {status: "malformed", reason: "chainId is not a chain id"};
    if (typeof signature !== "string" || !isHex(signature))
        return {status: "malformed", reason: "signature is not hex"};
    if (request.expiresAt <= now) return {status: "expired", expiresAt: request.expiresAt};
    if (request.expiresAt > now + MINT_GAS_MAX_TTL_SECONDS)
        return {status: "malformed", reason: `expiresAt is more than ${MINT_GAS_MAX_TTL_SECONDS} s ahead`};

    const declared = getAddress(request.address);
    let recovered: Address;
    try {
        recovered = await recoverTypedDataAddress({...mintGasRequestTypedData(request, chainId), signature});
    } catch (error) {
        return {status: "malformed", reason: error instanceof Error ? error.message : String(error)};
    }
    if (recovered !== declared) return {status: "mismatch", declared, recovered};
    return {status: "valid", address: recovered};
}
