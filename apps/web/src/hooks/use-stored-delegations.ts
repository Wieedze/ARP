import {useCallback, useMemo, useState} from "react";
import {type Address} from "viem";
import {type Delegation} from "@metamask/smart-accounts-kit";

import {
    appendStoredDelegation,
    readStoredDelegations,
    type StorageLike,
    type StoredDelegation,
} from "../services/delegation-store";

/**
 * The signed delegations this browser holds for one Smart Account, newest first.
 *
 * A signed delegation is bytes: the EIP-712 struct naming a delegate and its caveats. Reading it
 * does not let anyone act, because redeeming needs the delegate's key, so `localStorage` is an
 * acceptable place for it. It is the only place today: publishing them (task 37) is not built, so
 * another browser does not see them.
 */
function browserStorage(): StorageLike | null {
    try {
        return typeof localStorage === "undefined" ? null : localStorage;
    } catch {
        // Some browsers throw on the property access itself when site data is blocked.
        return null;
    }
}

export function useStoredDelegations(smartAccount: Address | undefined) {
    // `version` re-reads storage after a write; the address re-keys it.
    const [version, setVersion] = useState(0);
    const list = useMemo<StoredDelegation[]>(() => {
        const storage = browserStorage();
        if (smartAccount === undefined || storage === null) return [];
        return readStoredDelegations(storage, smartAccount);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [smartAccount, version]);

    const add = useCallback(
        (delegation: Delegation) => {
            const storage = browserStorage();
            if (smartAccount === undefined || storage === null) {
                throw new Error("This browser cannot store the permission, so it was not kept.");
            }
            appendStoredDelegation(storage, smartAccount, {
                delegation,
                signedAt: Math.floor(Date.now() / 1000),
            });
            setVersion((v) => v + 1);
        },
        [smartAccount],
    );

    return {list, add};
}
