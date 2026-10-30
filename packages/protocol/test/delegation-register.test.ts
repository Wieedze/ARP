import {signDelegation} from "@metamask/smart-accounts-kit";
import {hashDelegation} from "@metamask/smart-accounts-kit/utils";
import {decodeFunctionData, stringToHex, verifyTypedData, type Address, type Hex} from "viem";
import {privateKeyToAccount} from "viem/accounts";
import {describe, expect, it} from "vitest";

import {multiVaultDeclareAbi, type MultiVaultReads} from "../src/declare/multivault.js";
import {
    caip10AccountUri,
    delegationDocument,
    delegationHash,
    parseDelegation,
    planPublishDelegation,
    PredicateMissingError,
    verifyDelegationSignature,
    type DelegationJson,
    type TypedDataVerifier,
} from "../src/delegation/register.js";

const DELEGATOR_KEY = `0x${"11".repeat(32)}` as const;
const DELEGATOR = privateKeyToAccount(DELEGATOR_KEY);
const DELEGATE = privateKeyToAccount(`0x${"22".repeat(32)}`);
const DOMAIN = {
    chainId: 13579,
    delegationManager: "0xdb9B1e94B5b69Df7e401DDbedE43491141047dB3" as Address,
};
const ROOT: Hex = "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";
const ENFORCER: Address = "0x99921C234d4Ca518DC58ba63ff9bfD2Cc9435f34";

async function signed(): Promise<DelegationJson> {
    const unsigned = {
        delegate: DELEGATE.address,
        delegator: DELEGATOR.address,
        authority: ROOT,
        caveats: [{enforcer: ENFORCER, terms: "0x1234" as Hex, args: "0x" as Hex}],
        salt: "0x07" as Hex,
        signature: "0x" as Hex,
    };
    const signature = await signDelegation({
        privateKey: DELEGATOR_KEY,
        delegation: unsigned,
        delegationManager: DOMAIN.delegationManager,
        chainId: DOMAIN.chainId,
    });
    return {...unsigned, signature};
}

/** EOA-only verification, local: what viem's client does before it reaches for EIP-1271. */
const localVerify: TypedDataVerifier = (args) => verifyTypedData(args);

describe("parseDelegation", () => {
    it("accepts a signed delegation and checksums its addresses", async () => {
        const d = await signed();
        const parsed = parseDelegation({...d, delegate: d.delegate.toLowerCase()});
        expect(parsed).toEqual(d);
    });

    it.each([
        [{}, "delegate is not an address"],
        [{caveats: []}, "a delegation without caveats is not published"],
        [{salt: 7}, "salt is not a uint256 in hex"],
        [{authority: "0x12"}, "authority is not bytes32"],
        [{caveats: [{enforcer: "nope", terms: "0x"}]}, "a caveat's enforcer is not an address"],
    ])("refuses %j", async (over, error) => {
        const base = (await signed()) as unknown as Record<string, unknown>;
        const value = Object.keys(over).length === 0 ? {} : {...base, ...over};
        expect(parseDelegation(value)).toEqual({error});
    });
});

describe("delegationHash", () => {
    it("is the hash the MetaMask kit computes", async () => {
        const d = await signed();
        expect(delegationHash(d)).toBe(hashDelegation(d));
    });
});

describe("verifyDelegationSignature", () => {
    it("is true for the delegator's own signature", async () => {
        expect(await verifyDelegationSignature(await signed(), DOMAIN, localVerify)).toBe(true);
    });

    it("is false once a caveat is tampered with", async () => {
        const d = await signed();
        const tampered = {...d, caveats: [{...d.caveats[0]!, terms: "0x9999" as Hex}]};
        expect(await verifyDelegationSignature(tampered, DOMAIN, localVerify)).toBe(false);
    });

    it("is false under another DelegationManager or chain", async () => {
        const d = await signed();
        expect(await verifyDelegationSignature(d, {...DOMAIN, chainId: 1155}, localVerify)).toBe(
            false,
        );
    });

    it("is false when the verifier throws", async () => {
        const throwing: TypedDataVerifier = async () => {
            throw new Error("rpc down");
        };
        expect(await verifyDelegationSignature(await signed(), DOMAIN, throwing)).toBe(false);
    });
});

