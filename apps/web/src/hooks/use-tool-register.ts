import {useCallback} from "react";
import type {Hex} from "viem";

import {useChainChoice} from "../lib/chain-choice";
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
 * moves value. Same shape and same reason as `useAgentImport` — a mutation carries retry semantics,
 * and a retry that resubmits is the thing to avoid on a surface like this (ADR `0017`
 * safeguard 5).
 *
 * The toggle picks the chain at planning time only. The chain travels **on the registration**, and
 * the submit guards, simulates and waits against `registration.chain`, never the live toggle.
 */
export function useToolRegister() {
    const chain = useChainChoice();

    const plan = useCallback(
        (url: string): Promise<ToolRegistration> =>
            planToolRegistration({
                url,
                publicClient: chain.client,
                chain,
                graphqlUrl: chain.graphqlUrl,
            }),
        [chain],
    );

    const submit = useCallback(
        async (registration: ToolRegistration): Promise<Hex> => {
            const walletClient = await connectedWalletClient();
            return submitToolRegistration({
                walletClient,
                publicClient: registration.chain.client,
                registration,
            });
        },
        [],
    );

    return {plan, submit};
}
