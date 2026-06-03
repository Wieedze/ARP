import {useCallback, useMemo, useState} from "react";
import {type Address} from "viem";
import {type Delegation} from "@metamask/smart-accounts-kit";

import {
    deserializeDelegation,
    serializeDelegation,
} from "../services/delegation";

/**
 * Persist the operator's two signed ARP delegations (publish + compose)
 * client-side, keyed by Smart Account address.
 *
 * A signed delegation is bytes — the EIP-712-signed struct that names a
 * specific delegate (the runtime EOA) and specific caveats. Reading the
 * blob does not let an attacker act: they need the runtime private key
 * to redeem. So `localStorage` is an acceptable substrate for the
 * hackathon scope. The operator copies the blobs into `.env` for the
 * headless runtime; the browser keeps them only to show "delegations
 * active" on subsequent visits.
 *
 * Keying by SA address means switching SAs (e.g., a different deploySalt)
 * gets its own pair without collision.
 */

type StoredDelegations = {
    publish: Delegation;
    compose: Delegation;
    signedAt: number;
};

const STORAGE_PREFIX = "arp.delegations.v1";

function storageKey(saAddress: Address): string {
    return `${STORAGE_PREFIX}.${saAddress.toLowerCase()}`;
}

function readFromStorage(saAddress: Address): StoredDelegations | null {
    if (typeof localStorage === "undefined") return null;
    const raw = localStorage.getItem(storageKey(saAddress));
    if (!raw) return null;
    try {
        const parsed = JSON.parse(raw) as {
            publish: string;
            compose: string;
            signedAt: number;
        };
        return {
            publish: deserializeDelegation(parsed.publish),
            compose: deserializeDelegation(parsed.compose),
            signedAt: parsed.signedAt,
        };
    } catch {
        // Corrupt blob — drop it so the operator can re-sign cleanly.
        localStorage.removeItem(storageKey(saAddress));
        return null;
    }
}

function writeToStorage(saAddress: Address, value: StoredDelegations): void {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(
        storageKey(saAddress),
        JSON.stringify({
            publish: serializeDelegation(value.publish),
            compose: serializeDelegation(value.compose),
            signedAt: value.signedAt,
        }),
    );
}

/**
 * Read + manage the operator's stored delegations for the given Smart
 * Account. Returns `null` until the operator has signed both delegations
 * for this SA.
 *
 * `set` overwrites; `clear` removes (useful if the operator wants to
 * re-sign with different caveats).
 */
export function useStoredDelegations(saAddress: Address | undefined) {
    // External-store pattern: `version` is bumped whenever we mutate storage,
    // forcing the memo to re-read. The `saAddress` change also re-keys the
    // memo — both swap of SAs and explicit `set`/`clear` flow through here.
    const [version, setVersion] = useState(0);
    const stored = useMemo<StoredDelegations | null>(() => {
        if (!saAddress) return null;
        return readFromStorage(saAddress);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [saAddress, version]);

    const set = useCallback(
        (publish: Delegation, compose: Delegation) => {
            if (!saAddress) {
                throw new Error("useStoredDelegations.set: no SA address bound");
            }
            const next: StoredDelegations = {
                publish,
                compose,
                signedAt: Math.floor(Date.now() / 1000),
            };
            writeToStorage(saAddress, next);
            setVersion((v) => v + 1);
        },
        [saAddress],
    );

    const clear = useCallback(() => {
        if (!saAddress) return;
        if (typeof localStorage !== "undefined") {
            localStorage.removeItem(storageKey(saAddress));
        }
        setVersion((v) => v + 1);
    }, [saAddress]);

    return {stored, set, clear};
}
