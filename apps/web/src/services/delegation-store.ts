import {type Delegation} from "@metamask/smart-accounts-kit";
import {type Address} from "viem";

/**
 * The signed delegations this browser holds, one list per Smart Account.
 *
 * **It held one.** `v2` stored a single `compose` delegation per Smart Account and `set` overwrote
 * it, so signing a second delegation dropped the first from the only place that remembered it —
 * while the first stayed valid on chain, redeemable by its delegate, and now impossible to revoke
 * from this page. A list is the fix: `/account` shows one row per delegation and each can be revoked.
 *
 * A `v2` blob is read once, carried into the list and removed, so nobody signed before this change
 * loses a row.
 *
 * Storage is injected so the logic is testable without a DOM, and every access is wrapped: a
 * private window or blocked site data throws on access, and the page must still render.
 */
export type StoredDelegation = {delegation: Delegation; signedAt: number};

/** The slice of `Storage` used here. */
export type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const V2_PREFIX = "arp.delegations.v2";
const V3_PREFIX = "arp.delegations.v3";

export function delegationStorageKey(smartAccount: Address): string {
    return `${V3_PREFIX}.${smartAccount.toLowerCase()}`;
}

function v2Key(smartAccount: Address): string {
    return `${V2_PREFIX}.${smartAccount.toLowerCase()}`;
}

function isStored(value: unknown): value is StoredDelegation {
    if (typeof value !== "object" || value === null) return false;
    const entry = value as Record<string, unknown>; // An object, checked above.
    const d = entry.delegation as Record<string, unknown> | null | undefined; // Narrowed below.
    return (
        typeof entry.signedAt === "number" &&
        typeof d === "object" &&
        d !== null &&
        typeof d.delegate === "string" &&
        typeof d.delegator === "string" &&
        typeof d.signature === "string" &&
        Array.isArray(d.caveats)
    );
}

function safeGet(storage: StorageLike, key: string): string | null {
    try {
        return storage.getItem(key);
    } catch {
        // Blocked site data: nothing is readable, which is the same as nothing stored.
        return null;
    }
}

function migrateV2(storage: StorageLike, smartAccount: Address): StoredDelegation[] {
    const raw = safeGet(storage, v2Key(smartAccount));
    if (raw === null) return [];
    try {
        const parsed = JSON.parse(raw) as {compose?: unknown; signedAt?: unknown}; // Narrowed below.
        const delegation =
            typeof parsed.compose === "string" ? (JSON.parse(parsed.compose) as unknown) : null;
        const entry = {delegation, signedAt: parsed.signedAt};
        return isStored(entry) ? [entry] : [];
    } catch {
        return [];
    }
}

/** Newest first. Malformed entries are dropped rather than thrown on. */
export function readStoredDelegations(
    storage: StorageLike,
    smartAccount: Address,
): StoredDelegation[] {
    const raw = safeGet(storage, delegationStorageKey(smartAccount));
    let list: StoredDelegation[] = [];
    if (raw !== null) {
        try {
            const parsed: unknown = JSON.parse(raw);
            list = Array.isArray(parsed) ? parsed.filter(isStored) : [];
        } catch {
            list = [];
        }
    }
    const legacy = migrateV2(storage, smartAccount);
    if (legacy.length > 0) {
        const known = new Set(list.map((entry) => entry.delegation.signature));
        list = [...list, ...legacy.filter((entry) => !known.has(entry.delegation.signature))];
        writeList(storage, smartAccount, list);
        try {
            storage.removeItem(v2Key(smartAccount));
        } catch {
            // The list now holds it; a v2 key that cannot be removed is read and deduplicated again.
        }
    }
    return [...list].sort((a, b) => b.signedAt - a.signedAt);
}

function writeList(storage: StorageLike, smartAccount: Address, list: StoredDelegation[]): void {
    storage.setItem(delegationStorageKey(smartAccount), JSON.stringify(list));
}

/**
 * Adds a delegation to the list. Throws when storage refuses the write, because a signed delegation
 * the page says it kept but did not is a guard rail the operator can no longer see.
 */
export function appendStoredDelegation(
    storage: StorageLike,
    smartAccount: Address,
    entry: StoredDelegation,
): StoredDelegation[] {
    const list = readStoredDelegations(storage, smartAccount);
    const next = [
        entry,
        ...list.filter((e) => e.delegation.signature !== entry.delegation.signature),
    ];
    writeList(storage, smartAccount, next);
    return next;
}

/**
 * The signed struct as JSON, for whatever runtime redeems it. **Not an `.env` line**: `/rig` handed
 * out `DELEGATION_COMPOSE_JSON='…'`, and no program in this repo reads that variable (`grep -rn
 * DELEGATION_COMPOSE_JSON apps packages scripts skills` finds only this comment).
 */
export function exportDelegation(delegation: Delegation): string {
    return JSON.stringify(delegation, null, 2);
}
