import {useCallback} from "react";
import type {Hex} from "viem";

import {intuitionMainnetClient} from "../lib/intuition-mainnet";
import {ERC8004_GRAPHQL_URL} from "../services/erc8004-connector";
import {
    planToolRegistration,
    submitToolRegistration,
    type ToolRegistration,
} from "../services/tool-register";
import {connectedWalletClient} from "./wallet-client";

/**
 * The two actions the register screen performs, kept out of the page.
 *
 * Callbacks only, nothing on mount. The read is free and still the operator's to trigger; the write
 * moves real TRUST on Intuition mainnet. Same shape and same reason as `useAgentImport` — a mutation
 * carries retry semantics, and a retry that resubmits is the thing to avoid on a surface like this
 * (ADR `0017` safeguard 5).
 */
export function useToolRegister() {
    const plan = useCallback(
        (url: string): Promise<ToolRegistration> =>
            planToolRegistration({
                url,
                publicClient: intuitionMainnetClient,
                graphqlUrl: ERC8004_GRAPHQL_URL,
            }),
        [],
    );

    const submit = useCallback(async (registration: ToolRegistration): Promise<Hex> => {
        const walletClient = await connectedWalletClient();
        return submitToolRegistration({
            walletClient,
            publicClient: intuitionMainnetClient,
            registration,
        });
    }, []);

    return {plan, submit};
}