describe("delegationDocument", () => {
    it("is one string whatever the key order the delegation arrived in", async () => {
        const d = await signed();
        const {signature, ...rest} = d;
        const reordered: DelegationJson = {signature, ...rest};
        expect(delegationDocument(reordered, DOMAIN)).toBe(delegationDocument(d, DOMAIN));
    });

    it("is a schema.org Thing carrying the struct and its hash", async () => {
        const d = await signed();
        const doc = JSON.parse(delegationDocument(d, DOMAIN)) as Record<string, unknown>;
        expect(doc).toMatchObject({
            "@context": "https://schema.org",
            "@type": "Thing",
            name: "ARP delegation",
            chainId: 13579,
            delegationHash: delegationHash(d),
            delegation: d,
        });
    });
});

describe("planPublishDelegation", () => {
    const DELEGATE_TO: Hex = `0x${"d1".repeat(32)}`;
    const IN_CONTEXT_OF: Hex = `0x${"c1".repeat(32)}`;
    const MILLI = 10n ** 15n;

    /** A chain on which the given terms exist. Ids are derived the way a test can read them back. */
    function reads(existing: Set<string>): MultiVaultReads {
        return {
            address: "0x2Ece8D4dEdcB9918A398528f3fa4688b1d2CAB91",
            chainId: 13579,
            atomId: async (data: Hex) => `0x${data.slice(2).padEnd(64, "0").slice(0, 64)}` as Hex,
            tripleId: async (s: Hex, p: Hex, o: Hex) =>
                `0x${s.slice(2, 22)}${p.slice(2, 22)}${o.slice(2, 26)}` as Hex,
            termExists: async (id: Hex) => existing.has(id),
            atomCost: async () => MILLI,
            tripleCost: async () => 2n * MILLI,
            minDeposit: async () => MILLI,
            previewAtomCreate: async () => ({
                shares: 1n,
                assetsAfterFixedFees: 1n,
                assetsAfterFees: 1n,
            }),
            previewTripleCreate: async () => ({
                shares: 1n,
                assetsAfterFixedFees: 1n,
                assetsAfterFees: 1n,
            }),
        } as unknown as MultiVaultReads; // The plan calls the eight members above; nothing else is reached.
    }

    it("creates the three atoms and two triples in execution order, each born with a position", async () => {
        const d = await signed();
        const plan = await planPublishDelegation({
            delegation: d,
            domain: DOMAIN,
            documentUri: "ipfs://bafydoc",
            predicates: {delegateTo: DELEGATE_TO, inContextOf: IN_CONTEXT_OF},
            reads: reads(new Set([DELEGATE_TO, IN_CONTEXT_OF])),
        });
        expect(plan.calls.map((c) => c.kind)).toEqual([
            "create-atom",
            "create-atom",
            "create-atom",
            "create-triple",
            "create-triple",
        ]);
        expect(plan.totalValue).toBe(3n * 2n * MILLI + 2n * 3n * MILLI);
        const first = decodeFunctionData({abi: multiVaultDeclareAbi, data: plan.calls[0]!.data});
        expect(first.args).toEqual([
            [stringToHex(caip10AccountUri(13579, DELEGATOR.address))],
            [2n * MILLI],
        ]);
        expect(plan.calls.every((c) => c.chainId === 13579)).toBe(true);
    });

    it("plans nothing when every term already exists", async () => {
        const d = await signed();
        const params = {
            delegation: d,
            domain: DOMAIN,
            documentUri: "ipfs://bafydoc",
            predicates: {delegateTo: DELEGATE_TO, inContextOf: IN_CONTEXT_OF},
        };
        const first = await planPublishDelegation({
            ...params,
            reads: reads(new Set([DELEGATE_TO, IN_CONTEXT_OF])),
        });
        const all = new Set([DELEGATE_TO, IN_CONTEXT_OF, ...Object.values(first.terms)]);
        const again = await planPublishDelegation({...params, reads: reads(all)});
        expect(again.calls).toEqual([]);
        expect(again.totalValue).toBe(0n);
        expect(again.terms).toEqual(first.terms);
    });

    it("refuses a predicate that is not on the chain, and a document that is not on IPFS", async () => {
        const d = await signed();
        const base = {
            delegation: d,
            domain: DOMAIN,
            predicates: {delegateTo: DELEGATE_TO, inContextOf: IN_CONTEXT_OF},
            reads: reads(new Set([DELEGATE_TO])),
        };
        await expect(
            planPublishDelegation({...base, documentUri: "ipfs://x"}),
        ).rejects.toBeInstanceOf(PredicateMissingError);
        await expect(planPublishDelegation({...base, documentUri: "https://x"})).rejects.toThrow(
            /ipfs/,
        );
    });
});
