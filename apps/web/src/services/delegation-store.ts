import {type Delegation} from "@metamask/smart-accounts-kit";
import {isAddress, isHex, type Address} from "viem";

/**
 * The signed delegations this browser holds, one list per Smart Account, so `/account` can show
 * and revoke each one. A legacy `v2` single-delegation blob is carried into the list and removed.
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

/** One caveat as the framework signs it: an enforcer address, and hex terms and args. */
function isCaveat(value: unknown): boolean {
    if (typeof value !== "object" || value === null) return false;
    const caveat = value as Record<string, unknown>; // An object, checked above.
    return (
        typeof caveat.enforcer === "string" &&
        isAddress(caveat.enforcer, {strict: false}) &&
        isHex(caveat.terms) &&
        isHex(caveat.args)
    );
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
        Array.isArray(d.caveats) &&
        d.caveats.every(isCaveat)
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
        // A read never throws: if storage refuses the migrated list, the v2 key stays, and the
        // next read carries it again.
        try {
            writeList(storage, smartAccount, list);
            storage.removeItem(v2Key(smartAccount));
        } catch {
            // The list returned below still holds the legacy entry for this render.
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
