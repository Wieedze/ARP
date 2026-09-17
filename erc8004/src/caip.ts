import {getAddress, isAddress, type Address} from "viem";

import type {AgentRef, ResolvedAgentRef} from "./types.js";

/**
 * The ERC-8004 Identity Registry. Deployed at the same address on Base (8453),
 * BSC (56) and Ethereum (1) — confirmed by identical proxy bytecode at this
 * address on all three, 2026-09-16.
 */
export const DEFAULT_IDENTITY_REGISTRY: Address = "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432";

/**
 * Fills in the default registry and normalises the address to its checksummed
 * form — the form the identity object atoms are named with, so a lowercase
 * registry in a caller's ref must not silently miss.
 */
export function resolveRef(ref: AgentRef): ResolvedAgentRef {
    const registry = ref.registry ?? DEFAULT_IDENTITY_REGISTRY;
    if (!isAddress(registry)) {
        throw new TypeError(`registry is not an address: ${registry}`);
    }
    if (!/^\d+$/.test(ref.tokenId)) {
        throw new TypeError(`tokenId must be a decimal string: ${ref.tokenId}`);
    }
    if (!Number.isInteger(ref.chainId) || ref.chainId <= 0) {
        throw new TypeError(`chainId must be a positive integer: ${String(ref.chainId)}`);
    }
    return {chainId: ref.chainId, tokenId: ref.tokenId, registry: getAddress(registry)};
}

/** `eip155:{chainId}/erc721:{registry}/{tokenId}` — the cross-source join key. */
export function toCaip19(ref: AgentRef | ResolvedAgentRef): string {
    const resolved = resolveRef(ref);
    return `eip155:${resolved.chainId}/erc721:${resolved.registry}/${resolved.tokenId}`;
}

/** Inverse of `toCaip19`. Returns null for anything that is not an ERC-721 CAIP-19 asset id. */
export function parseCaip19(caip19: string): ResolvedAgentRef | null {
    const match = /^eip155:(\d+)\/erc721:(0x[0-9a-fA-F]{40})\/(\d+)$/.exec(caip19);
    if (match === null) return null;
    const [, chainId, registry, tokenId] = match;
    if (chainId === undefined || registry === undefined || tokenId === undefined) return null;
    return {
        chainId: Number(chainId),
        tokenId,
        // Checked by the regex above.
        registry: getAddress(registry as Address),
    };
}
