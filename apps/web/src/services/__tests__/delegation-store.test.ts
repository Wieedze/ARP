import {type Delegation} from "@metamask/smart-accounts-kit";
import {describe, expect, it} from "vitest";
import {type Address, type Hex} from "viem";

import {
    appendStoredDelegation,
    delegationStorageKey,
    exportDelegation,
    readStoredDelegations,
    type StorageLike,
} from "../delegation-store";

const SA: Address = "0x00000000000000000000000000000000000000Aa";

function memoryStorage(initial: Record<string, string> = {}): StorageLike & {
    data: Map<string, string>;
} {
    const data = new Map(Object.entries(initial));
    return {
        data,
        getItem: (key) => data.get(key) ?? null,
        setItem: (key, value) => void data.set(key, value),
        removeItem: (key) => void data.delete(key),
    };
}

function delegation(signature: Hex): Delegation {
    return {
        delegate: "0x00000000000000000000000000000000000000d1",
        delegator: SA,
        authority: `0x${"f".repeat(64)}`,
        caveats: [],
        salt: "0x01",
        signature,
    };
}

describe("the delegation store", () => {
    it("keeps every signed delegation, newest first, instead of overwriting", () => {
        const storage = memoryStorage();
        appendStoredDelegation(storage, SA, {delegation: delegation("0xaa"), signedAt: 100});
        appendStoredDelegation(storage, SA, {delegation: delegation("0xbb"), signedAt: 200});

        const list = readStoredDelegations(storage, SA);
        expect(list.map((e) => e.delegation.signature)).toEqual(["0xbb", "0xaa"]);
    });

    it("does not list the same signature twice", () => {
        const storage = memoryStorage();
        appendStoredDelegation(storage, SA, {delegation: delegation("0xaa"), signedAt: 100});
        appendStoredDelegation(storage, SA, {delegation: delegation("0xaa"), signedAt: 300});
        expect(readStoredDelegations(storage, SA)).toHaveLength(1);
    });

    it("keys by Smart Account, case-insensitively", () => {
        const storage = memoryStorage();
        appendStoredDelegation(storage, SA, {delegation: delegation("0xaa"), signedAt: 1});
        expect(readStoredDelegations(storage, SA.toLowerCase() as Address)).toHaveLength(1);
        expect(delegationStorageKey(SA)).toBe(`arp.delegations.v3.${SA.toLowerCase()}`);
    });

    it("carries a v2 delegation into the list and removes the v2 key", () => {
        const v2Key = `arp.delegations.v2.${SA.toLowerCase()}`;
        const storage = memoryStorage({
            [v2Key]: JSON.stringify({
                compose: JSON.stringify(delegation("0xcc")),
                signedAt: 50,
            }),
        });
        const list = readStoredDelegations(storage, SA);
        expect(list.map((e) => e.delegation.signature)).toEqual(["0xcc"]);
        expect(storage.data.has(v2Key)).toBe(false);
        expect(readStoredDelegations(storage, SA)).toHaveLength(1);
    });

    it("drops malformed entries and corrupt JSON instead of throwing", () => {
        const storage = memoryStorage({
            [delegationStorageKey(SA)]: JSON.stringify([
                {delegation: delegation("0xaa"), signedAt: 1},
                {delegation: {delegate: 1}, signedAt: 2},
                "nonsense",
            ]),
        });
        expect(readStoredDelegations(storage, SA)).toHaveLength(1);

        const corrupt = memoryStorage({[delegationStorageKey(SA)]: "{not json"});
        expect(readStoredDelegations(corrupt, SA)).toEqual([]);
    });

    it("reads blocked storage as empty", () => {
        const blocked: StorageLike = {
            getItem: () => {
                throw new Error("SecurityError");
            },
            setItem: () => undefined,
            removeItem: () => undefined,
        };
        expect(readStoredDelegations(blocked, SA)).toEqual([]);
    });

    it("throws when storage refuses the write, so the page never claims it kept one", () => {
        const full: StorageLike = {
            getItem: () => null,
            setItem: () => {
                throw new Error("QuotaExceededError");
            },
            removeItem: () => undefined,
        };
        expect(() =>
            appendStoredDelegation(full, SA, {delegation: delegation("0xaa"), signedAt: 1}),
        ).toThrow("QuotaExceededError");
    });

    it("exports the signed struct as JSON a runtime can parse back", () => {
        const d = delegation("0xaa");
        expect(JSON.parse(exportDelegation(d))).toEqual(d);
    });
});
