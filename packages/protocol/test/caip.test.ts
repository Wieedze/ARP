import {describe, expect, it} from "vitest";

import {DEFAULT_IDENTITY_REGISTRY, parseCaip19, resolveRef, toCaip19} from "../src/caip.js";

describe("resolveRef", () => {
    it("fills in the default ERC-8004 identity registry", () => {
        expect(resolveRef({chainId: 8453, tokenId: "2340"})).toEqual({
            chainId: 8453,
            tokenId: "2340",
            registry: DEFAULT_IDENTITY_REGISTRY,
        });
    });

    it("checksums a lowercase registry so the identity atom lookup still matches", () => {
        const resolved = resolveRef({
            chainId: 8453,
            tokenId: "2340",
            registry: "0x8004a169fb4a3325136eb29fa0ceb6d2e539a432",
        });
        expect(resolved.registry).toBe(DEFAULT_IDENTITY_REGISTRY);
    });

    it("rejects malformed refs at the boundary", () => {
        expect(() => resolveRef({chainId: 8453, tokenId: "2340", registry: "0xnope"})).toThrow(
            TypeError,
        );
        expect(() => resolveRef({chainId: 8453, tokenId: "two thousand"})).toThrow(TypeError);
        expect(() => resolveRef({chainId: 0, tokenId: "1"})).toThrow(TypeError);
        expect(() => resolveRef({chainId: 1.5, tokenId: "1"})).toThrow(TypeError);
    });
});

describe("toCaip19 / parseCaip19", () => {
    it("builds the exact string the identity object atoms are named with", () => {
        expect(toCaip19({chainId: 8453, tokenId: "2340"})).toBe(
            "eip155:8453/erc721:0x8004A169FB4a3325136EB29fA0ceB6D2e539a432/2340",
        );
    });

    it("round-trips", () => {
        const ref = {chainId: 56, tokenId: "17", registry: DEFAULT_IDENTITY_REGISTRY};
        expect(parseCaip19(toCaip19(ref))).toEqual(ref);
    });

    it("returns null for anything that is not an ERC-721 CAIP-19 asset id", () => {
        expect(parseCaip19("eip155:8453:0x8004A169FB4a3325136EB29fA0ceB6D2e539a432")).toBeNull();
        expect(parseCaip19("did:web:clawn.ch")).toBeNull();
        expect(parseCaip19("")).toBeNull();
    });
});
