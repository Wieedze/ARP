import {useCallback, useMemo, useState, type ReactNode} from "react";

import {
    ChainChoiceContext,
    CHAIN_STORAGE_KEY,
    choiceFor,
    readStored,
} from "./chain-choice";

/**
 * Holds which chain the page reads from. The logic, the types and the hooks are in
 * `chain-choice.ts` — a file that exports both a component and a hook breaks fast refresh, and the
 * lint rule that says so is the only thing that catches it.
 */
export function ChainChoiceProvider({children}: {children: ReactNode}) {

    const [isMainnet, setIsMainnet] = useState(readStored);

    const setMainnet = useCallback((next: boolean) => {
        setIsMainnet(next);
        try {
            localStorage.setItem(CHAIN_STORAGE_KEY, next ? "mainnet" : "testnet");
        } catch {
            // The choice still applies to this session; it just will not survive a reload.
        }
    }, []);

    const value = useMemo(
        () => ({choice: choiceFor(isMainnet), setMainnet}),
        [isMainnet, setMainnet],
    );
    return <ChainChoiceContext.Provider value={value}>{children}</ChainChoiceContext.Provider>;
}

